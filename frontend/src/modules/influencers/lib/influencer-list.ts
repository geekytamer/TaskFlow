/** Influencer list helpers: account links, size, filters (kept in the address), engagement. Pure, no React. */
import { matchesSearch } from '@/lib/search-normalize';
import { hasNiche } from '@/lib/niches';

export interface InfluencerLike {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  phone?: string | null;
  email?: string | null;
  influencerPlatform?: string | null;
  influencerHandle?: string | null;
  influencerNiche?: string | null;
  followerCount?: number | null;
  engagementRate?: number | null;
  rateCardAmount?: number | null;
  location?: string | null;
  languages?: string[] | null;
  availabilityStatus?: string | null;
  payoutAccounts?: unknown[] | null;
  influencerAccounts?: Array<{ id?: string; platform: string; handle?: string | null; url?: string | null; followers?: number | null; engagementRate?: number | null }> | null;
}

/** Each platform's profile address (backend influencers/handles.ts SITES). */
const PROFILE_URL: Record<string, (h: string) => string> = {
  Instagram: (h) => `https://www.instagram.com/${h}/`,
  TikTok: (h) => `https://www.tiktok.com/@${h}`,
  Snapchat: (h) => `https://www.snapchat.com/add/${h}`,
  YouTube: (h) => `https://www.youtube.com/@${h}`,
  X: (h) => `https://x.com/${h}`,
  'Twitter/X': (h) => `https://x.com/${h}`,
  Facebook: (h) => `https://www.facebook.com/${h}`,
};

/** A handle without the "@" (some were saved with one; the page adds its own). */
export function cleanHandle(raw?: string | null): string {
  return (raw ?? '').trim().replace(/^@+/, '').replace(/\/+$/, '');
}

export function profileUrl(platform: string, handle?: string | null): string | null {
  const h = cleanHandle(handle);
  const build = PROFILE_URL[platform];
  return h && build ? build(encodeURI(h)) : null;
}

