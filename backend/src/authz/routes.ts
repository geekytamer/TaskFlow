/**
 * Roles, people and my-permissions API (spec §5; Task 9). Replaces
 * permissions/routes.ts once the frontend moves over (Tasks 10/11); the old
 * /auth/permissions and permission-groups routes keep working until then.
 *
 * - GET /me/permissions?companyId= — what I may do there, as the server
 *   decides it: legacy/shadow send the legacy-equivalent grants (Ruling D),
 *   v2 the real ones. Plus the locks that are not roles: switched-off modules,
 *   Academy locks and the super-admin bypass.
 * - GET /permissions/catalogue — areas, actions, scopes, limits, sensitive
 *   fields, en/ar labels and the level presets (authz/describe.ts).
 * - Roles: list (with people count), read, create, edit, delete, duplicate,
 *   activate (review of a converted role, Ruling E/G). Standard (system) roles
 *   are read-only and follow the templates (Ruling Q); group roles are
 *   read-only to the company (Task 8).
 * - People: list (main role, add-ons, temporary, group-wide, HR link, plain
 *   summary), one person with the reason for every grant, set roles.
 *
 * Gates: people.view_roles to read roles and people, people.manage_roles to
 * change them (legacy: GROUPS_READ = management roles, ADMINISTRATION =
 * Admin). The platform super admin manages any company. Nobody saves or
 * assigns a role giving more than they hold themselves (super admin exempt).
 * Company reach (Ruling M/P): under v2 people reached through a group
 * assignment count and are listed, read-only, "via group".
 */
import type { Express } from 'express';
import { HttpError } from '../http';
import type { RouteContext } from '../routes/context';
import { handler, type AuthedRequest } from '../routes/shared';
import type { SanitizedUser, UserRole } from '../types';
import { CATALOGUE, SCOPES, SENSITIVE_FIELDS, permissionKey } from './catalogue';
import { clearEffectiveCache, effective, effectiveLegacy, type CompanyEffective, type Effective } from './evaluate';
import { TEMPLATES, TEMPLATE_KEYS, type TemplateField, type TemplateGrant } from './templates';
import { SCOPE_LABELS, beyond, levelPresets, permissionLabel, summaryLines } from './describe';
import { validateRole, type RoleView } from './authz-store';
import { MODULES } from '../permissions/catalogue';
import { ALWAYS_ON_MODULES } from '../permissions/company-modules';

export interface AuthzRouteExtras {
  /** Academy-locked modules for this person in this company ([] when not enforced). */
  academyLocked: (user: SanitizedUser, companyId: string) => string[];
}

const MGMT: UserRole[] = ['Admin', 'Manager', 'Accountant'];
const ADMIN: UserRole[] = ['Admin'];
/** The legacy role a main role stands for (users.companyRoles follows it while legacy decides). */
const LEGACY_ROLE: Readonly<Record<string, UserRole>> = {
  owner: 'Admin', admin: 'Admin', manager: 'Manager', accountant: 'Accountant', employee: 'Employee',
};

/** Store validation errors (plain Error) become 400 (404 for "not found"); HttpErrors keep their status. */
function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(/not found/i.test(message) ? 404 : 400, message);
  }
}

const body = (req: AuthedRequest): Record<string, unknown> => {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'body must be an object.');
  return b as Record<string, unknown>;
};

const optionalText = (value: unknown, name: string): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  return value;
};

const stringList = (value: unknown, name: string): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new HttpError(400, `${name} must be a list of text.`);
  return value as string[];
};

const grantsOut = (company: CompanyEffective | undefined) =>
  [...(company?.grants ?? new Map()).entries()]
    .map(([key, g]) => ({ key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined ? { limit: g.limit } : {}) }))
    .sort((a, b) => a.key.localeCompare(b.key));

const fieldsOut = (company: CompanyEffective | undefined) =>
  SENSITIVE_FIELDS.map(({ key }) => {
    const f = company?.fields.get(key);
    return { key, view: Boolean(f?.view), edit: Boolean(f?.edit) };
  });

