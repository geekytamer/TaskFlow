import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { asRecord, enumValue } from '../validation';
import type { MetaClient } from '../social/meta-client';
import { openToken } from '../social/crypto';
import { actor, collectGame } from './collector';
import type { LikersFetcher } from './likers-fetcher';
import { permalinkKey, tickLikersSource } from './tracker';
import { actorOf, ensureFrozen, gameStatus, staffBoard, suppliedFor } from './games';
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
  /** Present when Instagram is configured: games can then read connected accounts. */
  metaClient?: MetaClient;
  /** Present when a likers fetcher is configured. */
  likersFetcher?: LikersFetcher;
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
const MAX_SOURCES = 20;
const MAX_PARTICIPANTS = 100;
const MAX_LIKERS = 5000;
// Button labels Instagram's likes list puts between handles when copied.
const NOT_HANDLES = new Set(['follow', 'following', 'remove', 'message', 'requested', 'verified', 'likes']);

/**
 * Handles from a pasted likers list or CSV: one per line (or comma separated),
 * with or without @, or as profile links. Lines that cannot be a handle are skipped and reported.
 */
export function parseHandles(raw: string): { handles: string[]; skipped: string[] } {
  const handles = new Set<string>();
  const skipped: string[] = [];
  for (const piece of raw.split(/[\r\n,;\t]+/)) {
    const line = piece.trim();
    if (!line) continue;
    const fromLink = line.match(/instagram\.com\/([A-Za-z0-9._]{1,30})\/?/i)?.[1];
    const handle = (fromLink ?? line).replace(/^@+/, '').toLowerCase();
    if (/^[a-z0-9._]{1,30}$/.test(handle) && !NOT_HANDLES.has(handle) && !/^\d+$/.test(handle)) handles.add(handle);
    else skipped.push(line.slice(0, 60));
  }
  return { handles: [...handles], skipped };
}

