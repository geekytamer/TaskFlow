import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { asRecord, enumValue } from '../validation';
import { actorOf, ensureFrozen, gameStatus, staffBoard } from './games';
import type { Game, GameViewer } from './games-store';
import { METRICS, offeredMetrics } from './metrics';

type StaffRequest = Request & { user?: SanitizedUser };

export interface GamesStaffDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  /** Games exist only for this company. */
  companyId: string;
  requireCompanyAccess(req: StaffRequest, companyId: string): void;
  canManageGames(req: StaffRequest, companyId: string): boolean;
}

const wrap = (fn: (req: StaffRequest, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req as StaffRequest, res)).catch(next);

const text = (v: unknown, field: string, max: number, required = false): string | null => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${field} is required.`);
    return null;
  }
  if (typeof v !== 'string' || v.trim().length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return v.trim() || null;
};

const date = (v: unknown, field: string): string => {
  const d = typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new HttpError(400, `${field} must be a date.`);
  return d.toISOString();
};

const MAX_METRICS = 5;
// G1 has no sources, so the actions a game's sources supply are none.
const SUPPLIED: [] = [];

export function createGamesStaffRouter(deps: GamesStaffDeps): Router {
  const { store, authMiddleware } = deps;
  const router = Router();

  const authorize = (req: StaffRequest) => {
    const { companyId } = req.params;
    if (companyId !== deps.companyId) throw new HttpError(404, 'Not found.');
    deps.requireCompanyAccess(req, companyId);
    if (!deps.canManageGames(req, companyId)) throw new HttpError(403, 'Only administrators can manage games.');
    return companyId;
  };

  const load = (companyId: string, id: string): Game => {
    const game = store.games.get(id);
    if (!game || game.companyId !== companyId) throw new HttpError(404, 'Game not found.');
    return ensureFrozen(store, game);
  };

  const view = (game: Game) => ({
    ...game,
    status: gameStatus(game),
    metrics: store.games.metrics(game.id),
    viewers: store.games.viewers(game.id),
    availableMetrics: offeredMetrics(SUPPLIED).map((m) => ({ key: m.key, label: m.label })),
  });

  const notFrozen = (game: Game) => {
    if (game.frozenAt) throw new HttpError(409, 'This game has ended and its results are frozen. Reopen it to make changes.');
    if (game.archivedAt) throw new HttpError(409, 'This game is archived.');
  };

  const base = '/companies/:companyId/games';

  router.get(base, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.games.list(companyId).map((g) => view(ensureFrozen(store, g))));
  }));

  router.post(base, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const body = asRecord(req.body, 'body');
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) throw new HttpError(400, 'The address must be lowercase letters, numbers and dashes.');
    const startsAt = date(body.startsAt, 'startsAt');
    const endsAt = date(body.endsAt, 'endsAt');
    if (endsAt <= startsAt) throw new HttpError(400, 'The game must end after it starts.');
    const game = store.games.create({
      companyId, slug,
      name: text(body.name, 'name', 120, true)!, nameAr: text(body.nameAr, 'nameAr', 120),
      rules: text(body.rules, 'rules', 4000), rulesAr: text(body.rulesAr, 'rulesAr', 4000),
      prize: text(body.prize, 'prize', 500), prizeAr: text(body.prizeAr, 'prizeAr', 500),
      visibility: enumValue(body.visibility ?? 'public', 'visibility', ['public', 'restricted'] as const),
      startsAt, endsAt, createdByUserId: req.user!.id,
    });
    if (!game) throw new HttpError(409, 'Another game already uses that address.');
    res.status(201).json(view(game));
  }));

  router.get(`${base}/:id`, authMiddleware, wrap((req, res) => {
    res.json(view(load(authorize(req), req.params.id)));
  }));

  router.patch(`${base}/:id`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    const body = asRecord(req.body, 'body');
    const fields: Parameters<typeof store.games.updateGame>[1] = {};
    for (const [key, max] of [['name', 120], ['nameAr', 120], ['rules', 4000], ['rulesAr', 4000], ['prize', 500], ['prizeAr', 500]] as const) {
      if (body[key] !== undefined) fields[key] = text(body[key], key, max, key === 'name')!;
    }
    if (body.visibility !== undefined) fields.visibility = enumValue(body.visibility, 'visibility', ['public', 'restricted'] as const);
    if (body.startsAt !== undefined) fields.startsAt = date(body.startsAt, 'startsAt');
    if (body.endsAt !== undefined) fields.endsAt = date(body.endsAt, 'endsAt');
    if ((fields.endsAt ?? game.endsAt) <= (fields.startsAt ?? game.startsAt)) throw new HttpError(400, 'The game must end after it starts.');
    res.json(view(store.games.updateGame(game.id, fields)!));
  }));

  router.put(`${base}/:id/metrics`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (!Array.isArray(req.body) || req.body.length === 0 || req.body.length > MAX_METRICS) throw new HttpError(400, `Choose 1 to ${MAX_METRICS} metrics.`);
    const offered = new Set(offeredMetrics(SUPPLIED).map((m) => m.key));
    const rows = req.body.map((raw: unknown) => {
      const r = asRecord(raw, 'metric');
      const key = String(r.metricKey ?? '');
      if (!offered.has(key)) throw new HttpError(400, `${key || 'That metric'} is not available for this game's sources.`);
      const weight = Number(r.weight ?? 1);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new HttpError(400, 'weight must be above 0 and at most 100.');
      let params: Record<string, number | boolean>;
      try { params = METRICS[key].params(r.params); } catch (e) { throw new HttpError(400, (e as Error).message); }
      return { metricKey: key, weight, params };
    });
    if (new Set(rows.map((r) => r.metricKey)).size !== rows.length) throw new HttpError(400, 'Each metric once.');
    store.games.setMetrics(game.id, rows);
    res.json(view(store.games.get(game.id)!));
  }));

  router.post(`${base}/:id/publish`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (store.games.metrics(game.id).length === 0) throw new HttpError(409, 'Choose how points are earned before publishing.');
    res.json(view(store.games.updateGame(game.id, { publishedAt: game.publishedAt ?? new Date().toISOString() })!));
  }));

  router.post(`${base}/:id/archive`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    res.json(view(store.games.updateGame(game.id, { archivedAt: game.archivedAt ?? new Date().toISOString() })!));
  }));

  router.post(`${base}/:id/reopen`, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const game = load(companyId, req.params.id);
    if (!game.frozenAt) throw new HttpError(409, 'Only an ended game can be reopened.');
    const body = asRecord(req.body, 'body');
    const reason = text(body.reason, 'reason', 1000);
    if (!reason || reason.length < 10) throw new HttpError(400, 'Say why the results are being reopened (at least 10 characters).');
    const endsAt = body.endsAt === undefined ? '' : date(body.endsAt, 'endsAt');
    if (!endsAt || Date.parse(endsAt) <= Date.now()) throw new HttpError(400, 'Choose a new end time in the future.');
    store.transaction(() => {
      store.games.unfreeze(game.id, endsAt);
      store.createActivityEvent({
        companyId, entityType: 'game', entityId: game.id, action: 'reopened',
        actorUserId: req.user!.id, actorName: req.user!.name,
        summary: `Game "${game.name}" reopened: ${reason}`,
        metadata: { previousEndsAt: game.endsAt, endsAt },
      });
    });
    res.json(view(store.games.get(game.id)!));
  }));

  router.post(`${base}/:id/awards`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    const body = asRecord(req.body, 'body');
    const { actorKey, handle } = actorOf(body.platform, body.handle);
    const points = Number(body.points);
    if (!Number.isFinite(points) || points === 0 || Math.abs(points) > 10000) throw new HttpError(400, 'Points must be a non-zero number up to 10,000; use a negative number to correct.');
    const reason = text(body.reason, 'reason', 300);
    if (!reason || reason.length < 3) throw new HttpError(400, 'Every award needs a reason.');
    res.status(201).json(store.games.addAward({ gameId: game.id, actorKey, actorHandle: handle, points, reason, byUserId: req.user!.id }));
  }));

  router.post(`${base}/:id/actor-rules`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    const body = asRecord(req.body, 'body');
    const { actorKey, handle } = actorOf(body.platform, body.handle);
    const kind = enumValue(body.kind, 'kind', ['exclude', 'disqualify'] as const);
    const reason = text(body.reason, 'reason', 300);
    if (!reason || reason.length < 3) throw new HttpError(400, 'Say why.');
    store.games.setActorRule({ gameId: game.id, actorKey, actorHandle: handle, kind, reason, byUserId: req.user!.id });
    res.status(201).json({ actorKey, kind });
  }));

  router.delete(`${base}/:id/actor-rules/:actorKey`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (!store.games.removeActorRule(game.id, req.params.actorKey)) throw new HttpError(404, 'No rule for that actor.');
    res.status(204).end();
  }));

  router.put(`${base}/:id/viewers`, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const game = load(companyId, req.params.id);
    if (!Array.isArray(req.body) || req.body.length > 500) throw new HttpError(400, 'viewers must be a list.');
    const viewers: GameViewer[] = req.body.map((raw: unknown) => {
      const r = asRecord(raw, 'viewer');
      const subjectType = enumValue(r.subjectType, 'subjectType', ['user', 'portal_user'] as const);
      const subjectId = String(r.subjectId ?? '');
      const ok = subjectType === 'portal_user'
        ? store.portal.getUser(subjectId)?.companyId === companyId
        : Boolean(store.getUserById(subjectId)?.companyIds?.includes(companyId));
      if (!ok) throw new HttpError(400, 'Every viewer must belong to this company.');
      return { subjectType, subjectId };
    });
    store.games.setViewers(game.id, viewers);
    res.json(store.games.viewers(game.id));
  }));

  router.get(`${base}/:id/scoreboard`, authMiddleware, wrap((req, res) => {
    res.json(staffBoard(store, load(authorize(req), req.params.id)));
  }));

  router.get(`${base}/:id/awards`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    res.json(store.games.awards(game.id).map((a) => ({ ...a, by: store.getUserById(a.byUserId)?.name ?? null })).reverse());
  }));

  router.get(`${base}/:id/actor-rules`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    res.json(store.games.actorRules(game.id));
  }));

  return router;
}
