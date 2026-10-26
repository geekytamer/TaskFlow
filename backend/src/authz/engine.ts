/**
 * Which engine decides access, and the pieces the server's gates share.
 *
 * PERMISSIONS_ENGINE (read once per process; createServer can override it):
 *   - legacy (default): today's company-role lists decide, exactly as before.
 *   - shadow: legacy still decides; the v2 answer is computed beside it and
 *     every disagreement is written to authz_divergence.
 *   - v2: the route's declared permission (route-registry.ts), asked of the
 *     person's effective permissions (evaluate.ts) with can(), decides.
 *
 * Locks that are not roles stay where they were (Ruling I): the route-level
 * module check in the auth middleware, the Academy lock in
 * requireCompanyAccess and the super-admin handling. The evaluator's own
 * module lock is additive.
 */
import type { DataStore } from '../data/store';
import { SCOPES, SENSITIVE_FIELDS, areaOf, isPermissionKey, type Scope } from './catalogue';
import { can, scopeOf } from './can';
import { TEMPLATE_KEYS } from './templates';
import type { Effective } from './evaluate';
import { RECORD_RULES, type RecordRuleName } from '../permissions/record-rules';

export const ENGINES = ['legacy', 'shadow', 'v2'] as const;
export type PermissionsEngine = (typeof ENGINES)[number];

/**
 * Parses PERMISSIONS_ENGINE. A typo throws rather than falling back: silently
 * defaulting could pick a more permissive engine than the operator meant.
 */
export function parseEngine(raw: string | undefined): PermissionsEngine {
  const value = (raw ?? '').trim() || 'legacy';
  if (!(ENGINES as readonly string[]).includes(value)) {
    throw new Error(`PERMISSIONS_ENGINE must be one of ${ENGINES.join(' | ')}, received "${raw}".`);
  }
  return value as PermissionsEngine;
}

let configured: PermissionsEngine | undefined;

/** The engine named by the environment, read once per process. */
export function configuredEngine(): PermissionsEngine {
  configured ??= parseEngine(process.env.PERMISSIONS_ENGINE);
  return configured;
}

export function scopeAtLeast(scope: Scope | null, min: Scope): boolean {
  return scope !== null && SCOPES.indexOf(scope) >= SCOPES.indexOf(min);
}

/** A declared permission that is a catalogue key (not public/self/per_record/...). */
export function catalogueKey(permission: string | undefined): string | undefined {
  return permission && isPermissionKey(permission) ? permission : undefined;
}

/**
 * The v2 answer to a record rule (permissions/record-rules.ts `v2`): the key
 * the rule became, at its minimum scope, or a sensitive-field switch. Where the
 * route itself is declared with one of the rule's keys, that key is asked (the
 * CRM_ALL_WRITE check inside DELETE /opportunities/:id asks crm.delete);
 * otherwise the rule's first key.
 */
export function ruleAllowsV2(
  eff: Effective,
  name: RecordRuleName,
  companyId: string,
  routeKey?: string,
  ctx: { amount?: number } = {},
): { allowed: boolean; key: string } {
  const v2 = RECORD_RULES[name].v2;
  if ('fields' in v2) {
    const fields = eff.byCompany.get(companyId)?.fields;
    return { allowed: v2.fields.every((f) => fields?.get(f)?.view === true), key: `field:${v2.fields[0]}` };
  }
  const key = routeKey && (v2.keys as readonly string[]).includes(routeKey) ? routeKey : v2.keys[0];
  // A limited key (invoices.override_credit) also checks the amount at stake.
  const withinLimit = ctx.amount === undefined || can(eff, key, { companyId, amount: ctx.amount }).allowed;
  return { allowed: scopeAtLeast(scopeOf(eff, key, companyId), v2.min) && withinLimit, key };
}

/**
 * Old notification permissions (store.listUserIdsWithPermission callers) →
 * the catalogue key and minimum scope that decide them under v2. Every caller's
 * permission string must be listed (tested); an unknown one notifies nobody
 * under v2.
 */
export const NOTIFY_KEYS: Readonly<Record<string, { key: string; min: Scope }>> = {
  'contacts:read': { key: 'contacts.view', min: 'own' },
  'contacts:private.read': { key: 'contacts.view', min: 'company' },
  // Push-notification actions (reply from the lock screen): conversation writes.
  'contacts:write': { key: 'inbox.send', min: 'own' },
  'inventory:write': { key: 'inventory.manage_items', min: 'own' },
  'invoices:read': { key: 'invoices.view', min: 'own' },
  'vendor-bills:read': { key: 'vendor-bills.view', min: 'own' },
  'purchasing:approve': { key: 'purchasing.approve', min: 'own' },
};

/**
 * The names of the roles in a company that grant `key` (active, reviewed),
 * owner left out unless nobody else has it.
 */
