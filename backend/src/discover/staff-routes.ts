import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { asRecord } from '../validation';
import type { DiscoverScraper } from './apify';
import { growthOver3Months, parseHandleList, tierOf } from './discover';
import { PROFILE_STATUSES, type DiscoverProfile, type ProfilePatch } from './discover-store';
import { DIRECTORY_LIMIT, discoverNew, refreshDue } from './jobs';

type StaffRequest = Request & { user?: SanitizedUser };

export interface DiscoverStaffDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  /** The directory exists only for the portal company. */
  companyId: string;
  requireCompanyAccess(req: StaffRequest, companyId: string): void;
  canManage(req: StaffRequest, companyId: string): boolean;
  /** Absent when no Apify token is set: profiles can still be added and edited, not fetched. */
  scraper?: DiscoverScraper;
  monthlyCap: number;
}

const wrap = (fn: (req: StaffRequest, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req as StaffRequest, res)).catch(next);

const optionalText = (v: unknown, field: string, max: number): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || v.trim().length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return v.trim() || null;
};

/** The staff side of the directory: everything clients see plus contacts, status and source. */
export function createDiscoverStaffRouter(deps: DiscoverStaffDeps): Router {
  const { store, authMiddleware, companyId } = deps;
  const router = Router();

  const authorize = (req: StaffRequest, wanted: string) => {
    if (wanted !== companyId) throw new HttpError(404, 'Not found.');
    deps.requireCompanyAccess(req, wanted);
    if (!deps.canManage(req, wanted)) throw new HttpError(403, 'You do not have permission to manage the influencer directory.');
  };

  const loadProfile = (req: StaffRequest) => {
    const profile = store.discover.get(req.params.id);
    if (!profile || profile.companyId !== companyId) throw new HttpError(404, 'Not found.');
    authorize(req, profile.companyId);
    return profile;
  };

  const view = (p: DiscoverProfile, now = new Date()) => ({
    ...p,
    tier: p.followers !== null ? tierOf(p.followers) : null,
    growth3m: growthOver3Months(store.discover.snapshots(p.id), now),
    contactName: p.contactId ? store.getContactById(p.contactId)?.name ?? null : null,
    requests: store.discover.interestCount(p.id),
  });

  const summary = () => ({
    counts: Object.fromEntries(PROFILE_STATUSES.map((s) => [s, store.discover.list(companyId, s).length])),
    limit: DIRECTORY_LIMIT,
    resultsThisMonth: store.discover.resultsThisMonth(companyId),
    monthlyCap: deps.monthlyCap,
    apifyConfigured: Boolean(deps.scraper),
    running: store.discover.running(companyId) ?? null,
    runs: store.discover.runs(companyId, 10),
    settings: store.discover.settings(companyId),
  });

  /** Runs a job in the background: the request answers at once and the page polls the summary. */
  const start = (job: (scraper: DiscoverScraper) => Promise<unknown>) => {
    if (!deps.scraper) throw new HttpError(409, 'Apify is not set up: add APIFY_TOKEN to the backend settings.');
    if (store.discover.running(companyId)) throw new HttpError(409, 'A run is already in progress.');
    void job(deps.scraper).catch(() => undefined);
  };

  const base = '/companies/:companyId/discover';

  router.get(base, authMiddleware, wrap((req, res) => {
    authorize(req, req.params.companyId);
    const status = PROFILE_STATUSES.find((s) => s === req.query.status);
    const now = new Date();
    res.json({ profiles: store.discover.list(companyId, status).map((p) => view(p, now)), summary: summary() });
  }));

  router.post(`${base}/handles`, authMiddleware, wrap((req, res) => {
    authorize(req, req.params.companyId);
    const body = asRecord(req.body, 'body');
    if (typeof body.text !== 'string' || !body.text.trim()) throw new HttpError(400, 'Paste at least one handle.');
    const { handles, skipped } = parseHandleList(body.text.slice(0, 20_000));
    const known = store.discover.knownUsernames(companyId);
    const fresh = handles.filter((h) => !known.has(h));
    const room = DIRECTORY_LIMIT - store.discover.countActive(companyId);
    if (fresh.length > room) throw new HttpError(409, `The directory holds ${DIRECTORY_LIMIT} profiles; there is room for ${Math.max(0, room)} more.`);
    store.discover.addHandles(companyId, fresh);
    // Fetch the new ones now rather than waiting for the daily refresh.
    if (fresh.length && deps.scraper && !store.discover.running(companyId)) {
      void refreshDue(store, deps.scraper, companyId, { monthlyCap: deps.monthlyCap }).catch(() => undefined);
    }
    res.status(201).json({ added: fresh, alreadyThere: handles.filter((h) => known.has(h)), skipped });
  }));

  router.post(`${base}/refresh`, authMiddleware, wrap((req, res) => {
    authorize(req, req.params.companyId);
    start((scraper) => refreshDue(store, scraper, companyId, { monthlyCap: deps.monthlyCap }));
    res.status(202).json(summary());
  }));

  router.post(`${base}/find`, authMiddleware, wrap((req, res) => {
    authorize(req, req.params.companyId);
    start((scraper) => discoverNew(store, scraper, companyId, { monthlyCap: deps.monthlyCap }));
    res.status(202).json(summary());
  }));

  router.put(`${base}/settings`, authMiddleware, wrap((req, res) => {
    authorize(req, req.params.companyId);
    const body = asRecord(req.body, 'body');
    const hashtags = Array.isArray(body.hashtags)
      ? [...new Set(body.hashtags.map((h) => String(h).trim().replace(/^#+/, '').toLowerCase()).filter((h) => /^[\p{L}\p{N}_]{1,50}$/u.test(h)))]
      : null;
    if (!hashtags || hashtags.length === 0 || hashtags.length > 15) throw new HttpError(400, 'Give between 1 and 15 hashtags.');
    const minFollowers = Number(body.minFollowers);
    const perHashtag = Number(body.perHashtag);
    if (!Number.isInteger(minFollowers) || minFollowers < 1000) throw new HttpError(400, 'Minimum followers must be at least 1,000.');
    if (!Number.isInteger(perHashtag) || perHashtag < 10 || perHashtag > 200) throw new HttpError(400, 'Posts per hashtag must be between 10 and 200.');
    res.json(store.discover.setSettings(companyId, { hashtags, minFollowers, perHashtag }));
  }));

  router.patch('/discover-profiles/:id', authMiddleware, wrap((req, res) => {
    const profile = loadProfile(req);
    const body = asRecord(req.body, 'body');
    const patch: ProfilePatch = {};
    if (body.status !== undefined) {
      const status = PROFILE_STATUSES.find((s) => s === body.status);
      if (!status) throw new HttpError(400, 'Unknown status.');
      // Listed and candidate profiles count towards the limit; bringing back a rejected or removed one needs room.
      const returning = (status === 'listed' || status === 'candidate') && (profile.status === 'rejected' || profile.status === 'removed');
      if (returning && store.discover.countActive(companyId) >= DIRECTORY_LIMIT) {
        throw new HttpError(409, `The directory holds ${DIRECTORY_LIMIT} profiles.`);
      }
      patch.status = status;
    }
    if (body.gender !== undefined) {
      if (body.gender !== null && body.gender !== 'female' && body.gender !== 'male') throw new HttpError(400, 'Gender is female, male or empty.');
      patch.gender = body.gender as ProfilePatch['gender'];
    }
    const location = optionalText(body.location, 'Location', 60);
    if (location !== undefined) patch.location = location;
    const niche = optionalText(body.niche, 'Niche', 60);
    if (niche !== undefined) patch.niche = niche;
    if (body.contactId !== undefined) {
      if (body.contactId === null || body.contactId === '') patch.contactId = null;
      else {
        const contact = store.getContactById(String(body.contactId));
        if (!contact || contact.companyId !== companyId || !contact.roles?.includes('Influencer')) throw new HttpError(400, 'Choose one of Peak\'s influencers.');
        patch.contactId = contact.id;
      }
    }
    res.json(view(store.discover.update(profile.id, patch)!));
  }));

  /** A past follower count from a screenshot or an earlier report, so growth shows before three months of fetching. */
  router.post('/discover-profiles/:id/history', authMiddleware, wrap((req, res) => {
    const profile = loadProfile(req);
    const body = asRecord(req.body, 'body');
    const followers = Number(body.followers);
    const takenAt = typeof body.takenAt === 'string' ? new Date(body.takenAt) : null;
    if (!Number.isInteger(followers) || followers < 0) throw new HttpError(400, 'Followers must be a whole number.');
    if (!takenAt || Number.isNaN(takenAt.getTime()) || takenAt.getTime() > Date.now()) throw new HttpError(400, 'Give a past date.');
    store.discover.addPastSnapshot(profile.id, followers, takenAt.toISOString());
    res.json(view(store.discover.get(profile.id)!));
  }));

  router.get('/discover-profiles/:id/photo', authMiddleware, wrap((req, res) => {
    const profile = loadProfile(req);
    const photo = store.discover.photo(profile.id);
    if (!photo) throw new HttpError(404, 'No photo.');
    res.setHeader('Content-Type', photo.type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(photo.bytes);
  }));

  return router;
}
