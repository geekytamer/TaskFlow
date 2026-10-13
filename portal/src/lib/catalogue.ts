import { portalGet, portalGetOrNull } from './client-api';

export interface CataloguePlatform {
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  verified: { asOf: string } | null;
}

export type PriceView =
  | { kind: 'range'; min: number; max: number; currency: string }
  | { kind: 'retainer' }
  | { kind: 'on_request' };

export interface CatalogueEntry {
  id: string;
  name: string;
  niche: string | null;
  location: string | null;
  languages: string[];
  availability: string | null;
  platforms: CataloguePlatform[];
  price: PriceView;
  /** When Peak's stored Instagram photo was taken; null shows initials. */
  photoAt: string | null;
  bio: string | null;
  gender: 'female' | 'male' | null;
  /** The largest audience across platforms. */
  followers: number;
  engagementRate: number | null;
  growth3m: number | null;
  tier: 'nano' | 'micro' | 'mid' | 'macro' | 'mega';
}

export interface CatalogueList {
  items: CatalogueEntry[];
  total: number;
  facets: { platforms: string[]; niches: string[]; locations: string[]; availability: string[]; tiers: CatalogueEntry['tier'][] };
  currency: string;
}

/** Peak's one directory: every influencer Peak can reach for this client. */
export const getCatalogue = (query: string) => portalGet<CatalogueList>(`/directory${query}`);

/** Null when the influencer is hidden or unknown: the page shows a 404. */
export const getInfluencer = (id: string) => portalGetOrNull<CatalogueEntry>(`/directory/${encodeURIComponent(id)}`);
