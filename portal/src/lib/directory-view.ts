import type { CatalogueEntry } from './catalogue';
import { CATALOGUE_FILTERS } from './format';

/**
 * The influencer directory's view layer, applied in the portal to what the
 * backend returned (it returns every match, unpaged). The backend's filters,
 * prices and figures are untouched: this only adds filters the backend has
 * no parameter for (a follower ceiling, engagement, 3-month growth) and a
 * "most relevant" order.
 */

export const VIEW_FILTERS = ['maxFollowers', 'minEngagement', 'minGrowth'] as const;
export const DIRECTORY_PARAMS = [...CATALOGUE_FILTERS, ...VIEW_FILTERS] as const;
export type DirectoryParams = Partial<Record<(typeof DIRECTORY_PARAMS)[number], string>>;

export const SORTS = ['relevant', 'followers', 'engagement', 'growth', 'price', 'name'] as const;
export type Sort = (typeof SORTS)[number];

/** Engagement floors, in percent (4.2 means 4.2%, as the backend stores it). */
export const ENGAGEMENT_STEPS = [2, 3, 5];
/** 3-month growth floors, in percent. 0 means "growing". */
export const GROWTH_STEPS = [0, 5, 10, 25];

const pick = (params: Record<string, string | string[] | undefined>, key: string) => {
  const raw = params[key];
  return ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();
};

export function readParams(params: Record<string, string | string[] | undefined>): DirectoryParams {
  const out: DirectoryParams = {};
  for (const key of DIRECTORY_PARAMS) { const v = pick(params, key); if (v) out[key] = v; }
  return out;
}

/** Filters a person chose, not counting the search box or the order. */
export function activeFilterCount(p: DirectoryParams): number {
  return DIRECTORY_PARAMS.filter((k) => k !== 'q' && k !== 'sort' && p[k]).length;
}

/** The order in force: the one chosen, else most relevant once someone is searching or narrowing. */
export function effectiveSort(p: DirectoryParams): Sort {
  const chosen = SORTS.find((s) => s === p.sort);
  if (chosen) return chosen;
  return p.q || activeFilterCount(p) >= 2 ? 'relevant' : 'followers';
}

/** What goes to the backend: its own filters only, and no sort when ordering by relevance here. */
export function backendQuery(p: DirectoryParams): string {
  const q = new URLSearchParams();
  for (const key of CATALOGUE_FILTERS) {
    const v = key === 'sort' ? (effectiveSort(p) === 'relevant' ? '' : effectiveSort(p)) : p[key];
    if (v) q.set(key, v);
  }
  const text = q.toString();
  return text ? `?${text}` : '';
}

const floor = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : null;
};

const norm = (v: string | null | undefined) => (v ?? '').toLocaleLowerCase().replace(/^@/, '').trim();

/** Lower is better: exact name, name start, handle start, name contains, handle contains, anything else. */
function relevance(e: CatalogueEntry, q: string): number {
  const name = norm(e.name);
  const handles = e.platforms.map((x) => norm(x.handle)).filter(Boolean);
  if (name === q || handles.includes(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (handles.some((h) => h.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  if (handles.some((h) => h.includes(q))) return 4;
  return 5;
}

export function refineDirectory(items: CatalogueEntry[], p: DirectoryParams): CatalogueEntry[] {
  const maxFollowers = floor(p.maxFollowers);
  const minEngagement = floor(p.minEngagement);
  const minGrowth = floor(p.minGrowth);
  const kept = items.filter((e) =>
    (maxFollowers === null || e.followers <= maxFollowers)
    && (minEngagement === null || (e.engagementRate !== null && e.engagementRate >= minEngagement))
    && (minGrowth === null || (e.growth3m !== null && e.growth3m >= minGrowth)));
  const q = norm(p.q);
  if (effectiveSort(p) !== 'relevant' || !q) return kept;
  // Stable: equal relevance keeps the backend's order (most followers first).
  return kept.map((e, i) => ({ e, i, r: relevance(e, q) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.e);
}

/** Staff mark a creator Unavailable (free text, any case): shown, but not choosable. */
export const isUnavailable = (e: { availability: string | null }) => (e.availability ?? '').trim().toLowerCase() === 'unavailable';
