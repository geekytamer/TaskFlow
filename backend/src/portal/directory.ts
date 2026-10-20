import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact } from '../types';
import { growthOver3Months, maskContacts, postsPerMonth, TIERS, tierOf, type Tier } from '../discover/discover';
import type { DiscoverProfile } from '../discover/discover-store';
import { instagramFigures } from '../discover/figures';
import { priceFor, toCatalogueEntry, type CataloguePlatform, type PriceView } from './catalogue';
import type { SessionRequest } from './common';
import { hasNiche, nicheFacets } from '../niches';

/**
 * The client portal's one influencer directory: Peak's influencers (shown
 * unless hidden) and the Discover profiles staff approved, in one shape.
 * Nothing in an entry says which of the two it came from: to a client every
 * influencer is one Peak can reach. Contact details, rates and notes never
 * appear (see toCatalogueEntry); bios are masked.
 */
export interface DirectoryEntry {
  id: string;
  name: string;
  bio: string | null;
  niche: string | null;
  location: string | null;
  languages: string[];
  gender: 'female' | 'male' | null;
  availability: string | null;
  platforms: CataloguePlatform[];
  followers: number;
  engagementRate: number | null;
  growth3m: number | null;
  /** Posts a month from the weekly snapshots; null until there is enough history. */
  activity: { perMonth: number; days: number } | null;
  tier: Tier;
  /** When Peak's stored photo was taken; null shows initials. */
  photoAt: string | null;
  price: PriceView;
}

export type DirectorySort = 'followers' | 'engagement' | 'growth' | 'price' | 'name';
export const DIRECTORY_SORTS: readonly DirectorySort[] = ['followers', 'engagement', 'growth', 'price', 'name'];

export interface DirectoryFilter {
  q?: string;
  platform?: string;
  niche?: string;
  location?: string;
  gender?: 'female' | 'male';
  tier?: Tier;
  availability?: string;
  minFollowers?: number;
  /** Price per post range: keeps influencers whose own range overlaps [minPrice, maxPrice]. */
  minPrice?: number;
  maxPrice?: number;
}

const lower = (v: string | null | undefined) => (v ?? '').toLowerCase();
const text = (v: unknown, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

export function parseDirectoryQuery(query: Request['query']): { filter: DirectoryFilter; sort: DirectorySort } {
  const int = (v: unknown) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const sort = DIRECTORY_SORTS.find((s) => s === query.sort) ?? 'followers';
  let minPrice = int(query.minPrice);
  let maxPrice = int(query.maxPrice);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    sort,
    filter: {
      q: text(query.q, 100),
      platform: text(query.platform),
      niche: text(query.niche),
      location: text(query.location),
      gender: query.gender === 'female' || query.gender === 'male' ? query.gender : undefined,
      tier: TIERS.find((t) => t === query.tier),
      availability: text(query.availability),
      minFollowers: int(query.minFollowers),
      minPrice,
      maxPrice,
    },
  };
}

export function matchesDirectory(e: DirectoryEntry, f: DirectoryFilter): boolean {
  if (f.platform && !e.platforms.some((p) => lower(p.platform) === lower(f.platform))) return false;
  if (f.niche && !hasNiche(e.niche, f.niche)) return false;
  if (f.location && lower(e.location) !== lower(f.location)) return false;
  if (f.gender && e.gender !== f.gender) return false;
  if (f.tier && e.tier !== f.tier) return false;
  if (f.availability && lower(e.availability) !== lower(f.availability)) return false;
  if (f.minFollowers !== undefined && e.followers < f.minFollowers) return false;
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    // "Price on request" has no range to compare, so any price bound leaves it out.
    if (e.price.kind !== 'range') return false;
    if (f.minPrice !== undefined && e.price.max < f.minPrice) return false;
    if (f.maxPrice !== undefined && e.price.min > f.maxPrice) return false;
  }
  const q = lower(f.q);
  if (q) {
    const hay = [e.name, e.niche, e.location, e.bio, ...e.platforms.map((p) => p.handle)].map(lower).join(' ');
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function sortDirectory(entries: DirectoryEntry[], sort: DirectorySort): DirectoryEntry[] {
  const priceKey = (e: DirectoryEntry) => (e.price.kind === 'range' ? e.price.min : Infinity);
  return [...entries].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'price') return priceKey(a) - priceKey(b) || b.followers - a.followers;
    const key = (e: DirectoryEntry) => (sort === 'growth' ? e.growth3m : sort === 'engagement' ? e.engagementRate : e.followers) ?? -Infinity;
    return key(b) - key(a) || b.followers - a.followers;
  });
}

export function facetsOfDirectory(entries: DirectoryEntry[]) {
  const distinct = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) => a.localeCompare(b));
  return {
    platforms: distinct(entries.flatMap((e) => e.platforms.map((p) => p.platform))),
    niches: nicheFacets(entries.map((e) => e.niche)),
    locations: distinct(entries.map((e) => e.location)),
    availability: distinct(entries.map((e) => e.availability)),
    tiers: TIERS.filter((t) => entries.some((e) => e.tier === t)),
  };
}

export interface DirectoryDeps {
  store: DataStore;
  companyId: string;
  currency(): string;
}

