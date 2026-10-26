/**
 * Holding groups API (spec §2: independent companies; the group supplies
 * templates; group-wide people are assigned at group level through group
 * roles, read-only to the company).
 *
 * - Super admin: create/rename a group, attach/detach companies (a company
 *   belongs to at most one group; detaching ends group-wide access there at
 *   once).
 * - Group admins (holding_group_admins) or the super admin: read the group,
 *   set its admins, set a person's group-wide roles, edit the group's
 *   templates and push them to the companies.
 *
 * A group admin assigns group-wide roles only to people who belong to a
 * company of the group (Ruling O); the super admin to anyone.
 *
 * Bounded group admins (C-2): only the super admin appoints or removes group
 * admins. A group admin gives a group-wide role, saves a template or pushes
 * it only when all of it is within their own access in EVERY company of the
 * group (403 HIGHER_THAN_YOU naming the company), and never changes their own
 * group-wide roles.
 *
 * Group admin is not a company role, so these routes are declared
 * 'per_record' in route-registry.ts and decided here, on the group.
 */
import type { Express } from 'express';
import { HttpError } from '../http';
import type { RouteContext } from '../routes/context';
import { handler, type AuthedRequest } from '../routes/shared';
import type { TemplateField, TemplateGrant } from './templates';
import type { CompanyEffective } from './evaluate';
import { SCOPES, SENSITIVE_FIELDS } from './catalogue';
import { boundaryOf } from './dates';
import { roleGuards } from './guards';
import { validateRole } from './authz-store';

/** Store validation errors (plain Error) become 400; HttpErrors keep their status. */
function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(/not found/i.test(message) ? 404 : 400, message);
  }
}

const optionalText = (value: unknown, name: string): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  return value;
};

const body = (req: AuthedRequest): Record<string, unknown> => {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'body must be an object.');
  return b as Record<string, unknown>;
};

const stringList = (value: unknown, name: string): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new HttpError(400, `${name} must be a list of text.`);
  return value as string[];
};

