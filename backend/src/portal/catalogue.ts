import type { Contact } from '../types';
import type { PricingProfile } from './catalogue-store';

/**
 * What a client sees about a listed influencer. Built field by field from an
 * allowlist: nothing is copied from the contact wholesale, so a field added to
 * `Contact` later cannot reach a client by accident. Contact details are left
 * out on purpose (a client who can reach an influencer directly can bypass the
 * agency), as are rates, internal notes and staff estimates.
 */
export type PriceView =
  | { kind: 'indicative'; amount: number; currency: string }
  | { kind: 'retainer' }
  | { kind: 'on_request' };

export interface CataloguePlatform {
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
}

export interface CatalogueEntry {
  id: string;
  name: string;
  niche: string | null;
  location: string | null;
  languages: string[];
  availability: string | null;
  platforms: CataloguePlatform[];
  price: PriceView;
}

export interface CatalogueFilter {
  q?: string;
  platform?: string;
  niche?: string;
  availability?: string;
  minFollowers?: number;
}

export const CATALOGUE_LIMIT = 200;

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * The client's price for one influencer. The raw rate never leaves this
 * function: `markup` returns a derived figure whose ratio the client does not
 * know, and every other case returns no figure at all.
 */
export function priceFor(rate: number | undefined | null, profile: PricingProfile | undefined, currency: string): PriceView {
  if (!profile) return { kind: 'on_request' };
  if (profile.mode === 'retainer') return { kind: 'retainer' };
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || profile.markupPercent === null) {
    return { kind: 'on_request' };
  }
  return { kind: 'indicative', amount: Math.round(rate * (1 + profile.markupPercent / 100)), currency };
}

/** Per-platform accounts, or the older single-platform fields when no accounts exist. */
function platformsOf(contact: Contact): CataloguePlatform[] {
  const accounts = contact.influencerAccounts ?? [];
  if (accounts.length > 0) {
    return accounts.map((account) => ({
      platform: account.platform,
      handle: text(account.handle),
      url: safeUrl(account.url),
      followers: num(account.followers),
      avgViews: num(account.avgViews),
      engagementRate: num(account.engagementRate),
    }));
  }
  const platform = text(contact.influencerPlatform);
  if (!platform) return [];
  return [{
    platform,
    handle: text(contact.influencerHandle),
    url: null,
    followers: num(contact.followerCount),
    avgViews: null,
    engagementRate: num(contact.engagementRate),
  }];
}

export function toCatalogueEntry(contact: Contact, price: PriceView): CatalogueEntry {
  return {
    id: contact.id,
    name: contact.name,
    niche: text(contact.influencerNiche),
    location: text(contact.location),
    languages: Array.isArray(contact.languages) ? contact.languages.filter((l) => typeof l === 'string') : [],
    availability: text(contact.availabilityStatus),
    platforms: platformsOf(contact),
    price,
  };
}

const lower = (value: string | null | undefined) => (value ?? '').toLowerCase();

/**
 * Profile links are typed by staff and rendered as links in a client's browser,
 * so only absolute http(s) URLs pass. Anything else (a `javascript:` or `data:`
 * URL, a relative path, a typo) becomes null rather than a live link.
 */
export function safeUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface CatalogueFacets {
  platforms: string[];
  niches: string[];
  availability: string[];
}

const distinctSorted = (values: Array<string | null>) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

/** Filter options drawn from everything the client may browse, not from one filtered page. */
export function facetsOf(entries: CatalogueEntry[]): CatalogueFacets {
  return {
    platforms: distinctSorted(entries.flatMap((e) => e.platforms.map((p) => p.platform))),
    niches: distinctSorted(entries.map((e) => e.niche)),
    availability: distinctSorted(entries.map((e) => e.availability)),
  };
}

export function matchesFilter(entry: CatalogueEntry, filter: CatalogueFilter): boolean {
  if (filter.platform && !entry.platforms.some((p) => lower(p.platform) === lower(filter.platform))) return false;
  if (filter.niche && lower(entry.niche) !== lower(filter.niche)) return false;
  if (filter.availability && lower(entry.availability) !== lower(filter.availability)) return false;
  if (filter.minFollowers !== undefined) {
    const most = Math.max(0, ...entry.platforms.map((p) => p.followers ?? 0));
    if (most < filter.minFollowers) return false;
  }
  const q = lower(filter.q?.trim());
  if (q) {
    const haystack = [entry.name, entry.niche, entry.location, ...entry.platforms.map((p) => p.handle)]
      .map(lower)
      .join(' ');
    if (!haystack.includes(q)) return false;
  }
  return true;
}
