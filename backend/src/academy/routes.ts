import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { impactOf, pathFor, progressFor, reportObjective, resetPractice, startPractice, statementsOf } from './academy';
import { MISSIONS } from './missions';

type AuthedRequest = Request & { user?: SanitizedUser };

export interface AcademyDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  requireCompanyAccess(req: AuthedRequest, companyId: string): void;
  /** Publishes membership changes for these companies (OpenFGA); a no-op under legacy roles. */
  publishMembership(companyIds: string[], change: () => void): Promise<void>;
  /** Publishes everything a just-created company has (it had nothing before). */
  publishNewCompany(companyId: string): Promise<void>;
  recordActivity(input: { companyId: string; actor: SanitizedUser; summary: string; metadata?: Record<string, unknown> }): void;
}

const wrap = (fn: (req: AuthedRequest, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req as AuthedRequest, res)).catch(next);

/** TaskFlow Academy API. Everything is about the signed-in user's own training. */
export function registerAcademyRoutes(app: Express, deps: AcademyDeps): void {
  const { store, authMiddleware } = deps;
  const me = (req: AuthedRequest) => req.user!;

  const practiceOf = (req: AuthedRequest) => {
    const id = store.academy.state(me(req).id).practiceCompanyId;
    if (!id || !store.getCompanyById(id)) throw new HttpError(409, 'Start your practice company first.');
    return id;
  };

  /** Creates the practice company if needed and makes sure the trainee is still its member. */
  const ensurePractice = async (req: AuthedRequest, reset = false) => {
    const user = me(req);
    const before = store.academy.state(user.id).practiceCompanyId;
    const existed = Boolean(before && store.getCompanyById(before));
    let id = '';
    // A reset deletes the old company: publish its removal from the old snapshot.
    await deps.publishMembership(existed && reset ? [before!] : [], () => {
      id = reset ? resetPractice(store, user) : startPractice(store, user);
    });
    if (!existed || reset) {
      await deps.publishNewCompany(id);
      return id;
    }
    // Someone may have edited the trainee's companies; put them back in their own.
    const fresh = store.getUserById(user.id)!;
    const member = (fresh.companyRoles ?? []).some((r) => r.companyId === id);
    if (!member) {
      await deps.publishMembership([id], () => {
        store.updateUser(user.id, {
          companyRoles: [...(fresh.companyRoles ?? []), { companyId: id, role: 'Admin' }],
          companyIds: [...new Set([...(fresh.companyIds ?? []), id])],
        });
      });
    }
    return id;
  };

  app.get('/academy/me', authMiddleware, wrap((req, res) => {
    res.json(progressFor(store, me(req)));
  }));

  app.get('/academy/missions', authMiddleware, wrap((req, res) => {
    // The whole catalogue (for the map), with which ones this user must do.
    const mine = new Set(pathFor(store, me(req)).map((m) => m.id));
    res.json(MISSIONS.map((m) => ({ id: m.id, order: m.order, title: m.title, modules: m.modules, required: mine.has(m.id) })));
  }));

  app.post('/academy/start', authMiddleware, wrap(async (req, res) => {
    await ensurePractice(req);
    res.json(progressFor(store, store.getUserById(me(req).id)!));
  }));

  app.post('/academy/reset', authMiddleware, wrap(async (req, res) => {
    await ensurePractice(req, true);
    res.json(progressFor(store, store.getUserById(me(req).id)!));
  }));

  app.post('/academy/objectives/:missionId/:objectiveId', authMiddleware, wrap((req, res) => {
    if (!reportObjective(store, me(req), req.params.missionId, req.params.objectiveId)) {
      throw new HttpError(400, 'That step is checked from your practice company, not reported.');
    }
    res.json(progressFor(store, me(req)));
  }));

  app.get('/academy/impact', authMiddleware, wrap((req, res) => {
    res.json(impactOf(store, practiceOf(req)));
  }));

  app.get('/academy/statements', authMiddleware, wrap((req, res) => {
    res.json(statementsOf(store, practiceOf(req)));
  }));

  // Colleagues in one real company and how far each has got. Progress only: no times, no ranks.
  app.get('/academy/team', authMiddleware, wrap((req, res) => {
    const companyId = String(req.query.companyId ?? '');
    deps.requireCompanyAccess(req, companyId);
    if (store.isTrainingCompany(companyId)) throw new HttpError(400, 'Choose a real company.');
    const users = store.listUsersByCompany(companyId).filter((u) => !u.isSuperAdmin);
    const counts = store.academy.missionCounts(users.map((u) => u.id));
    res.json(users
      .map((u) => ({ userId: u.id, name: u.name, done: counts.get(u.id) ?? 0, required: pathFor(store, u).length }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  }));

  // Super admin: one user's progress, and exemptions (whole academy '*' or one module).
  app.get('/academy/users/:userId', authMiddleware, wrap((req, res) => {
    if (!me(req).isSuperAdmin) throw new HttpError(403, 'Super-admin access required.');
    const user = store.getUserById(req.params.userId);
    if (!user) throw new HttpError(404, 'User not found.');
    res.json(progressFor(store, user));
  }));

  app.post('/academy/exemptions', authMiddleware, wrap((req, res) => {
    const admin = me(req);
    if (!admin.isSuperAdmin) throw new HttpError(403, 'Only the platform administrator can exempt someone.');
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const user = store.getUserById(String(body.userId ?? ''));
    if (!user) throw new HttpError(404, 'User not found.');
    const module = String(body.module ?? '*');
    const valid = module === '*' || MISSIONS.some((m) => m.modules.includes(module));
    if (!valid) throw new HttpError(400, 'Exempt from the whole academy (*) or from one module a mission teaches.');
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
    if (reason.length < 3) throw new HttpError(400, 'Say why.');
    store.academy.exempt({ userId: user.id, module, byUserId: admin.id, reason });
    for (const companyId of new Set((user.companyRoles ?? []).map((r) => r.companyId).filter((id) => !store.isTrainingCompany(id)))) {
      deps.recordActivity({ companyId, actor: admin, summary: `Academy exemption for ${user.name}: ${module === '*' ? 'all modules' : module} (${reason})`, metadata: { userId: user.id, module } });
    }
    res.status(201).json(progressFor(store, user));
  }));

  app.delete('/academy/exemptions/:userId/:module', authMiddleware, wrap((req, res) => {
    if (!me(req).isSuperAdmin) throw new HttpError(403, 'Only the platform administrator can change exemptions.');
    if (!store.academy.removeExemption(req.params.userId, req.params.module)) throw new HttpError(404, 'No such exemption.');
    res.status(204).end();
  }));
}
