import { portalGet, portalGetOrNull } from './client-api';

export interface CataloguePlatform {
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
  avgViews: number | null;
  engagementRate: number | null;
}

export type PriceView =
  | { kind: 'indicative'; amount: number; currency: string }
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
}

export interface CatalogueList {
  items: CatalogueEntry[];
  total: number;
  facets: { platforms: string[]; niches: string[]; availability: string[] };
  currency: string;
}

export const getCatalogue = (query: string) => portalGet<CatalogueList>(`/catalogue${query}`);

/** Null when the influencer is not listed for this client: the page shows a 404. */
export const getInfluencer = (id: string) => portalGetOrNull<CatalogueEntry>(`/catalogue/${encodeURIComponent(id)}`);
