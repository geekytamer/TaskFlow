/**
 * Effective permissions: what one person may do, per company, and why.
 *
 * `effective` (v2) unions every assignment that counts right now:
 *   - direct assignments (main, add-on, temporary = has an end date), counted
 *     only when active and their role does not need review (Ruling G), and
 *     only inside startsAt ≤ now < endsAt (null = open);
 *   - group assignments (holding_group_assignments), expanded at read time to
 *     every company whose holdingGroupId matches — so a company attached later
 *     is covered with no write (Ruling H). In each company the key resolves to
 *     that company's role with the same key; failing that, the group-level role
 *     row (companyId NULL); failing that, the system template of that key. A
 *     role found but needing review grants nothing.
 * Union: widest scope wins (own < team < company < group); highest limit wins
 * and no limit beats any number; field view/edit are OR-ed. Every grant keeps
 * the roles it came from (`sources`) for explanations.
 *
 * `effectiveLegacy` is today's answer in the same shape (Ruling D): each
 * company's legacy role (users.companyRoles) read as its template, no add-ons,
 * no group assignments. Task 5–7 compare against it under legacy/shadow.
 *
 * Locks applied to both, after the union: a module the company switched off
 * removes the grants of every area that belongs to it (AREA_MODULES). Field
 * switches stay (a field can show in other modules' screens). Academy locks
 * are NOT applied here: they depend on mission progress, which does not move
 * authz_version, and they block only changes, per route module — the request
 * gate in server.ts (requireAcademyUnlocked) stays the one place they live.
 * Document locks (posted, closed period) belong to the record checks.
 *
 * Cached per user (500 at most, oldest out) against authz_version — which
 * every role, assignment, group, company-attach and module switch bumps — and
 * the next moment a time-bound assignment starts or ends.
 */
import type { DataStore } from '../data/store';
import { SCOPES, areaOf, type Scope } from './catalogue';
import { TEMPLATES, TEMPLATE_KEYS, type TemplateField, type TemplateGrant, type TemplateKey } from './templates';
import { teamOf } from './team';

export interface Source {
  kind: 'main' | 'addon' | 'holding' | 'temporary';
  roleId: string;
  roleName: string;
  until?: string;
}

export interface Grant { scope?: Scope; limit?: number; sources: Source[] }
export interface FieldGrant { view: boolean; edit: boolean; sources: Source[] }

export interface CompanyEffective {
  grants: Map<string, Grant>;
  fields: Map<string, FieldGrant>;
}

export interface Effective {
  userId: string;
  byCompany: Map<string, CompanyEffective>;
  /** The person's team line in a company (always read fresh from team.ts' own cache). */
  team(companyId: string): ReadonlySet<string>;
}

/**
 * The legacy module (permissions/catalogue MODULES key) each catalogue area
 * belongs to, for module switches. The module that owns most of the area's
 * routes in today's route map: deliveries and returns are sales records,
 * quality readings are inventory's, influencers are contacts. Areas no module
 * switch covers today are null. `settings` and `dashboard` never switch off.
 * Routes of a mixed area (a few logistics routes are gated by inventory)
 * keep their own module check at the route gate.
 */
export const AREA_MODULES: Readonly<Record<string, string | null>> = {
  dashboard: 'dashboard',
  sales: 'sales',
  purchasing: 'purchasing',
  inventory: 'inventory',
  manufacturing: 'manufacturing',
  logistics: 'sales',
  quality: 'inventory',
  projects: 'projects',
  tasks: 'tasks',
  documents: 'documents',
  invoices: 'invoices',
  'vendor-bills': 'vendor-bills',
  finance: 'finance',
  commissions: 'commissions',
  hr: 'hr',
  payroll: 'payroll',
  academy: null,
  crm: 'crm',
  contacts: 'contacts',
  influencers: 'contacts',
  campaigns: 'campaigns',
  portal: null,
  discover: null,
  games: null,
  inbox: null,
  whatsapp: 'whatsapp',
  settings: 'settings',
  people: 'settings',
};

export const CACHE_LIMIT = 500;

interface CacheEntry { version: number; generation: number; validFrom: number; validUntil: number; signature?: string; eff: Effective }
const caches = new WeakMap<DataStore, { v2: Map<string, CacheEntry>; legacy: Map<string, CacheEntry> }>();

function cacheFor(store: DataStore) {
  let c = caches.get(store);
  if (!c) caches.set(store, (c = { v2: new Map(), legacy: new Map() }));
  return c;
}

function remember(cache: Map<string, CacheEntry>, userId: string, entry: CacheEntry): void {
  cache.delete(userId);
  cache.set(userId, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) return;
    cache.delete(oldest.value);
  }
}

/** Bumped by clearEffectiveCache: entries from an older generation are ignored. */
let generation = 0;

/** Test seam: forget every cached answer. */
export function clearEffectiveCache(): void {
  generation += 1;
}

const rank = (scope: Scope) => SCOPES.indexOf(scope);
const time = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

class Builder {
  readonly byCompany = new Map<string, CompanyEffective>();

  company(companyId: string): CompanyEffective {
    let c = this.byCompany.get(companyId);
    if (!c) this.byCompany.set(companyId, (c = { grants: new Map(), fields: new Map() }));
    return c;
  }

