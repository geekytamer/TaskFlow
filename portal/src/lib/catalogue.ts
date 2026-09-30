import { redirect } from 'next/navigation';
import { backendFetch } from './backend';
import { readSessionToken } from './session';

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
}

async function clientFetch<T>(path: string): Promise<{ status: number; data: T }> {
  const token = await readSessionToken();
  if (!token) redirect('/login');
  const res = await backendFetch<T>('client', path, { token });
  if (res.status === 401) redirect('/login');
  return res;
}

export async function getCatalogue(query: string): Promise<CatalogueList> {
  const res = await clientFetch<CatalogueList>(`/catalogue${query}`);
  if (res.status !== 200) throw new Error(`The catalogue answered ${res.status}.`);
  return res.data;
}

/** Null when the influencer is not listed for this client: the page shows a 404. */
export async function getInfluencer(id: string): Promise<CatalogueEntry | null> {
  const res = await clientFetch<CatalogueEntry>(`/catalogue/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`The catalogue answered ${res.status}.`);
  return res.data;
}