export function registerAuthzRoutes(app: Express, ctx: RouteContext, extras: AuthzRouteExtras): void {
  const { store, authMiddleware, permissionsEngine: engine, requireCompanyRoles, accessibleCompanyIds, viewerOf } = ctx;

  /** The Effective that answers for someone else, by the same rule as viewerOf (Ruling D). */
  const effectiveOf = (userId: string): Effective =>
    engine === 'v2' ? effective(store, userId) : effectiveLegacy(store, userId);

  const requireCompany = (companyId: string) => {
    if (!store.getCompanyById(companyId)) throw new HttpError(404, 'Company not found.');
  };

  /** people.view_roles / people.manage_roles in the company; the super admin manages any company. */
  const gate = (req: AuthedRequest, companyId: string, key: 'people.view_roles' | 'people.manage_roles') => {
    if (req.user!.isSuperAdmin) {
      requireCompany(companyId);
      return;
    }
    requireCompanyRoles(req, companyId, key === 'people.view_roles' ? MGMT : ADMIN, key);
  };

  /** No higher than me: 403 naming what the actor would give without holding it. */
  const requireWithin = (req: AuthedRequest, companyId: string, grants: readonly TemplateGrant[], fields: readonly TemplateField[]) => {
    run(() => validateRole(grants, fields));
    if (req.user!.isSuperAdmin) return;
    const missing = beyond(viewerOf(req).byCompany.get(companyId), grants, fields);
    if (!missing.length) return;
    throw new HttpError(
      403,
      `You can't give permissions you don't have yourself: ${missing.map((k) => permissionLabel(k).en).join('; ')}.`,
      { code: 'HIGHER_THAN_YOU', permission: missing[0], missing },
    );
  };

  const loadRole = (companyId: string, id: string): RoleView => {
    const role = store.authz.getRole(id);
    if (!role || role.companyId !== companyId) throw new HttpError(404, 'Role not found.');
    return role;
  };

  const roleOut = (role: RoleView, counts?: Map<string, number>) => ({
    ...role,
    kind: role.holdingGroupId ? 'group' : role.isSystem ? 'system' : 'custom',
    readOnly: Boolean(role.holdingGroupId || role.isSystem),
    peopleCount: (counts ?? store.authz.rolePeopleCounts(role.companyId!)).get(role.id) ?? 0,
  });

  // ── My permissions and the catalogue ────────────────────────────────

  app.get('/me/permissions', authMiddleware, handler((req, res) => {
    const user = req.user!;
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : '';
    if (!companyId) throw new HttpError(400, 'companyId is required.');
    const reaches = accessibleCompanyIds(user).includes(companyId);
    if (!reaches && !user.isSuperAdmin) throw new HttpError(403, 'You do not have access to this company.');
    requireCompany(companyId);
    const company = viewerOf(req).byCompany.get(companyId);
    res.json({
      engine,
      version: store.getAuthzVersion(),
      companyId,
      superAdmin: Boolean(user.isSuperAdmin),
      member: reaches,
      grants: grantsOut(company),
      fields: fieldsOut(company),
      disabledModules: store.getDisabledModules(companyId),
      academy: { lockedModules: extras.academyLocked(user, companyId) },
    });
  }));

  app.get('/permissions/catalogue', authMiddleware, handler((_req, res) => {
    res.json({
      scopes: SCOPES.map((key) => ({ key, label: SCOPE_LABELS[key] })),
      levels: ['none', 'view', 'edit', 'full', 'custom'],
      areas: CATALOGUE.map((area) => ({
        key: area.key,
        label: area.label,
        group: area.group,
        scopes: area.scopes ?? [],
        ownership: area.ownership ?? null,
        actions: area.actions.map((a) => ({
          key: permissionKey(area.key, a.key),
          action: a.key,
          label: a.label,
          scoped: Boolean(a.scoped),
          limit: a.limit ?? null,
        })),
        levels: levelPresets(area),
      })),
      fields: SENSITIVE_FIELDS.map((f) => ({ key: f.key, label: f.label, area: f.area })),
      templates: TEMPLATE_KEYS.map((key) => ({ key, label: TEMPLATES[key].label })),
      // Legacy module:action catalogue for today's permission-group screens
      // (removed with them, Tasks 11/12).
      modules: MODULES,
      alwaysOnModules: [...ALWAYS_ON_MODULES],
    });
  }));

  // ── Roles ──────────────────────────────────────────────────────────

  const roleInput = (req: AuthedRequest) => {
    const b = body(req);
    if (!Array.isArray(b.grants) || !Array.isArray(b.fields)) throw new HttpError(400, 'grants and fields must be lists.');
    return {
      name: String(b.name ?? ''),
      nameAr: optionalText(b.nameAr, 'nameAr') ?? null,
      description: optionalText(b.description, 'description') ?? null,
      templateKey: optionalText(b.templateKey, 'templateKey'),
      grants: b.grants as TemplateGrant[],
      fields: b.fields as TemplateField[],
    };
  };

  app.get('/companies/:companyId/roles', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    gate(req, companyId, 'people.view_roles');
    const counts = store.authz.rolePeopleCounts(companyId);
    res.json(store.authz.listRoles(companyId).map((r) => roleOut(r, counts)));
  }));

  app.post('/companies/:companyId/roles', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    gate(req, companyId, 'people.manage_roles');
    const input = roleInput(req);
    requireWithin(req, companyId, input.grants, input.fields);
    const role = run(() => store.authz.saveRole(companyId, { ...input, templateKey: input.templateKey ?? null }, req.user!.id));
    res.status(201).json(roleOut(role));
  }));

  app.get('/companies/:companyId/roles/:id', authMiddleware, handler((req, res) => {
    const { companyId, id } = req.params;
    gate(req, companyId, 'people.view_roles');
    const role = loadRole(companyId, id);
    const people = store.authz.roleHolders(id).map((h) => {
      const u = store.getUserById(h.userId);
      return { ...h, name: u?.name ?? null, email: u?.email ?? null };
    });
    res.json({ ...roleOut(role), people });
  }));

  app.put('/companies/:companyId/roles/:id', authMiddleware, handler((req, res) => {
    const { companyId, id } = req.params;
    gate(req, companyId, 'people.manage_roles');
    loadRole(companyId, id);
    const input = roleInput(req);
    requireWithin(req, companyId, input.grants, input.fields);
    res.json(roleOut(run(() => store.authz.saveRole(companyId, { ...input, id }, req.user!.id))));
  }));

  app.delete('/companies/:companyId/roles/:id', authMiddleware, handler((req, res) => {
    const { companyId, id } = req.params;
    gate(req, companyId, 'people.manage_roles');
    loadRole(companyId, id);
    run(() => store.authz.deleteRole(id, req.user!.id));
    res.status(204).end();
  }));

  app.post('/companies/:companyId/roles/:id/duplicate', authMiddleware, handler((req, res) => {
    const { companyId, id } = req.params;
    gate(req, companyId, 'people.manage_roles');
    const source = loadRole(companyId, id);
    const b = body(req);
    requireWithin(req, companyId, source.grants, source.fields);
    const templateKey = source.templateKey
      ?? (source.isSystem && (TEMPLATE_KEYS as readonly string[]).includes(source.key) ? source.key : null);
    const role = run(() => store.authz.saveRole(companyId, {
      name: optionalText(b.name, 'name') || `${source.name} (copy)`,
      nameAr: optionalText(b.nameAr, 'nameAr') ?? (source.nameAr ? `${source.nameAr} (نسخة)` : null),
      description: source.description,
      templateKey,
      grants: source.grants,
      fields: source.fields,
    }, req.user!.id));
    res.status(201).json(roleOut(role));
  }));

  app.post('/companies/:companyId/roles/:id/activate', authMiddleware, handler((req, res) => {
    const { companyId, id } = req.params;
    gate(req, companyId, 'people.manage_roles');
    const role = loadRole(companyId, id);
    requireWithin(req, companyId, role.grants, role.fields);
    res.json(roleOut(run(() => store.authz.activateRole(id, req.user!.id))));
  }));

  // ── People ─────────────────────────────────────────────────────────

  const roleRef = (r: { roleId: string; roleKey: string; roleName: string }) => {
    const role = store.authz.getRole(r.roleId);
    return { id: r.roleId, key: r.roleKey, name: r.roleName, nameAr: role?.nameAr ?? null, needsReview: Boolean(role?.needsReview) };
  };

  /** Group-wide roles reaching this company, per person (Ruling H/M). */
  const groupRolesIn = (companyId: string) => {
    const group = store.authz.holdingGroups().find((g) => g.companyIds.includes(companyId));
    const byUser = new Map<string, Array<{ holdingGroupId: string; groupName: string; key: string; name: string; isMain: boolean; startsAt: string | null; endsAt: string | null }>>();
    if (!group) return { group: undefined, byUser };
    for (const a of store.authz.holdingAssignments(group.id)) {
      const t = store.authz.holdingTemplate(group.id, a.roleKey);
      const list = byUser.get(a.userId) ?? [];
      list.push({ holdingGroupId: group.id, groupName: group.name, key: a.roleKey, name: t?.name ?? a.roleKey, isMain: a.isMain, startsAt: a.startsAt, endsAt: a.endsAt });
      byUser.set(a.userId, list);
    }
    return { group, byUser };
  };

  const personOf = (
    companyId: string,
    userId: string,
    context: { members: Set<string>; linked: Set<string>; groups: ReturnType<typeof groupRolesIn> },
  ) => {
    const u = store.getUserById(userId);
    const assignments = store.authz.assignments(userId, companyId).filter((a) => !a.viaHoldingGroupId);
    const main = assignments.find((a) => a.isMain && !a.endsAt);
    const member = context.members.has(userId);
    const company = effectiveOf(userId).byCompany.get(companyId);
    return {
      userId,
      name: u?.name ?? null,
      email: u?.email ?? null,
      avatar: u?.avatar ?? null,
      mainRole: main ? roleRef(main) : null,
      addOns: assignments.filter((a) => !a.isMain && !a.endsAt).map((a) => ({ ...roleRef(a), isActive: a.isActive })),
      temporary: assignments.filter((a) => a.endsAt).map((a) => ({
        ...roleRef(a), isActive: a.isActive, startsAt: a.startsAt, endsAt: a.endsAt, delegatedBy: a.delegatedBy, reason: a.reason,
      })),
      groupRoles: context.groups.byUser.get(userId) ?? [],
      viaGroup: member ? null : (context.groups.group ? { id: context.groups.group.id, name: context.groups.group.name } : null),
      readOnly: !member,
      linkedToHr: context.linked.has(userId),
      summary: summaryLines(company),
    };
  };

  const peopleContext = (companyId: string) => {
    const members = new Set(store.listUsersByCompany(companyId).map((u) => u.id));
    const linked = new Set(store.authz.employeeLines(companyId).filter((e) => e.userId).map((e) => e.userId!));
    return { members, linked, groups: groupRolesIn(companyId) };
  };

  /** Members, and under v2 the people a group assignment brings in (Ruling P). */
  const peopleIds = (companyId: string, members: Set<string>) =>
    [...new Set([...members, ...(engine === 'v2' ? store.authz.holdingUserIds(companyId) : [])])];

  app.get('/companies/:companyId/people', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    gate(req, companyId, 'people.view_roles');
    const context = peopleContext(companyId);
    const people = peopleIds(companyId, context.members)
      .map((id) => personOf(companyId, id, context))
      .sort((a, b) => Number(a.readOnly) - Number(b.readOnly) || String(a.name ?? '').localeCompare(String(b.name ?? '')));
    res.json(people);
  }));

  app.get('/companies/:companyId/people/:userId', authMiddleware, handler((req, res) => {
    const { companyId, userId } = req.params;
    gate(req, companyId, 'people.view_roles');
    const context = peopleContext(companyId);
    if (!peopleIds(companyId, context.members).includes(userId)) throw new HttpError(404, 'Person not found in this company.');
    const company = effectiveOf(userId).byCompany.get(companyId);
    res.json({
      ...personOf(companyId, userId, context),
      superAdmin: Boolean(store.getUserById(userId)?.isSuperAdmin),
      grants: [...(company?.grants ?? new Map()).entries()]
        .map(([key, g]) => ({
          key,
          label: permissionLabel(key),
          ...(g.scope ? { scope: g.scope } : {}),
          ...(g.limit !== undefined ? { limit: g.limit } : {}),
          sources: g.sources,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      fields: SENSITIVE_FIELDS.map((f) => {
        const mine = company?.fields.get(f.key);
        return { key: f.key, label: f.label, view: Boolean(mine?.view), edit: Boolean(mine?.edit), sources: mine?.sources ?? [] };
      }),
    });
  }));

  app.put('/companies/:companyId/people/:userId/roles', authMiddleware, handler((req, res) => {
    const { companyId, userId } = req.params;
    gate(req, companyId, 'people.manage_roles');
    const context = peopleContext(companyId);
    if (!context.members.has(userId)) {
      if (peopleIds(companyId, context.members).includes(userId)) {
        throw new HttpError(403, 'This person comes from the group. Ask a group administrator to change their roles.', { code: 'GROUP_PERSON' });
      }
      throw new HttpError(404, 'Person not found in this company.');
    }
    const b = body(req);
    const mainRoleId = optionalText(b.mainRoleId, 'mainRoleId') || null;
    if (!mainRoleId) throw new HttpError(400, 'mainRoleId is required.');
    const addOnRoleIds = stringList(b.addOnRoleIds, 'addOnRoleIds');
    const roles = [mainRoleId, ...addOnRoleIds].map((id) => loadRole(companyId, id));
    const main = roles[0];
    if (main.needsReview) throw new HttpError(400, 'That role needs review before it can be anyone\'s main role. Review and activate it first.', { code: 'NEEDS_REVIEW' });
    if (roles.some((r) => r.holdingGroupId)) throw new HttpError(403, 'Group roles are given by the group, not the company.', { code: 'GROUP_ROLE' });
    // No higher than me: the roles given, and the person's current access
    // (nobody changes the roles of someone above them).
    if (!req.user!.isSuperAdmin) {
      for (const role of roles) requireWithin(req, companyId, role.grants, role.fields);
      const current = effectiveOf(userId).byCompany.get(companyId);
      requireWithin(req, companyId, grantsOut(current), fieldsOut(current));
    }

    const change = () => store.transaction(() => {
      // While legacy decides, users.companyRoles follows a standard main role
      // (Owner stands for Admin); a custom main role leaves it as it is.
      const legacyRole = main.isSystem ? LEGACY_ROLE[main.key] : undefined;
      const user = store.getUserById(userId)!;
      const companyRoles = user.companyRoles?.length
        ? user.companyRoles
        : (user.companyIds ?? []).map((id) => ({ companyId: id, role: user.role }));
      if (legacyRole && companyRoles.find((r) => r.companyId === companyId)?.role !== legacyRole) {
        store.updateUser(userId, {
          companyRoles: companyRoles.map((r) => (r.companyId === companyId ? { ...r, role: legacyRole } : r)),
        });
      }
      run(() => store.authz.setAssignments(userId, companyId, { mainRoleId, addOnRoleIds }, req.user!.id));
      // Nobody left to manage roles here: refuse (the whole change rolls back).
      const holders = store.listUsersByCompany(companyId)
        .filter((u) => !u.isSuperAdmin && effectiveOf(u.id).byCompany.get(companyId)?.grants.has('people.manage_roles'));
      if (!holders.length) {
        throw new HttpError(409, 'That change would leave this company with nobody able to manage roles.', { code: 'LOCKOUT' });
      }
    });
    try {
      change();
    } catch (error) {
      // Answers worked out inside the rolled-back change carry a version
      // number a later change will reuse: forget them.
      clearEffectiveCache();
      throw error;
    }
    res.json(personOf(companyId, userId, peopleContext(companyId)));
  }));
}