  add(companyId: string, grants: readonly TemplateGrant[], fields: readonly TemplateField[], source: Source): void {
    const c = this.company(companyId);
    for (const g of grants) {
      const prev = c.grants.get(g.key);
      if (!prev) {
        c.grants.set(g.key, {
          ...(g.scope ? { scope: g.scope } : {}),
          ...(g.limit !== undefined && g.limit !== null ? { limit: g.limit } : {}),
          sources: [source],
        });
        continue;
      }
      if (g.scope && (!prev.scope || rank(g.scope) > rank(prev.scope))) prev.scope = g.scope;
      // Absent limit = unlimited; it wins over any number.
      if (prev.limit !== undefined) {
        if (g.limit === undefined || g.limit === null) delete prev.limit;
        else if (g.limit > prev.limit) prev.limit = g.limit;
      }
      prev.sources.push(source);
    }
    for (const f of fields) {
      if (!f.view && !f.edit) continue;
      const prev = c.fields.get(f.key);
      if (!prev) { c.fields.set(f.key, { view: f.view, edit: f.edit, sources: [source] }); continue; }
      prev.view ||= f.view;
      prev.edit ||= f.edit;
      prev.sources.push(source);
    }
  }

  /** Module switches: drop the grants of areas whose module the company turned off. */
  lock(store: DataStore): void {
    for (const [companyId, c] of this.byCompany) {
      const off = new Set(store.getDisabledModules(companyId));
      if (!off.size) continue;
      for (const key of [...c.grants.keys()]) {
        const mod = AREA_MODULES[areaOf(key)];
        if (mod && off.has(mod)) c.grants.delete(key);
      }
    }
  }

  done(store: DataStore, userId: string): Effective {
    this.lock(store);
    return { userId, byCompany: this.byCompany, team: (companyId) => teamOf(store, companyId, userId) };
  }
}

/** The v2 answer: every assignment that counts now, unioned, then locked. */
export function effective(store: DataStore, userId: string, options: { now?: Date } = {}): Effective {
  const now = (options.now ?? new Date()).getTime();
  const version = store.getAuthzVersion();
  const cache = cacheFor(store).v2;
  const hit = cache.get(userId);
  if (hit && hit.generation === generation && hit.version === version && hit.validFrom <= now && now < hit.validUntil) {
    remember(cache, userId, hit);
    return hit.eff;
  }

  const builder = new Builder();
  let validUntil = Infinity;
  // Only the window decides; a boundary still ahead ends the cache entry.
  const inWindow = (startsAt: string | null, endsAt: string | null) => {
    const start = time(startsAt);
    const end = time(endsAt);
    for (const t of [start, end]) if (!Number.isNaN(t) && t > now) validUntil = Math.min(validUntil, t);
    return (Number.isNaN(start) || start <= now) && (Number.isNaN(end) || now < end);
  };

  for (const a of store.authz.directAssignmentsFor(userId)) {
    if (!inWindow(a.startsAt, a.endsAt)) continue;
    const source: Source = a.endsAt
      ? { kind: 'temporary', roleId: a.roleId, roleName: a.roleName, until: a.endsAt }
      : { kind: a.isMain ? 'main' : 'addon', roleId: a.roleId, roleName: a.roleName };
    const { grants, fields } = store.authz.roleContent(a.roleId);
    builder.add(a.companyId, grants, fields, source);
  }

  for (const h of store.authz.holdingAssignmentsFor(userId)) {
    if (!inWindow(h.startsAt, h.endsAt)) continue;
    for (const companyId of h.companyIds) {
      const role = store.authz.holdingRoleFor(companyId, h.holdingGroupId, h.roleKey);
      let content: { grants: readonly TemplateGrant[]; fields: readonly TemplateField[] };
      let source: Source;
      if (role) {
        content = store.authz.roleContent(role.id);
        source = { kind: 'holding', roleId: role.id, roleName: role.name };
      } else if ((TEMPLATE_KEYS as readonly string[]).includes(h.roleKey)) {
        const template = TEMPLATES[h.roleKey as TemplateKey];
        content = template;
        source = { kind: 'holding', roleId: `template:${h.roleKey}`, roleName: template.label.en };
      } else {
        continue;
      }
      if (h.endsAt) source.until = h.endsAt;
      builder.add(companyId, content.grants, content.fields, source);
    }
  }

  const eff = builder.done(store, userId);
  remember(cache, userId, { version, generation, validFrom: now, validUntil, eff });
  return eff;
}

/** Today's answer in the v2 shape: each company's legacy role as its template, no add-ons. */
export function effectiveLegacy(store: DataStore, userId: string): Effective {
  const version = store.getAuthzVersion();
  const signature = store.authz.legacySignature(userId);
  const cache = cacheFor(store).legacy;
  const hit = cache.get(userId);
  if (hit && hit.generation === generation && hit.version === version && hit.signature === signature) {
    remember(cache, userId, hit);
    return hit.eff;
  }
  const builder = new Builder();
  for (const { companyId, key } of store.authz.legacyRolesFor(userId)) {
    const template = TEMPLATES[key];
    const row = store.authz.systemRole(companyId, key);
    builder.add(companyId, template.grants, template.fields, {
      kind: 'main', roleId: row?.id ?? `template:${key}`, roleName: row?.name ?? template.label.en,
    });
  }
  const eff = builder.done(store, userId);
  remember(cache, userId, { version, generation, validFrom: -Infinity, validUntil: Infinity, signature, eff });
  return eff;
}

