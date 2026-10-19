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
 * Group admin is not a company role, so these routes are declared
 * 'per_record' in route-registry.ts and decided here, on the group.
 */
import type { Express } from 'express';
import { HttpError } from '../http';
import type { RouteContext } from '../routes/context';
import { handler, type AuthedRequest } from '../routes/shared';
import type { TemplateField, TemplateGrant } from './templates';

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
  const { store, authMiddleware, requireSuperAdmin } = ctx;

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

  const detail = (groupId: string) => {
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
    res.json(detail(req.params.id));
  }));

  app.delete('/holding-groups/:id/companies/:companyId', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const group = loadGroup(req.params.id);
    if (!group.companyIds.includes(req.params.companyId)) throw new HttpError(404, 'That company is not in this group.');
    run(() => store.authz.detachCompany(req.params.companyId, req.user!.id));
    res.json(detail(req.params.id));
  }));

  app.get('/holding-groups/:id', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    res.json(detail(req.params.id));
  }));

  app.put('/holding-groups/:id/admins', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    const userIds = stringList(body(req).userIds, 'userIds');
    const missing = userIds.find((id) => !store.getUserById(id));
    if (missing) throw new HttpError(400, `User ${missing} not found.`);
    run(() => store.authz.setHoldingAdmins(req.params.id, userIds, req.user!.id));
    res.json(detail(req.params.id));
  }));

  app.put('/holding-groups/:id/assignments/:userId', authMiddleware, handler((req, res) => {
    requireGroupAdmin(req, req.params.id);
    if (!store.getUserById(req.params.userId)) throw new HttpError(404, 'User not found.');
    const b = body(req);
    const roleKey = optionalText(b.roleKey, 'roleKey') || null;
    run(() => store.authz.setHoldingAssignment(req.params.id, req.params.userId, {
      mainRoleKey: roleKey,
      addOnRoleKeys: stringList(b.addOnKeys, 'addOnKeys'),
      startsAt: optionalText(b.startsAt, 'startsAt') ?? null,
      endsAt: optionalText(b.endsAt, 'endsAt') ?? null,
    }, req.user!.id));
    res.json(detail(req.params.id));
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
    res.json(run(() => store.authz.pushHoldingTemplate(req.params.id, req.params.key, req.user!.id)));
  }));
}