/** A creators game counts posts whose caption has this: one @handle or #hashtag. */
const tagOf = (v: unknown): string | null => {
  if (v === undefined || v === null || v === '') return null;
  const t = typeof v === 'string' ? v.trim() : '';
  if (!/^[@#][\p{L}\p{N}._]{2,60}$/u.test(t)) throw new HttpError(400, 'The tag must be one @handle or #hashtag.');
  return t;
};

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

  const accountName = (accountId: string) => store.social.getAccount(accountId)?.username ?? null;

  const view = (game: Game) => {
    const stats = new Map(store.games.creatorStats(game.id).map((s) => [s.contactId, s]));
    return {
      ...game,
      status: gameStatus(game),
      clientName: game.clientContactId ? store.getContactById(game.clientContactId)?.name ?? null : null,
      metrics: store.games.metrics(game.id),
      viewers: store.games.viewers(game.id),
      availableMetrics: offeredMetrics(suppliedFor(store, game)).map((m) => ({ key: m.key, label: m.label })),
      instagram: Boolean(deps.metaClient),
      likersFetcher: Boolean(deps.likersFetcher),
      trackedAccounts: store.games.trackedAccounts(game.id),
      sources: (() => {
        const counts = new Map<string, number>();
        store.games.events(game.id).forEach((e) => counts.set(e.sourceId, (counts.get(e.sourceId) ?? 0) + 1));
        return store.games.sources(game.id).map((src) => ({
          id: src.id, kind: src.kind, accountId: src.accountId || null, username: src.accountId ? accountName(src.accountId) : null, permalink: src.permalink,
          accountStatus: src.accountId ? store.social.getAccount(src.accountId)?.status ?? 'revoked' : null,
          lastCollectedAt: src.lastCollectedAt, lastError: src.lastError, interactions: counts.get(src.id) ?? 0,
          autoAdded: src.autoAdded === 1, postedAt: src.postedAt, paced: Boolean(src.metaMediaId),
          likeCount: src.likeCount, likersFetchedAt: src.likersFetchedAt, nextLikersAt: src.nextLikersAt,
          likersWindow: src.likersWindow, likersMissed: src.likersMissed,
        }));
      })(),
      participants: store.games.participants(game.id).map((contactId) => {
        const st = stats.get(contactId);
        const connected = store.social.accountsFor(game.companyId, contactId).find((a) => a.status === 'active');
        const any = connected ?? store.social.accountsFor(game.companyId, contactId).find((a) => a.status === 'needs_reconnect');
        return {
          contactId, name: store.getContactById(contactId)?.name ?? null, username: any?.username ?? null, accountStatus: any?.status ?? null,
          stats: st ? { posts: st.posts, views: st.views, shares: st.shares, engagement: st.engagement, followerGrowth: st.followerGrowth, updatedAt: st.updatedAt } : null,
        };
      }),
    };
  };

  const notFrozen = (game: Game) => {
    if (game.frozenAt) throw new HttpError(409, 'This game has ended and its results are frozen. Reopen it to make changes.');
    if (game.archivedAt) throw new HttpError(409, 'This game is archived.');
  };

  const base = '/companies/:companyId/games';

  router.get(base, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.games.list(companyId).map((g) => view(ensureFrozen(store, g))));
  }));

  // Connected Instagram accounts a game can read from, and the influencers who can take part.
  router.get('/companies/:companyId/game-accounts', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.social.liveAccounts(companyId).map((a) => ({
      id: a.id, username: a.username, status: a.status, contactId: a.contactId, contactName: store.getContactById(a.contactId)?.name ?? null,
    })));
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
      audience: enumValue(body.audience ?? 'followers', 'audience', ['followers', 'creators'] as const),
      tag: tagOf(body.tag),
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
    if (body.tag !== undefined) fields.tag = tagOf(body.tag);
    if (body.audience !== undefined) {
      fields.audience = enumValue(body.audience, 'audience', ['followers', 'creators'] as const);
      if (fields.audience !== game.audience && game.publishedAt) throw new HttpError(409, 'Who plays cannot change after the game is published.');
    }
    if (body.startsAt !== undefined) fields.startsAt = date(body.startsAt, 'startsAt');
    if (body.endsAt !== undefined) fields.endsAt = date(body.endsAt, 'endsAt');
    if ((fields.endsAt ?? game.endsAt) <= (fields.startsAt ?? game.startsAt)) throw new HttpError(400, 'The game must end after it starts.');
    // Metrics belong to who plays; a new audience starts from none. Only once the request is valid.
    if (fields.audience && fields.audience !== game.audience) store.games.setMetrics(game.id, []);
    res.json(view(store.games.updateGame(game.id, fields)!));
  }));

  router.put(`${base}/:id/metrics`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (!Array.isArray(req.body) || req.body.length === 0 || req.body.length > MAX_METRICS) throw new HttpError(400, `Choose 1 to ${MAX_METRICS} metrics.`);
    const offered = new Set(offeredMetrics(suppliedFor(store, game)).map((m) => m.key));
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

  router.post(`${base}/:id/sources`, authMiddleware, wrap(async (req, res) => {
    const companyId = authorize(req);
    const game = load(companyId, req.params.id);
    notFrozen(game);
    if (game.audience !== 'followers') throw new HttpError(409, 'Creators games read the participants’ own posts; add participants instead.');
    if (store.games.sources(game.id).length >= MAX_SOURCES) throw new HttpError(400, `At most ${MAX_SOURCES} sources.`);
    const body = asRecord(req.body, 'body');
    const kind = enumValue(body.kind, 'kind', ['post', 'tags', 'import'] as const);
    if (kind === 'import') {
      // A likers list staff copy from the post's likes screen; no Meta call involved.
      const permalink = text(body.permalink, 'permalink', 500, true)!;
      const source = store.games.addSource({ gameId: game.id, kind, accountId: '', mediaId: permalinkKey(permalink), permalink });
      if (!source) throw new HttpError(409, 'That post already has a likers list; import into it instead.');
      return res.status(201).json(view(store.games.get(game.id)!));
    }
    if (!deps.metaClient) throw new HttpError(409, 'Instagram is not set up yet.');
    const account = store.social.getAccount(String(body.accountId ?? ''));
    if (!account || account.companyId !== companyId || account.status !== 'active' || !account.tokenSealed) throw new HttpError(400, 'Choose a connected Instagram account.');
    let mediaId = '';
    let permalink: string | null = null;
    if (kind === 'post') {
      permalink = text(body.permalink, 'permalink', 500, true);
      let found: { id: string } | null = null;
      try {
        found = await deps.metaClient.mediaByPermalink(openToken(account.tokenSealed), account.externalId, permalink!);
      } catch {
        throw new HttpError(502, 'Instagram could not be reached. Try again in a minute.');
      }
      if (!found) throw new HttpError(400, `That post is not on @${account.username}'s recent posts.`);
      mediaId = found.id;
    }
    const source = store.games.addSource({ gameId: game.id, kind, accountId: account.id, mediaId, permalink });
    if (!source) throw new HttpError(409, 'That source is already on this game.');
    res.status(201).json(view(store.games.get(game.id)!));
  }));

  // Which connected accounts the game follows: their new posts become sources by themselves.
  router.put(`${base}/:id/tracked-accounts`, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const game = load(companyId, req.params.id);
    notFrozen(game);
    if (game.audience !== 'followers') throw new HttpError(409, 'Creators games already follow their participants.');
    if (!Array.isArray(req.body) || req.body.length > MAX_SOURCES) throw new HttpError(400, `Choose up to ${MAX_SOURCES} accounts.`);
    const ids = [...new Set(req.body.map((v: unknown) => String(v)))];
    for (const id of ids) {
      const a = store.social.getAccount(id);
      if (!a || a.companyId !== companyId || a.status === 'revoked') throw new HttpError(400, 'Choose connected Instagram accounts.');
    }
    store.games.setTrackedAccounts(game.id, ids);
    res.json(view(store.games.get(game.id)!));
  }));

  // Fetch a paced likers list now instead of waiting for its turn.
  router.post(`${base}/:id/sources/:sourceId/fetch-likers`, authMiddleware, wrap(async (req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (!deps.metaClient || !deps.likersFetcher) throw new HttpError(409, 'No likers fetcher is set up.');
    const source = store.games.sources(game.id).find((src) => src.id === req.params.sourceId && src.kind === 'import');
    if (!source) throw new HttpError(404, 'Likers list not found.');
    if (!source.metaMediaId) throw new HttpError(409, 'This post is not on a connected account; paste its likers instead.');
    store.games.updateSource(source.id, { nextLikersAt: null });
    await tickLikersSource(store, deps.metaClient, deps.likersFetcher, game, store.games.sources(game.id).find((src) => src.id === source.id)!);
    res.json(view(store.games.get(game.id)!));
  }));

  // Replaces a likers list. Each handle is one like on that post, timed now (within the game).
  router.post(`${base}/:id/sources/:sourceId/likers`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    const source = store.games.sources(game.id).find((src) => src.id === req.params.sourceId && src.kind === 'import');
    if (!source) throw new HttpError(404, 'Likers list not found.');
    const body = asRecord(req.body, 'body');
    if (typeof body.text !== 'string' || body.text.length > 400_000) throw new HttpError(400, 'Paste the likers, one per line.');
    const { handles, skipped } = parseHandles(body.text);
    if (handles.length > MAX_LIKERS) throw new HttpError(400, `At most ${MAX_LIKERS} likers per post.`);
    const now = Date.now();
    const at = new Date(Math.min(Math.max(now, Date.parse(game.startsAt)), Date.parse(game.endsAt) - 1)).toISOString();
    const existing = new Map(store.games.events(game.id, true).filter((e) => e.sourceId === source.id).map((e) => [e.externalId, e.occurredAt]));
    const rows = handles.map((h) => {
      const externalId = `import:${source.id}:${h}`;
      return { externalId, ...actor(h), action: 'like' as const, postRef: source.mediaId, occurredAt: existing.get(externalId) ?? at, textLength: 0, textHash: null };
    });
    // A paced list also holds fetched likers: a paste adds to it rather than replacing it.
    const { added, removed } = store.games.syncSourceEvents(game.id, source.id, rows, new Date(now).toISOString(), !source.metaMediaId);
    store.games.updateSource(source.id, { dirty: 0, lastCollectedAt: new Date(now).toISOString(), lastError: null });
    res.json({ ...view(store.games.get(game.id)!), imported: { total: handles.length, added, removed, skipped: skipped.slice(0, 20), skippedCount: skipped.length } });
  }));

  router.delete(`${base}/:id/sources/:sourceId`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (!store.games.removeSource(game.id, req.params.sourceId)) throw new HttpError(404, 'Source not found.');
    res.json(view(store.games.get(game.id)!));
  }));

  router.put(`${base}/:id/participants`, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const game = load(companyId, req.params.id);
    notFrozen(game);
    if (game.audience !== 'creators') throw new HttpError(409, 'Only creators games have participants.');
    if (!Array.isArray(req.body) || req.body.length > MAX_PARTICIPANTS) throw new HttpError(400, `Choose up to ${MAX_PARTICIPANTS} influencers.`);
    const ids = [...new Set(req.body.map((v: unknown) => String(v)))];
    for (const id of ids) {
      const c = store.getContactById(id);
      if (!c || c.companyId !== companyId || !c.roles?.includes('Influencer')) throw new HttpError(400, 'Every participant must be one of this company’s influencers.');
    }
    store.games.setParticipants(game.id, ids);
    res.json(view(store.games.get(game.id)!));
  }));

  // Read every source now (the sweep does this hourly and on webhooks).
  router.post(`${base}/:id/collect`, authMiddleware, wrap(async (req, res) => {
    const game = load(authorize(req), req.params.id);
    if (game.frozenAt) throw new HttpError(409, 'Results are frozen.');
    if (!deps.metaClient) throw new HttpError(409, 'Instagram is not set up yet.');
    const errors = await collectGame(store, deps.metaClient, game);
    res.json({ ...view(ensureFrozen(store, store.games.get(game.id)!)), errors });
  }));

  router.post(`${base}/:id/publish`, authMiddleware, wrap((req, res) => {
    const game = load(authorize(req), req.params.id);
    notFrozen(game);
    if (store.games.metrics(game.id).length === 0) throw new HttpError(409, 'Choose how points are earned before publishing.');
    if (game.audience === 'creators' && !game.tag) throw new HttpError(409, 'Set the @handle or #hashtag that marks a game post before publishing.');
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

  // Who the game was run for. Allowed on frozen and archived games: it changes who reads, not the results.
  router.put(`${base}/:id/client`, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const game = load(companyId, req.params.id);
    const body = asRecord(req.body, 'body');
    const contactId = body.contactId === null ? null : typeof body.contactId === 'string' ? body.contactId : undefined;
    if (contactId === undefined) throw new HttpError(400, 'contactId must be a client id or null.');
    if (contactId !== null) {
      const contact = store.getContactById(contactId);
      if (!contact || contact.companyId !== companyId || !contact.roles?.includes('Client')) throw new HttpError(400, 'Choose one of this company\'s clients.');
    }
    res.json(view(store.games.setClient(game.id, contactId)!));
  }));

  /** Who can be invited to a restricted game: the company's staff and its portal users. */
  router.get(`${base}/:id/viewer-candidates`, authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    load(companyId, req.params.id);
    res.json({
      staff: store.listUsers().filter((u) => u.companyIds?.includes(companyId)).map((u) => ({ subjectType: 'user', subjectId: u.id, name: u.name, detail: u.email })),
      portal: store.portal.listUsers(companyId).map((u) => ({
        subjectType: 'portal_user', subjectId: u.id, name: u.name || u.email, detail: `${u.audience === 'client' ? 'Client' : 'Influencer'}${u.contactId ? ` · ${store.getContactById(u.contactId)?.name ?? ''}` : ''}`,
      })),
    });
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
