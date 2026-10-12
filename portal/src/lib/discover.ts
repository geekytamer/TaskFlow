import { portalGet } from './client-api';

export type Tier = 'nano' | 'micro' | 'mid' | 'macro' | 'mega';

/** One creator in Discover: public figures only; contact details stay with Peak. */
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
  catalogueId: string | null;
  lastCheckedAt: string;
  requested: boolean;
}

export interface DiscoverList {
  items: DiscoverEntry[];
  total: number;
  facets: { niches: string[]; locations: string[]; tiers: Tier[] };
}

export const DISCOVER_FILTERS = ['q', 'tier', 'niche', 'location', 'gender', 'peak', 'sort'] as const;

/** The query string the backend understands, from the page's search params; empty values are dropped. */
export function discoverQuery(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const key of DISCOVER_FILTERS) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value) q.set(key, value.slice(0, 60));
  }
  const text = q.toString();
  return text ? `?${text}` : '';
}

export const getDiscover = (query: string) => portalGet<DiscoverList>(`/discover${query}`);

/** "+4.2%", "-1%" or null (the card then says New). */
export function growthLabel(value: number | null): string | null {
  if (value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
