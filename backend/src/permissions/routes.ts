import type { Express, Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { MODULES, isValidPermission } from './catalogue';
import { projectCompanyDelta, syncTuples } from './sync';
import { tuplesForStore } from './tuples';

/** Permissions that a company must never lose its last holder of. */
const LOCKOUT_GUARD = ['settings:write', 'settings:users.read'] as const;

export interface PermissionRoutesDeps {
  app: Express;
  store: DataStore;
  authMiddleware: unknown;
  handler: (fn: (req: any, res: Response) => unknown) => any;
  requireCompanyRoles: (req: any, companyId: string, roles: any[]) => void;
  managementRoles: any[];
  /** Publishes the delta a change made to one company's tuples. */
  projectTuples: (companyId: string, before: ReturnType<typeof tuplesForStore>) => Promise<void>;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

const asString = (value: unknown, field: string, { min = 1 } = {}): string => {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
};

const slugify = (value: string): string =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MAX_GROUP_NAME = 80;
const BUILT_IN_GROUP_KEYS = new Set(['admin', 'manager', 'employee', 'accountant']);

/** Trims a group name and rejects blank or overlong ones. */
function groupName(value: string): string {
  const name = value.trim();
  if (!name) throw new HttpError(400, 'Group name is required.');
  if (name.length > MAX_GROUP_NAME) {
    throw new HttpError(400, `Group name must be ${MAX_GROUP_NAME} characters or fewer.`);
  }
  return name;
}

/**
 * Group names must be unique within a company, ignoring case.
 *
 * Administrators choose groups by name when assigning people, so two groups
 * called "Accountant" make the choice a guess. Keys were already unique, but
 * names were not, which let a stale form silently rename a new group to match
 * an existing one.
 */
function assertGroupNameAvailable(
  store: { listPermissionGroups(companyId: string): Array<{ id: string; name: string }> },
  companyId: string,
  name: string,
  exceptGroupId?: string,
): void {
  const wanted = name.toLocaleLowerCase();
  const clash = store
    .listPermissionGroups(companyId)
    .find((g) => g.id !== exceptGroupId && g.name.trim().toLocaleLowerCase() === wanted);
  if (clash) {
    throw new HttpError(409, `A group named "${clash.name}" already exists in this company.`);
  }
}

export function registerPermissionRoutes(deps: PermissionRoutesDeps): void {
  const { app, store, authMiddleware, handler, requireCompanyRoles, managementRoles } = deps;

  /**
   * Refuses a change that would leave a company with nobody able to administer
   * it. Without this, one careless click locks a company out of its own
   * settings with no recovery short of editing the database by hand.
   */
  const assertNotLockingOut = (companyId: string) => {
    const holders = store
      .listUsersByCompany(companyId)
      .filter((user) => {
        if (user.isSuperAdmin) return false;
        const perms = new Set(store.getEffectivePermissions(user.id, companyId));
        return LOCKOUT_GUARD.every((p) => perms.has(p));
      });
    if (holders.length === 0) {
      throw new HttpError(
        409,
        'That change would leave this company with no user able to manage users and settings.',
      );
    }
  };

  /**
   * Applies a change, verifies it did not lock the company out, then publishes
   * the result to OpenFGA.
   *
   * The mutation and the guard share one transaction on purpose. The guard has
   * to run *after* the change to see its effect, but if it rejects, the change
   * must not survive — otherwise the company is locked out while the API
   * reports failure, which is the worst of both outcomes.
   */
  const withProjection = async <T>(companyId: string, fn: () => T): Promise<T> => {
    const before = tuplesForStore(store, companyId);
    const result = store.transaction(() => {
      const value = fn();
      assertNotLockingOut(companyId);
      return value;
    });
    await deps.projectTuples(companyId, before);
    return result;
  };

  const loadGroup = (id: string) => {
    const group = store.getPermissionGroupById(id);
    if (!group) throw new HttpError(404, 'Permission group not found.');
    return group;
  };

  // ── Catalogue ──────────────────────────────────────────────────────
  app.get('/permissions/catalogue', authMiddleware as never, handler((_req, res) => {
    res.json({ modules: MODULES });
  }));

  // ── The current user's own permissions ─────────────────────────────
  app.get('/auth/permissions', authMiddleware as never, handler((req, res) => {
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    if (!companyId) throw new HttpError(400, 'companyId is required.');
    res.json({
      version: store.getAuthzVersion(),
      companyId,
      permissions: store.getEffectivePermissions(req.user!.id, companyId).sort(),
    });
  }));

  // ── Groups ─────────────────────────────────────────────────────────
  app.get('/companies/:companyId/permission-groups', authMiddleware as never, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, managementRoles);
    const groups = store.listPermissionGroups(req.params.companyId).map((group) => ({
      ...group,
      isSystem: Boolean(group.isSystem),
      isActive: Boolean(group.isActive),
      permissions: store.listGroupPermissions(group.id),
      impliedGroupIds: store.listGroupImplications(group.id),
      memberCount: store.countGroupMembers(group.id),
    }));
    res.json(groups);
  }));

  app.post('/companies/:companyId/permission-groups', authMiddleware as never, handler(async (req, res) => {
    requireCompanyRoles(req, req.params.companyId, ['Admin']);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = groupName(asString(body.name, 'name'));
    assertGroupNameAvailable(store, req.params.companyId, name);
    let key = slugify(typeof body.key === 'string' && body.key ? body.key : name);
    // Built-in keys are how roles find their group. A custom group must never
    // take one, or it would silently become that role's group.
    if (BUILT_IN_GROUP_KEYS.has(key)) key = `${key}-group`;
    if (!key) throw new HttpError(400, 'key could not be derived from the name.');
    if (store.getPermissionGroupByKey(req.params.companyId, key)) {
      throw new HttpError(409, `A group with key "${key}" already exists in this company.`);
    }
    const group = await withProjection(req.params.companyId, () =>
      store.createPermissionGroup({
        companyId: req.params.companyId,
        key,
        name,
        nameAr: typeof body.nameAr === 'string' ? body.nameAr : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
      }));
    res.status(201).json(group);
  }));

  app.patch('/permission-groups/:id', authMiddleware as never, handler(async (req, res) => {
    const group = loadGroup(req.params.id);
    requireCompanyRoles(req, group.companyId, ['Admin']);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? groupName(body.name) : undefined;
    if (name !== undefined) assertGroupNameAvailable(store, group.companyId, name, group.id);
    await withProjection(group.companyId, () =>
      store.updatePermissionGroup(group.id, {
        name,
        nameAr: typeof body.nameAr === 'string' ? body.nameAr : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
      }));
    res.json(store.getPermissionGroupById(group.id));
  }));

  app.delete('/permission-groups/:id', authMiddleware as never, handler(async (req, res) => {
    const group = loadGroup(req.params.id);
    requireCompanyRoles(req, group.companyId, ['Admin']);
    // Any group, built-in or custom, may be deleted once nobody depends on it.
    // Deleting a group people are in, directly or through inheritance, would
    // silently take their access away.
    const members = store.countGroupMembers(group.id);
    if (members > 0) {
      throw new HttpError(
        409,
        `${members} user(s) are still in "${group.name}". Remove them from the group before deleting it.`,
      );
    }
    const inheritors = store.listGroupsInheriting(group.id);
    if (inheritors.length > 0) {
      throw new HttpError(
        409,
        `${inheritors.map((name) => `"${name}"`).join(', ')} inherit from "${group.name}". Remove that inheritance first.`,
      );
    }
    await withProjection(group.companyId, () => store.deletePermissionGroup(group.id));
    res.status(204).end();
  }));

  // ── Grants ─────────────────────────────────────────────────────────
  app.put('/permission-groups/:id/permissions', authMiddleware as never, handler(async (req, res) => {
    const group = loadGroup(req.params.id);
    requireCompanyRoles(req, group.companyId, ['Admin']);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.permissions)) {
      throw new HttpError(400, 'permissions must be an array of "module:action" strings.');
    }
    const parsed = (body.permissions as unknown[]).map((entry) => {
      const key = asString(entry, 'permission');
      const [module, ...rest] = key.split(':');
      const action = rest.join(':');
      if (!isValidPermission(module, action)) {
        throw new HttpError(400, `Unknown permission "${key}".`);
      }
      return { module, action };
    });
    await withProjection(group.companyId, () => store.setGroupPermissions(group.id, parsed));
    res.json({ permissions: store.listGroupPermissions(group.id) });
  }));

  // ── Inheritance ────────────────────────────────────────────────────
  app.put('/permission-groups/:id/implications', authMiddleware as never, handler(async (req, res) => {
    const group = loadGroup(req.params.id);
    requireCompanyRoles(req, group.companyId, ['Admin']);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.impliedGroupIds)) {
      throw new HttpError(400, 'impliedGroupIds must be an array.');
    }
    const ids = body.impliedGroupIds.map((id) => asString(id, 'impliedGroupId'));
    ids.forEach((childId) => {
      if (childId === group.id) {
        throw new HttpError(400, 'A group cannot inherit from itself.');
      }
      const child = store.getPermissionGroupById(childId);
      if (!child || child.companyId !== group.companyId) {
        throw new HttpError(400, `Group ${childId} does not belong to this company.`);
      }
    });
    await withProjection(group.companyId, () => store.setGroupImplications(group.id, ids));
    res.json({ impliedGroupIds: store.listGroupImplications(group.id) });
  }));

  // ── Assignments ────────────────────────────────────────────────────
  app.get('/companies/:companyId/users/:userId/groups', authMiddleware as never, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, managementRoles);
    res.json({
      groups: store.listUserGroupAssignments(req.params.userId, req.params.companyId),
      effectivePermissions: store
        .getEffectivePermissions(req.params.userId, req.params.companyId)
        .sort(),
    });
  }));

  app.put('/companies/:companyId/users/:userId/groups', authMiddleware as never, handler(async (req, res) => {
    const { companyId, userId } = req.params;
    requireCompanyRoles(req, companyId, ['Admin']);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.groupIds)) throw new HttpError(400, 'groupIds must be an array.');

    const ids = body.groupIds.map((id) => asString(id, 'groupId'));
    ids.forEach((groupId) => {
      const group = store.getPermissionGroupById(groupId);
      if (!group || group.companyId !== companyId) {
        throw new HttpError(400, `Group ${groupId} does not belong to this company.`);
      }
    });

    // Refuse before writing, so an admin cannot strip their own last route back.
    if (req.user!.id === userId && !req.user!.isSuperAdmin) {
      const wouldHave = new Set(ids.flatMap((id) => store.listGroupPermissionKeys(id)));
      if (!LOCKOUT_GUARD.every((p) => wouldHave.has(p))) {
        throw new HttpError(409, 'You cannot remove your own administrative access.');
      }
    }

    await withProjection(companyId, () => store.setUserGroups(userId, companyId, ids));
    res.json({ groups: store.listUserGroupAssignments(userId, companyId) });
  }));

  // ── Shadow-mode divergences ────────────────────────────────────────
  app.get('/admin/authz/divergences', authMiddleware as never, handler((req, res) => {
    if (!req.user?.isSuperAdmin) throw new HttpError(403, 'Super-admin access required.');
    res.json(store.listAuthzDivergences(500));
  }));
}

export { syncTuples };
