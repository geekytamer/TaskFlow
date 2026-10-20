import type { CatalogueEntry } from './catalogue';
import { CATALOGUE_FILTERS } from './format';

/**
 * The influencer directory's view layer, applied in the portal to what the
 * backend returned (it returns every match, unpaged). The backend's filters,
 * prices and figures are untouched: this only adds filters the backend has
 * no parameter for (a follower ceiling, engagement, 3-month growth) and a
 * "most relevant" order.
 */

export const VIEW_FILTERS = ['maxFollowers', 'minEngagement', 'minGrowth', 'active', 'goal'] as const;
export const DIRECTORY_PARAMS = [...CATALOGUE_FILTERS, ...VIEW_FILTERS] as const;
export type DirectoryParams = Partial<Record<(typeof DIRECTORY_PARAMS)[number], string>>;

export const SORTS = ['relevant', 'followers', 'engagement', 'activity', 'growth', 'price', 'name'] as const;
export type Sort = (typeof SORTS)[number];

/** Orders the portal applies itself (the backend has no parameter for them). */
const PORTAL_SORTS: readonly Sort[] = ['relevant', 'activity'];

/** A campaign goal picks the order: who comes first for what the client wants. */
export const GOALS = ['awareness', 'sales', 'launch'] as const;
export type Goal = (typeof GOALS)[number];
const GOAL_SORT: Record<Goal, Sort> = { awareness: 'followers', sales: 'engagement', launch: 'activity' };

/** Posts a month from which a creator counts as active (about one a week), and very active (about four). */
export const ACTIVE_PER_MONTH = 4;
export const VERY_ACTIVE_PER_MONTH = 16;
/** "Rarely posts" needs at least two weeks of history, so one quiet week never brands anyone. */
const LOW_NEEDS_DAYS = 14;

export type ActivityLevel = 'high' | 'active' | 'low' | 'measuring';
export function activityLevel(a: CatalogueEntry['activity']): ActivityLevel {
  if (!a) return 'measuring';
  if (a.perMonth >= VERY_ACTIVE_PER_MONTH) return 'high';
  if (a.perMonth >= ACTIVE_PER_MONTH) return 'active';
  return a.days >= LOW_NEEDS_DAYS ? 'low' : 'measuring';
}

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
  return DIRECTORY_PARAMS.filter((k) => k !== 'q' && k !== 'sort' && k !== 'goal' && p[k]).length;
}

export const goalOf = (p: DirectoryParams): Goal | null => GOALS.find((g) => g === p.goal) ?? null;

/** The order in force: the one chosen, else most relevant once someone is searching or narrowing. */
export function effectiveSort(p: DirectoryParams): Sort {
  const chosen = SORTS.find((s) => s === p.sort);
  if (chosen) return chosen;
  const goal = goalOf(p);
  if (goal) return GOAL_SORT[goal];
  return p.q || activeFilterCount(p) >= 2 ? 'relevant' : 'followers';
}

/** What goes to the backend: its own filters only, and no sort when ordering by relevance here. */
export function backendQuery(p: DirectoryParams): string {
  const q = new URLSearchParams();
  for (const key of CATALOGUE_FILTERS) {
    const v = key === 'sort' ? (PORTAL_SORTS.includes(effectiveSort(p)) ? '' : effectiveSort(p)) : p[key];
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
    && (minGrowth === null || (e.growth3m !== null && e.growth3m >= minGrowth))
    && (!p.active || (e.activity?.perMonth ?? -1) >= ACTIVE_PER_MONTH));
  const sort = effectiveSort(p);
  // Most active first; those still being measured last, then the backend's order (most followers).
  if (sort === 'activity') {
    return kept.map((e, i) => ({ e, i })).sort((a, b) => (b.e.activity?.perMonth ?? -1) - (a.e.activity?.perMonth ?? -1) || a.i - b.i).map((x) => x.e);
  }
  const q = norm(p.q);
  if (sort !== 'relevant' || !q) return kept;
  // Stable: equal relevance keeps the backend's order (most followers first).
  return kept.map((e, i) => ({ e, i, r: relevance(e, q) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.e);
}

/** Staff mark a creator Unavailable (free text, any case): shown, but not choosable. */
export const isUnavailable = (e: { availability: string | null }) => (e.availability ?? '').trim().toLowerCase() === 'unavailable';
