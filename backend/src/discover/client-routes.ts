import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { notifyManager, raiseFollowup, type SessionRequest } from '../portal/common';
import { growthOver3Months, maskContacts, TIERS, tierOf, type Tier } from './discover';
import type { DiscoverProfile } from './discover-store';

/** What a client sees of a directory profile: public facts only, contacts hidden. */
export interface DiscoverEntry {
  id: string;
  platform: 'instagram';
  username: string;
  fullName: string | null;
  bio: string | null;
  followers: number;
  growth3m: number | null;
  engagementRate: number | null;
  tier: Tier;
  verified: boolean;
  category: string | null;
  location: string | null;
  gender: 'female' | 'male' | null;
  niche: string | null;
  hasPhoto: boolean;
  /** Set when the account belongs to an influencer Peak works with and lists in the catalogue. */
  catalogueId: string | null;
  lastCheckedAt: string;
  requested: boolean;
}

type Sort = 'followers' | 'growth' | 'engagement';

const queryString = (value: unknown, max = 60): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** Listed profiles that have been fetched at least once: the only ones clients ever see. */
const visible = (p: DiscoverProfile) => p.status === 'listed' && p.lastFetchedAt !== null && p.followers !== null;

export function registerClientDiscoverRoutes(router: Router, store: DataStore, companyId: string, requireClientSession: RequestHandler): void {
  const toEntry = (p: DiscoverProfile, requested: Set<string>, now: Date): DiscoverEntry => ({
    id: p.id,
    platform: p.platform,
    username: p.username,
    fullName: p.fullName,
    bio: maskContacts(p.bio),
    followers: p.followers!,
    growth3m: growthOver3Months(store.discover.snapshots(p.id), now),
    engagementRate: p.engagementRate,
    tier: tierOf(p.followers!),
    verified: p.verified,
    category: p.category,
    location: p.location,
    gender: p.gender,
    niche: p.niche,
    hasPhoto: p.hasPhoto,
    catalogueId: p.contactId && store.catalogue.isListed(companyId, p.contactId) ? p.contactId : null,
    lastCheckedAt: p.lastFetchedAt!,
    requested: requested.has(p.id),
  });

  const load = (req: Request) => {
    const profile = store.discover.get(req.params.id);
    if (!profile || profile.companyId !== companyId || !visible(profile)) throw new HttpError(404, 'Not found.');
    return profile;
  };

  router.get('/client/discover', requireClientSession, (req: SessionRequest, res: Response) => {
    const now = new Date();
    const requested = store.discover.requestedBy(req.portal!.contactId);
    const all = store.discover.list(companyId, 'listed').filter(visible).map((p) => toEntry(p, requested, now));
    const q = queryString(req.query.q)?.toLowerCase();
    const tier = TIERS.find((t) => t === req.query.tier);
    const niche = queryString(req.query.niche);
    const location = queryString(req.query.location);
    const gender = req.query.gender === 'female' || req.query.gender === 'male' ? req.query.gender : undefined;
    const peakOnly = req.query.peak === '1';
    const sort: Sort = req.query.sort === 'growth' || req.query.sort === 'engagement' ? req.query.sort : 'followers';

    const items = all
      .filter((e) => !q || [e.username, e.fullName ?? '', e.bio ?? '', e.niche ?? '', e.category ?? ''].some((v) => v.toLowerCase().includes(q)))
      .filter((e) => !tier || e.tier === tier)
      .filter((e) => !niche || e.niche === niche)
      .filter((e) => !location || e.location === location)
      .filter((e) => !gender || e.gender === gender)
      .filter((e) => !peakOnly || e.catalogueId !== null)
      .sort((a, b) => {
        const key = (e: DiscoverEntry) => (sort === 'growth' ? e.growth3m : sort === 'engagement' ? e.engagementRate : e.followers) ?? -Infinity;
        return key(b) - key(a) || b.followers - a.followers;
      });

    const distinct = (values: Array<string | null>) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
    res.json({
      items,
      total: items.length,
      facets: { niches: distinct(all.map((e) => e.niche)), locations: distinct(all.map((e) => e.location)), tiers: TIERS },
    });
  });

  router.get('/client/discover/:id/photo', requireClientSession, (req: SessionRequest, res: Response) => {
    const profile = load(req);
    const photo = store.discover.photo(profile.id);
    if (!photo) throw new HttpError(404, 'No photo.');
    res.setHeader('Content-Type', photo.type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(photo.bytes);
  });

  /** "Request through Peak": the account manager gets a follow-up to reach the influencer; once per client and profile. */
  router.post('/client/discover/:id/request', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const profile = load(req);
    const contact = store.getContactById(session.contactId);
    if (!contact) throw new HttpError(404, 'Not found.');
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
    const managerId = contact.ownerUserId ?? store.portal.inviterOf(session.portalUserId) ?? undefined;
    const title = `${contact.name} asked for @${profile.username}`;

    store.transaction(() => {
      const fresh = store.discover.recordInterest({ companyId, profileId: profile.id, clientContactId: contact.id, portalUserId: session.portalUserId, followupId: null });
      if (!fresh) return;
      const followup = raiseFollowup(store, {
        companyId, entityType: 'contact', entityId: contact.id, title, priority: 'high', ownerUserId: managerId, dueDays: 2,
        notes: [`Requested from Discover in the client portal by ${session.name}.`,
          `Instagram: https://www.instagram.com/${profile.username}/ (${profile.followers ?? 0} followers).`,
          profile.contactId ? 'Already on Peak\'s roster.' : 'Not on Peak\'s roster yet: reach out and sign them.',
          note ? `Client's note: ${note}` : ''].filter(Boolean).join('\n'),
        sourceTrigger: 'portal_discover_request', sourceType: 'discover_profile', sourceId: profile.id,
      });
      notifyManager(store, {
        companyId, managerId, title, body: note ?? undefined, link: '/crm/followups', entityType: 'follow_up', entityId: followup.id,
      });
    });
    res.status(201).json({ requested: true });
  });
}