export function rolesGranting(store: DataStore, companyId: string, key: string): string[] {
  let roles;
  try {
    roles = store.authz.listRoles(companyId);
  } catch {
    return [];
  }
  const rank = (key: string) => {
    const i = (TEMPLATE_KEYS as readonly string[]).indexOf(key);
    return i < 0 ? TEMPLATE_KEYS.length : i;
  };
  // 'field:salary' — the roles that may change the sensitive field.
  const field = key.startsWith('field:') ? key.slice(6) : undefined;
  const grants = (r: (typeof roles)[number]) => (field
    ? r.fields.some((f) => f.key === field && f.edit)
    : r.grants.some((g) => g.key === key));
  // M-6: only roles someone holds; a group copy and a role of the same name once.
  const counts = store.authz.rolePeopleCounts(companyId);
  const granting = roles
    .filter((r) => r.isActive && !r.needsReview && grants(r) && (counts.get(r.id) ?? 0) > 0)
    .sort((a, b) => rank(a.key.replace(/^group:/, '')) - rank(b.key.replace(/^group:/, '')) || a.name.localeCompare(b.name));
  const named = granting.filter((r) => r.key !== 'owner' && r.key !== 'group:owner');
  const names = [...new Set((named.length ? named : granting).map((r) => r.name))];
  if (names.length <= MAX_ASK) return names;
  // At most three names, then "or an Admin".
  const admin = roles.find((r) => r.isSystem && r.key === 'admin')?.name ?? 'Admin';
  const shown = names.filter((n) => n !== admin).slice(0, MAX_ASK);
  return [...shown, admin];
}

/** How many role names a refusal lists before "or an Admin" (M-6). */
const MAX_ASK = 3;

/** 'field:<sensitive field>' — the permission named when a sensitive-field write is refused. */
const isFieldKey = (key: string) => key.startsWith('field:') && SENSITIVE_FIELDS.some((f) => `field:${f.key}` === key);

const LEGACY_FORBIDDEN = 'You do not have permission to perform this action.';

/** "Ask an Admin or Manager." — who in the company can grant a refused permission. */
export function askSentence(roleNames: readonly string[]): string {
  if (roleNames.length === 0) return 'Nobody in this company has this permission yet. Ask an administrator to grant it.';
  const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');
  const last = roleNames[roleNames.length - 1];
  // Past three names the last is "an Admin", said with its own article (M-6).
  const tail = roleNames.length > MAX_ASK ? `${article(last)} ${last}` : last;
  const list = roleNames.length === 1 ? roleNames[0] : `${roleNames.slice(0, -1).join(', ')} or ${tail}`;
  return `Ask ${article(roleNames[0])} ${list}.`;
}

/**
 * The 403 body for a refused permission: `{ code, permission, message }`.
 * Under legacy and shadow the message stays today's sentence; under v2 it
 * names who can grant it, and `roles` lists those role names for clients
 * that build their own sentence (the staff app translates it).
 */
export function forbiddenBody(
  store: DataStore,
  engine: PermissionsEngine,
  companyId: string,
  key: string | undefined,
): { message: string; details: { code: 'FORBIDDEN'; permission: string | null; roles?: string[] } } {
  if (engine === 'v2' && key && (isPermissionKey(key) || isFieldKey(key))) {
    const roles = rolesGranting(store, companyId, key);
    return { message: askSentence(roles), details: { code: 'FORBIDDEN', permission: key, roles } };
  }
  return { message: LEGACY_FORBIDDEN, details: { code: 'FORBIDDEN', permission: key ?? null } };
}

/** Splits a catalogue key into the authz_divergence module/action columns. */
export function divergenceColumns(key: string): { module: string; action: string } {
  if (key.startsWith('field:')) return { module: 'field', action: key.slice(6) };
  const area = areaOf(key);
  return { module: area, action: key.slice(area.length + 1) };
}

const DEDUPE_MS = 60 * 60 * 1000;
const DEDUPE_LIMIT = 10_000;
const seen = new WeakMap<DataStore, Map<string, number>>();

/**
 * Writes one shadow disagreement, at most once an hour per user, company,
 * route and key, so a busy screen cannot flood the table.
 */
export function recordShadowDivergence(
  store: DataStore,
  entry: {
    userId: string; companyId: string; key: string; route: string; legacyAllowed: boolean; newAllowed: boolean;
    /** 'scope': a read filter (visible()) would show a different set: both scopes are logged. */
    kind?: 'access' | 'scope'; legacyScope?: Scope | null; newScope?: Scope | null;
  },
  now = Date.now(),
): void {
  if (entry.kind === 'scope' ? entry.legacyScope === entry.newScope : entry.legacyAllowed === entry.newAllowed) return;
  let recent = seen.get(store);
  if (!recent) seen.set(store, (recent = new Map()));
  const id = `${entry.kind ?? 'access'}|${entry.userId}|${entry.companyId}|${entry.route}|${entry.key}|${entry.legacyAllowed}|${entry.legacyScope ?? ''}|${entry.newScope ?? ''}`;
  const at = recent.get(id);
  if (at !== undefined && now - at < DEDUPE_MS) return;
  // Oldest first (Map keeps insertion order; a refreshed entry moves to the end).
  recent.delete(id);
  while (recent.size >= DEDUPE_LIMIT) recent.delete(recent.keys().next().value as string);
  recent.set(id, now);
  store.recordAuthzDivergence({
    userId: entry.userId,
    companyId: entry.companyId,
    ...divergenceColumns(entry.key),
    route: entry.route,
    legacyAllowed: entry.legacyAllowed,
    newAllowed: entry.newAllowed,
    ...(entry.kind === 'scope' ? { kind: 'scope' as const, legacyScope: entry.legacyScope ?? null, newScope: entry.newScope ?? null } : {}),
  });
}