/** Builds the directory as one client sees it (prices follow that client's terms). */
export function buildDirectory(deps: DirectoryDeps, clientContactId: string, now = new Date()): DirectoryEntry[] {
  const { store, companyId } = deps;
  const profile = store.catalogue.getPricingProfile(clientContactId);
  const currency = deps.currency();
  const hidden = store.catalogue.hiddenIds(companyId);
  const photos = store.discover.rosterPhotos(companyId);
  const rosterById = new Map<string, DiscoverProfile>();
  for (const p of store.discover.rosterProfiles(companyId)) if (p.contactId) rosterById.set(p.contactId, p);

  const influencers = store.listContacts(companyId, 'Influencer').filter((c) => !hidden.has(c.id));
  const influencerIds = new Set(store.listContacts(companyId, 'Influencer').map((c) => c.id));
  const fromRoster = influencers.map((c) => rosterEntry(store, c, rosterById.get(c.id), photos[c.id] ?? null,
    priceFor(c.rateCardAmount, profile, currency, store.catalogue.priceRange(c.id)), now));

  // Approved Discover profiles that are not one of Peak's influencers (those appear once, above).
  const fromDiscover = store.discover.list(companyId, 'listed')
    .filter((p) => !p.isRoster && !(p.contactId && influencerIds.has(p.contactId)))
    .filter((p) => p.lastFetchedAt !== null && p.followers !== null)
    .map((p) => discoverEntry(store, p, now));

  return [...fromRoster, ...fromDiscover];
}

function rosterEntry(store: DataStore, c: Contact, p: DiscoverProfile | undefined, photoAt: string | null, price: PriceView, now: Date): DirectoryEntry {
  const base = toCatalogueEntry(c, price, instagramFigures(store, c.companyId, c.id));
  const followers = Math.max(0, ...base.platforms.map((x) => x.followers ?? 0));
  const rates = base.platforms.map((x) => x.engagementRate).filter((r): r is number => r !== null);
  return {
    id: c.id,
    name: base.name,
    bio: p ? maskContacts(p.bio) : null,
    niche: base.niche ?? p?.niche ?? null,
    location: base.location ?? p?.location ?? null,
    languages: base.languages,
    gender: p?.gender ?? null,
    availability: base.availability,
    platforms: base.platforms,
    followers,
    engagementRate: rates.length ? Math.max(...rates) : p?.engagementRate ?? null,
    growth3m: p ? growthOver3Months(store.discover.snapshots(p.id), now) : null,
    activity: p ? postsPerMonth(store.discover.snapshots(p.id), now) : null,
    tier: tierOf(followers),
    photoAt,
    price,
  };
}

function discoverEntry(store: DataStore, p: DiscoverProfile, now: Date): DirectoryEntry {
  return {
    id: p.id,
    name: p.fullName || `@${p.username}`,
    bio: maskContacts(p.bio),
    niche: p.niche,
    location: p.location,
    languages: [],
    gender: p.gender,
    availability: null,
    platforms: [{
      platform: 'Instagram', handle: `@${p.username}`, url: `https://www.instagram.com/${encodeURIComponent(p.username)}/`,
      followers: p.followers, avgViews: null, engagementRate: p.engagementRate, verified: { asOf: p.lastFetchedAt!.slice(0, 10) },
    }],
    followers: p.followers!,
    engagementRate: p.engagementRate,
    growth3m: growthOver3Months(store.discover.snapshots(p.id), now),
    activity: postsPerMonth(store.discover.snapshots(p.id), now),
    tier: tierOf(p.followers!),
    photoAt: p.hasPhoto ? p.lastFetchedAt : null,
    price: { kind: 'on_request' },
  };
}

/** A directory id as something requestable: one of Peak's shown influencers, or an approved Discover profile. */
export function resolveDirectoryId(store: DataStore, companyId: string, id: string):
  | { kind: 'contact'; contact: Contact } | { kind: 'profile'; profile: DiscoverProfile } | null {
  const contact = store.getContactById(id);
  if (contact) {
    const ok = contact.companyId === companyId && contact.roles?.includes('Influencer') && store.catalogue.isListed(companyId, contact.id);
    return ok ? { kind: 'contact', contact } : null;
  }
  const profile = store.discover.get(id);
  if (profile && profile.companyId === companyId && profile.status === 'listed' && !profile.isRoster
    && profile.lastFetchedAt !== null && profile.followers !== null) return { kind: 'profile', profile };
  return null;
}

export function registerClientDirectoryRoutes(router: Router, deps: DirectoryDeps, requireClientSession: RequestHandler): void {
  const { store, companyId } = deps;

  router.get('/client/directory', requireClientSession, (req: SessionRequest, res: Response) => {
    const all = buildDirectory(deps, req.portal!.contactId);
    const { filter, sort } = parseDirectoryQuery(req.query);
    const items = sortDirectory(all.filter((e) => matchesDirectory(e, filter)), sort);
    res.json({ items, total: items.length, facets: facetsOfDirectory(all), currency: deps.currency() });
  });

  router.get('/client/directory/:id', requireClientSession, (req: SessionRequest, res: Response) => {
    const entry = buildDirectory(deps, req.portal!.contactId).find((e) => e.id === req.params.id);
    if (!entry) throw new HttpError(404, 'Not found.');
    res.json(entry);
  });

  router.get('/client/directory/:id/photo', requireClientSession, (req: SessionRequest, res: Response) => {
    const found = resolveDirectoryId(store, companyId, String(req.params.id));
    const photo = found?.kind === 'contact' ? store.discover.photoForContact(companyId, found.contact.id)
      : found?.kind === 'profile' ? store.discover.photo(found.profile.id) : undefined;
    if (!photo) throw new HttpError(404, 'No photo.');
    res.setHeader('Content-Type', photo.type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(photo.bytes);
  });
}