/** A name as shown: without the replacement character or control characters. */
export function displayName(raw: string): string {
  return raw.replace(/[�\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim() || raw;
}

export interface AccountLink {
  key: string;
  platform: string;
  handle: string;
  url: string | null;
  followers?: number | null;
  engagementRate?: number | null;
}

/** Every account with somewhere to open it: its saved link, else one built from the handle. */
export function accountLinks(c: InfluencerLike): AccountLink[] {
  const accounts = c.influencerAccounts ?? [];
  if (accounts.length) {
    return accounts.map((a, i) => ({
      key: a.id ?? `${a.platform}-${i}`,
      platform: a.platform,
      handle: cleanHandle(a.handle),
      url: (a.url && /^https?:\/\//i.test(a.url) ? a.url : null) ?? profileUrl(a.platform, a.handle),
      followers: a.followers,
      engagementRate: a.engagementRate,
    }));
  }
  if (c.influencerPlatform && c.influencerHandle) {
    return [{ key: 'main', platform: c.influencerPlatform, handle: cleanHandle(c.influencerHandle), url: profileUrl(c.influencerPlatform, c.influencerHandle), followers: c.followerCount }];
  }
  return [];
}

/** Reach across every platform, else the single-platform figure. */
export function totalFollowers(c: InfluencerLike): number {
  const fromAccounts = (c.influencerAccounts ?? []).reduce((sum, a) => sum + (Number(a.followers) || 0), 0);
  return fromAccounts > 0 ? fromAccounts : Number(c.followerCount) || 0;
}

/**
 * One engagement rate per influencer: across their accounts weighted by each
 * account's followers (a small account's high rate does not speak for the
 * big one), else the single figure.
 */
export function engagementOf(c: InfluencerLike): number | undefined {
  const rated = (c.influencerAccounts ?? []).filter((a) => typeof a.engagementRate === 'number');
  const weight = rated.reduce((s, a) => s + (Number(a.followers) || 0), 0);
  if (rated.length && weight > 0) {
    return round1(rated.reduce((s, a) => s + (a.engagementRate as number) * (Number(a.followers) || 0), 0) / weight);
  }
  if (rated.length) return round1(rated.reduce((s, a) => s + (a.engagementRate as number), 0) / rated.length);
  return typeof c.engagementRate === 'number' ? c.engagementRate : undefined;
}

/** The roster's engagement: each influencer's rate weighted by their reach. */
export function rosterEngagement(list: InfluencerLike[]): number | undefined {
  let sum = 0;
  let weight = 0;
  for (const c of list) {
    const rate = engagementOf(c);
    const followers = totalFollowers(c);
    if (rate === undefined || !followers) continue;
    sum += rate * followers;
    weight += followers;
  }
  return weight ? round1(sum / weight) : undefined;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type SizeTier = 'nano' | 'micro' | 'macro' | 'mega';
export const SIZE_TIERS: SizeTier[] = ['nano', 'micro', 'macro', 'mega'];

/** Nano under 10K, micro to 100K, macro to 1M, mega from 1M. */
export function sizeTierOf(followers: number): SizeTier | null {
  if (!followers) return null;
  if (followers < 10_000) return 'nano';
  if (followers < 100_000) return 'micro';
  if (followers < 1_000_000) return 'macro';
  return 'mega';
}

/** The places in a location ("Muscat, Batinah", "Muscat_Sohar"). */
export function placesOf(location?: string | null): string[] {
  return (location ?? '').split(/[,،_/|;]+/).map((p) => p.trim()).filter(Boolean);
}

/** Every place across the roster, spelled as first seen, by how many influencers name it. */
export function placeOptions(list: InfluencerLike[]): string[] {
  const count = new Map<string, { label: string; n: number }>();
  for (const c of list) {
    for (const p of new Set(placesOf(c.location).map((x) => x.toLowerCase()))) {
      const label = placesOf(c.location).find((x) => x.toLowerCase() === p)!;
      const entry = count.get(p) ?? { label, n: 0 };
      entry.n += 1;
      count.set(p, entry);
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((e) => e.label);
}

export function languageOptions(list: InfluencerLike[]): string[] {
  const seen = new Map<string, string>();
  for (const c of list) for (const l of c.languages ?? []) if (l.trim() && !seen.has(l.trim().toLowerCase())) seen.set(l.trim().toLowerCase(), l.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export type MissingKind = 'phone' | 'rate' | 'payout' | 'account';

export function isMissing(c: InfluencerLike, kind: MissingKind): boolean {
  switch (kind) {
    case 'phone': return !(c.phone ?? '').trim();
    case 'rate': return c.rateCardAmount == null;
    case 'payout': return !(c.payoutAccounts ?? []).length;
    case 'account': return accountLinks(c).every((a) => !a.url);
  }
}

export interface InfluencerFilters {
  q: string;
  platform: string;
  niche: string;
  availability: string;
  place: string;
  language: string;
  size: '' | SizeTier;
  minEngagement: string;
  minRate: string;
  maxRate: string;
  missing: '' | MissingKind;
  sort: 'followers' | 'engagement' | 'rate' | 'name';
}

export const EMPTY_FILTERS: InfluencerFilters = {
  q: '', platform: '', niche: '', availability: '', place: '', language: '', size: '',
  minEngagement: '', minRate: '', maxRate: '', missing: '', sort: 'followers',
};

/** How many filters narrow the list (search and sort not counted). */
export function activeFilterCount(f: InfluencerFilters): number {
  return (['platform', 'niche', 'availability', 'place', 'language', 'size', 'minEngagement', 'minRate', 'maxRate', 'missing'] as const)
    .filter((k) => f[k] !== '').length;
}

export function matchesFilters(c: InfluencerLike, f: InfluencerFilters, opts: { pricing: boolean }): boolean {
  if (f.platform && c.influencerPlatform !== f.platform && !(c.influencerAccounts ?? []).some((a) => a.platform === f.platform)) return false;
  if (f.niche && !hasNiche(c.influencerNiche, f.niche)) return false;
  if (f.availability && c.availabilityStatus !== f.availability) return false;
  if (f.place && !placesOf(c.location).some((p) => p.toLowerCase() === f.place.toLowerCase())) return false;
  if (f.language && !(c.languages ?? []).some((l) => l.trim().toLowerCase() === f.language.toLowerCase())) return false;
  if (f.size && sizeTierOf(totalFollowers(c)) !== f.size) return false;
  if (f.minEngagement && (engagementOf(c) ?? -1) < Number(f.minEngagement)) return false;
  if (opts.pricing && f.minRate && (c.rateCardAmount ?? -1) < Number(f.minRate)) return false;
  if (opts.pricing && f.maxRate && (c.rateCardAmount == null || c.rateCardAmount > Number(f.maxRate))) return false;
  if (f.missing && !isMissing(c, f.missing)) return false;
  if (f.q.trim()) {
    const handles = accountLinks(c).map((a) => a.handle);
    if (!matchesSearch(f.q.replace(/^@+/, ''), c.name, c.nameAr, c.nameEn, c.influencerNiche, c.location, c.phone, ...handles)) return false;
  }
  return true;
}

export function sortInfluencers<T extends InfluencerLike>(list: T[], sort: InfluencerFilters['sort']): T[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case 'name': return displayName(a.name).localeCompare(displayName(b.name));
      case 'engagement': return (engagementOf(b) ?? -1) - (engagementOf(a) ?? -1);
      case 'rate': return (b.rateCardAmount ?? -1) - (a.rateCardAmount ?? -1);
      default: return totalFollowers(b) - totalFollowers(a);
    }
  });
}

const KEYS = Object.keys(EMPTY_FILTERS) as Array<keyof InfluencerFilters>;

/** Filters as address parameters, only those not at their default. */
export function filtersToQuery(f: InfluencerFilters): string {
  const params = new URLSearchParams();
  for (const k of KEYS) if (f[k] !== EMPTY_FILTERS[k]) params.set(k, String(f[k]));
  return params.toString();
}

export function filtersFromQuery(search: string): InfluencerFilters {
  const params = new URLSearchParams(search);
  const f = { ...EMPTY_FILTERS };
  for (const k of KEYS) {
    const v = params.get(k);
    if (v !== null) (f as Record<string, string>)[k] = v;
  }
  if (!['followers', 'engagement', 'rate', 'name'].includes(f.sort)) f.sort = 'followers';
  if (f.size && !SIZE_TIERS.includes(f.size)) f.size = '';
  if (f.missing && !['phone', 'rate', 'payout', 'account'].includes(f.missing)) f.missing = '';
  return f;
}
