import type { BrandGameReport, BrandGameSummary } from './brand-games-types';
import { portalFetch, portalGet } from './client-api';

export const getBrandGames = () => portalGet<BrandGameSummary[]>('/brand-games');

/** Null when this game was not run for the signed-in client. */
export async function getBrandGame(slug: string): Promise<BrandGameReport | null> {
  const res = await portalFetch<BrandGameReport>(`/brand-games/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status}.`);
  return res.data;
}

export const resultsCsvHref = (slug: string) => `/api/brand-games/${encodeURIComponent(slug)}/results`;
export const summaryPdfHref = (slug: string) => `/api/brand-games/${encodeURIComponent(slug)}/summary`;