export function registerHoldingRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireSuperAdmin, viewerOf, permissionsEngine } = ctx;
  const guards = roleGuards(store, permissionsEngine);

  /** C-2: content within the actor's own access in every company of the group (super admin exempt). */
  const requireWithinGroup = (req: AuthedRequest, groupId: string, grants: readonly TemplateGrant[], fields: readonly TemplateField[]) => {
    if (req.user!.isSuperAdmin) return;
    const eff = viewerOf(req);
    for (const companyId of loadGroup(groupId).companyIds) {
      guards.requireWithin(eff.byCompany.get(companyId), grants, fields, store.getCompanyById(companyId)?.name ?? companyId);
    }
  };

  /**
   * The actor's floor across the group's companies (what they hold in every
   * one: narrowest scope, lowest limit), so the screens disable what the
   * server would refuse. null = unbounded (super admin, or no companies yet).
   */
  const floorOf = (req: AuthedRequest, groupId: string) => {
    const companyIds = loadGroup(groupId).companyIds;
    if (req.user!.isSuperAdmin || !companyIds.length) return null;
    const eff = viewerOf(req);
    const all = companyIds.map((id) => eff.byCompany.get(id));
    const first: CompanyEffective | undefined = all[0];
    const grants: Array<{ key: string; scope?: string; limit?: number }> = [];
    for (const [key, g] of first?.grants ?? new Map()) {
      const each = all.map((c) => c?.grants.get(key));
      if (each.some((x) => !x)) continue;
      const scopes = each.map((x) => x!.scope).filter((x): x is NonNullable<typeof x> => Boolean(x));
      const scope = scopes.length ? scopes.reduce((a, b) => (SCOPES.indexOf(b) < SCOPES.indexOf(a) ? b : a)) : g.scope;
      const limits = each.map((x) => x!.limit).filter((x): x is number => x !== undefined);
      grants.push({ key, ...(scope ? { scope } : {}), ...(limits.length ? { limit: Math.min(...limits) } : {}) });
    }
    const fields = SENSITIVE_FIELDS.map(({ key }) => ({
      key,
      view: all.every((c) => Boolean(c?.fields.get(key)?.view)),
      edit: all.every((c) => Boolean(c?.fields.get(key)?.edit)),
    }));
    return { grants, fields };
  };

  /** Super admin, or an admin of this group. 403 before 404, so a group id cannot be probed. */
  const requireGroupAdmin = (req: AuthedRequest, groupId: string) => {
    const user = req.user!;
    if (!user.isSuperAdmin && !store.authz.isHoldingAdmin(groupId, user.id)) {
      throw new HttpError(403, 'Only an administrator of this group can do this.', { code: 'FORBIDDEN', permission: null });
    }
    const group = store.authz.holdingGroup(groupId);
    if (!group) throw new HttpError(404, 'Group not found.');
    return group;
  };

  const loadGroup = (groupId: string) => {
    const group = store.authz.holdingGroup(groupId);
    if (!group) throw new HttpError(404, 'Group not found.');
    return group;
  };

  const detail = (groupId: string, req?: AuthedRequest) => {
    const group = loadGroup(groupId);
    const person = (id: string) => {
      const u = store.getUserById(id);
      return { id, name: u?.name ?? null, email: u?.email ?? null };
    };
    return {
      ...group,
      companies: group.companyIds.map((id) => ({ id, name: store.getCompanyById(id)?.name ?? null })),
      admins: group.adminUserIds.map(person),
      assignments: store.authz.holdingAssignments(groupId).map((a) => ({ ...a, user: person(a.userId) })),
      templates: store.authz.holdingTemplates(groupId),
      ...(req ? {
        me: {
          userId: req.user!.id,
          superAdmin: Boolean(req.user!.isSuperAdmin),
          // Only the super admin appoints or removes group admins (C-2).
          canManageAdmins: Boolean(req.user!.isSuperAdmin),
          access: floorOf(req, groupId),
        },
      } : {}),
    };
  };

  app.get('/holding-groups', authMiddleware, handler((req, res) => {
    const user = req.user!;
    res.json(store.authz.holdingGroups().filter((g) => user.isSuperAdmin || g.adminUserIds.includes(user.id)));
  }));

  app.post('/holding-groups', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const b = body(req);
    const group = run(() => store.authz.createHoldingGroup(
      { name: String(b.name ?? ''), nameAr: optionalText(b.nameAr, 'nameAr') ?? null }, req.user!.id,
    ));
    res.status(201).json(group);
  }));

  app.put('/holding-groups/:id', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    loadGroup(req.params.id);
    const b = body(req);
    res.json(run(() => store.authz.updateHoldingGroup(req.params.id, {
      name: b.name === undefined ? undefined : String(b.name),
      nameAr: optionalText(b.nameAr, 'nameAr'),
    }, req.user!.id)));
  }));

  app.post('/holding-groups/:id/companies', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    loadGroup(req.params.id);
    const companyId = body(req).companyId;
    if (typeof companyId !== 'string' || !companyId) throw new HttpError(400, 'companyId is required.');
    run(() => store.authz.attachCompany(req.params.id, companyId, req.user!.id));
    res.json(detail(req.params.id, req));
  }));

  app.delete('/holding-groups/:id/companies/:companyId', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const group = loadGroup(req.params.id);
    if (!group.companyIds.includes(req.params.companyId)) throw new HttpError(404, 'That company is not in this group.');
    run(() => store.authz.detachCompany(req.params.companyId, req.user!.id));
    res.json(detail(req.params.id, req));
  }));

  app.get('/holding-groups/:id', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    res.json(detail(req.params.id, req));
  }));

  app.put('/holding-groups/:id/admins', authMiddleware, handler((req, res) => {
    // C-2: group admins are appointed and removed by the super admin only.
    requireSuperAdmin(req);
    loadGroup(req.params.id);
    const userIds = stringList(body(req).userIds, 'userIds');
    const missing = userIds.find((id) => !store.getUserById(id));
    if (missing) throw new HttpError(400, `User ${missing} not found.`);
    run(() => store.authz.setHoldingAdmins(req.params.id, userIds, req.user!.id));
    res.json(detail(req.params.id, req));
  }));

  /**
   * I-3: everyone who belongs to a company of the group, for the "add a
   * group-wide person" picker (group admins are often a member of one company
   * only, so the company user lists would show only theirs).
   */
  app.get('/holding-groups/:id/people', authMiddleware, handler((req, res) => {
    const group = requireGroupAdmin(req, req.params.id);
    const byId = new Map<string, { id: string; name: string | null; email: string | null; companies: Array<{ id: string; name: string | null }> }>();
    for (const companyId of group.companyIds) {
      const company = { id: companyId, name: store.getCompanyById(companyId)?.name ?? null };
      for (const u of store.listUsersByCompany(companyId)) {
        const entry = byId.get(u.id) ?? { id: u.id, name: u.name ?? null, email: u.email ?? null, companies: [] };
        entry.companies.push(company);
        byId.set(u.id, entry);
      }
    }
    res.json([...byId.values()].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
  }));

  app.put('/holding-groups/:id/assignments/:userId', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    if (!store.getUserById(req.params.userId)) throw new HttpError(404, 'User not found.');
    const b = body(req);
    const roleKey = optionalText(b.roleKey, 'roleKey') || null;
    const addOnKeys = stringList(b.addOnKeys, 'addOnKeys');
    // Ruling O: a group admin assigns only people of the group's companies
    // (removing someone is always allowed). The super admin is unrestricted.
    if (!req.user!.isSuperAdmin && (roleKey || addOnKeys.length) && !store.authz.isGroupMember(req.params.id, req.params.userId)) {
      throw new HttpError(403, 'Only people who belong to a company of this group can be given group-wide roles.', { code: 'FORBIDDEN', permission: null });
    }
    // C-2: never your own group-wide roles; only roles within your own access in every company.
    if (!req.user!.isSuperAdmin && req.params.userId === req.user!.id) {
      throw new HttpError(403, 'You can\'t change your own group-wide roles. Ask the platform administrator.', { code: 'SELF_ASSIGN' });
    }
    for (const key of [...new Set([roleKey, ...addOnKeys].filter((k): k is string => Boolean(k)))]) {
      const template = store.authz.holdingTemplate(req.params.id, key);
      if (!template) throw new HttpError(400, `Unknown group role: ${key}`);
      requireWithinGroup(req, req.params.id, template.grants, template.fields);
    }
    // M-2: an end date already past would leave the person with nothing, silently.
    const endsAt = optionalText(b.endsAt, 'endsAt') ?? null;
    if (endsAt && (roleKey || addOnKeys.length)) {
      const zones = loadGroup(req.params.id).companyIds.map((id) => store.authz.companyTimeZone(id));
      const ends = (zones.length ? zones : [undefined]).map((z) => boundaryOf(endsAt, 'end', z) as number);
      if (ends.every((t) => !Number.isNaN(t) && t <= Date.now())) {
        throw new HttpError(400, 'The end date is in the past. Choose today or a later date.', { code: 'PAST_DATE' });
      }
    }
    run(() => store.authz.setHoldingAssignment(req.params.id, req.params.userId, {
      mainRoleKey: roleKey,
      addOnRoleKeys: addOnKeys,
      startsAt: optionalText(b.startsAt, 'startsAt') ?? null,
      endsAt: optionalText(b.endsAt, 'endsAt') ?? null,
    }, req.user!.id));
    res.json(detail(req.params.id, req));
  }));

  app.get('/holding-groups/:id/templates/:key', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    const template = store.authz.holdingTemplate(req.params.id, req.params.key);
    if (!template) throw new HttpError(404, 'Template not found.');
    res.json(template);
  }));

  app.put('/holding-groups/:id/templates/:key', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    const b = body(req);
    if (!Array.isArray(b.grants) || !Array.isArray(b.fields)) throw new HttpError(400, 'grants and fields must be lists.');
    run(() => validateRole(b.grants as TemplateGrant[], b.fields as TemplateField[]));
    requireWithinGroup(req, req.params.id, b.grants as TemplateGrant[], b.fields as TemplateField[]);
    res.json(run(() => store.authz.saveHoldingTemplate(req.params.id, req.params.key, {
      name: String(b.name ?? ''),
      nameAr: optionalText(b.nameAr, 'nameAr') ?? null,
      description: optionalText(b.description, 'description') ?? null,
      grants: b.grants as TemplateGrant[],
      fields: b.fields as TemplateField[],
    }, req.user!.id)));
  }));

  app.post('/holding-groups/:id/templates/:key/push', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    const template = store.authz.holdingTemplate(req.params.id, req.params.key);
    if (!template) throw new HttpError(404, 'Template not found.');
    requireWithinGroup(req, req.params.id, template.grants, template.fields);
    res.json(run(() => store.authz.pushHoldingTemplate(req.params.id, req.params.key, req.user!.id)));
  }));
}
