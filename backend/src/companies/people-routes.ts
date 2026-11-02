import type { Express } from 'express';
import { HttpError } from '../http';
import type { RouteContext } from '../routes/context';
import { handler, type AuthedRequest } from '../routes/shared';
import { subtreeIds } from './tree';

/**
 * Everyone in a group, once (spec 2026-11-02-group-as-company, stage 3): the
 * companies of the tree each person belongs to, with their role there, and
 * their employer (the HR record their login is linked to). Changing access
 * stays with PUT /users/:id, whose guards decide; `manageable` says where
 * this viewer may change it.
 */
export function registerGroupPeopleRoutes(
  app: Express,
  ctx: RouteContext,
  deps: { updateUser: (req: AuthedRequest, userId: string, body: unknown) => Promise<unknown> },
): void {
  const { store, authMiddleware, allowsRule } = ctx;

  /** The person's full company list (every company, inside the group or not), as PUT /users/:id takes it. */
  const assignmentsOf = (userId: string) => {
    const u = store.getUserById(userId);
    if (!u) throw new HttpError(404, 'User not found.');
    return u.companyRoles?.length
      ? u.companyRoles.map((r) => ({ companyId: r.companyId, role: r.role, positionId: r.positionId }))
      : (u.companyIds ?? []).map((companyId) => ({ companyId, role: u.role, positionId: u.positionId }));
  };
  const treeOf = (groupId: string) => {
    if (!store.getCompanyById(groupId)) throw new HttpError(404, 'Company not found.');
    return new Set(subtreeIds(store.companyTreeNodes(), groupId));
  };
  const keepOne = (list: unknown[]) => {
    if (!list.length) throw new HttpError(400, 'A person keeps at least one company. Remove them from the company list instead.', { code: 'LAST_COMPANY' });
  };

  /** Give, change (role) or end (role null) a person's access in one company of the group. */
  app.put('/companies/:companyId/group-people/:userId/access', authMiddleware, handler(async (req, res) => {
    const tree = treeOf(req.params.companyId);
    const companyId = typeof req.body?.companyId === 'string' ? req.body.companyId : '';
    if (!tree.has(companyId)) throw new HttpError(400, 'That company is not part of this group.');
    const role = req.body?.role === null ? null : typeof req.body?.role === 'string' ? req.body.role : undefined;
    if (role === undefined) throw new HttpError(400, 'role is a role name, or null to end access.');
    const current = assignmentsOf(req.params.userId);
    const others = current.filter((a) => a.companyId !== companyId);
    const before = current.find((a) => a.companyId === companyId);
    const next = role === null ? others : [...others, { companyId, role, positionId: before?.positionId }];
    keepOne(next);
    res.json(await deps.updateUser(req, req.params.userId, { companyRoles: next }));
  }));

  /** Ends a person's access in every company of the group this person manages; elsewhere it stays. */
  app.post('/companies/:companyId/group-people/:userId/remove', authMiddleware, handler(async (req, res) => {
    const tree = treeOf(req.params.companyId);
    const superAdmin = Boolean(req.user!.isSuperAdmin);
    const current = assignmentsOf(req.params.userId);
    const next = current.filter((a) => !tree.has(a.companyId) || !(superAdmin || allowsRule(req, a.companyId, 'USERS_WRITE')));
    if (next.length === current.length) throw new HttpError(403, 'You manage none of this person\'s companies in the group.', { code: 'USER_OUTSIDE_COMPANY' });
    keepOne(next);
    res.json(await deps.updateUser(req, req.params.userId, { companyRoles: next }));
  }));

  app.get('/companies/:companyId/group-people', authMiddleware, handler((req, res) => {
    const groupId = req.params.companyId;
    if (!store.getCompanyById(groupId)) throw new HttpError(404, 'Company not found.');
    const superAdmin = Boolean(req.user!.isSuperAdmin);
    if (!superAdmin && !allowsRule(req, groupId, 'USERS_WRITE')) {
      throw new HttpError(403, 'Only people who manage users in the group company see its people.', { code: 'FORBIDDEN' });
    }
    const tree = subtreeIds(store.companyTreeNodes(), groupId);
    const inTree = new Set(tree);
    const companies = tree.map((id) => ({ id, name: store.getCompanyById(id)?.name ?? id }));
    const manageable = tree.filter((id) => superAdmin || allowsRule(req, id, 'USERS_WRITE'));

    const people = new Map<string, {
      id: string; name: string; email: string; avatar?: string;
      memberships: Array<{ companyId: string; role: string; positionId?: string }>;
      employer: { companyId: string; employeeId: string } | null;
    }>();
    for (const companyId of tree) {
      for (const u of store.listUsersByCompany(companyId)) {
        if (people.has(u.id)) continue;
        const roles = u.companyRoles?.length
          ? u.companyRoles
          : (u.companyIds ?? []).map((id) => ({ companyId: id, role: u.role, positionId: u.positionId }));
        people.set(u.id, {
          id: u.id, name: u.name, email: u.email, avatar: u.avatar,
          memberships: roles.filter((r) => inTree.has(r.companyId))
            .map((r) => ({ companyId: r.companyId, role: String(r.role), positionId: r.positionId ?? undefined })),
          employer: null,
        });
      }
    }
    for (const companyId of tree) {
      for (const e of store.listEmployees(companyId)) {
        const person = e.userId ? people.get(e.userId) : undefined;
        if (person && e.status !== 'Terminated' && !person.employer) person.employer = { companyId, employeeId: e.id };
      }
    }
    res.json({ companies, manageable, people: [...people.values()].sort((x, y) => x.name.localeCompare(y.name)) });
  }));
}
