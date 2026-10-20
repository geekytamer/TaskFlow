import type { CatalogueEntry } from './catalogue';
import { effectiveSort, refineDirectory, type DirectoryParams, type Sort } from './directory-view';

/**
 * The directory's filters and orders, run in the browser so a tap answers at
 * once. The page loads every creator the client may see (the backend returns
 * the whole list, unpaged, with this client's own prices), and these mirror
 * the backend's rules in portal/directory.ts (matchesDirectory, sortDirectory)
 * so the result is the same as asking the server. One deliberate difference:
 * a location typed as several places ("Muscat, Nizwa") matches each of them.
 */

const lower = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
const SEPARATORS = /[,،;/|\r\n]+/;

/** The single niches in a free-text niche field ("Lifestyle; Advertising"). */
export const splitNiches = (v: string | null | undefined) => (v ?? '').split(SEPARATORS).map((n) => n.trim()).filter(Boolean);

/** Places people type in Arabic, folded to the name the lists use. */
const PLACE_ALIASES: Record<string, string> = { 'مسقط': 'Muscat', 'صلالة': 'Salalah', 'صحار': 'Sohar', 'نزوى': 'Nizwa', 'صور': 'Sur', 'عبري': 'Ibri', 'البريمي': 'Buraimi', 'بركاء': 'Barka', 'الباطنة': 'Batinah', 'عمان': 'Oman', 'عُمان': 'Oman' };
/** The single places in a location field ("Muscat, Nizwa" is both). */
export const splitPlaces = (v: string | null | undefined) =>
  (v ?? '').split(SEPARATORS).map((p) => p.trim()).filter(Boolean).map((p) => PLACE_ALIASES[p] ?? p);

export function matchesDirectory(e: CatalogueEntry, p: DirectoryParams): boolean {
  if (p.platform && !e.platforms.some((x) => lower(x.platform) === lower(p.platform))) return false;
  if (p.niche && !splitNiches(e.niche).some((n) => lower(n) === lower(p.niche))) return false;
  if (p.location && !splitPlaces(e.location).some((x) => lower(x) === lower(p.location))) return false;
  if ((p.gender === 'female' || p.gender === 'male') && e.gender !== p.gender) return false;
  if (p.tier && e.tier !== p.tier) return false;
  if (p.availability && lower(e.availability) !== lower(p.availability)) return false;
  const int = (v?: string) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const minFollowers = int(p.minFollowers);
  if (minFollowers !== undefined && e.followers < minFollowers) return false;
  let minPrice = int(p.minPrice);
  let maxPrice = int(p.maxPrice);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  if (minPrice !== undefined || maxPrice !== undefined) {
    // "Price on request" has no range to compare, so any price bound leaves it out.
    if (e.price.kind !== 'range') return false;
    if (minPrice !== undefined && e.price.max < minPrice) return false;
    if (maxPrice !== undefined && e.price.min > maxPrice) return false;
  }
  const q = lower(p.q);
  if (q) {
    const hay = [e.name, e.niche, e.location, e.bio, ...e.platforms.map((x) => x.handle)].map(lower).join(' ');
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** The backend's orders; anything else keeps most followers first. */
export function sortDirectory(items: CatalogueEntry[], sort: Sort): CatalogueEntry[] {
  const priceKey = (e: CatalogueEntry) => (e.price.kind === 'range' ? e.price.min : Infinity);
  return [...items].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'price') return priceKey(a) - priceKey(b) || b.followers - a.followers;
    const key = (e: CatalogueEntry) => (sort === 'growth' ? e.growth3m : sort === 'engagement' ? e.engagementRate : e.followers) ?? -Infinity;
    return key(b) - key(a) || b.followers - a.followers;
  });
}

/** Everything the page shows for these params: filtered, then ordered. */
export function applyDirectory(all: CatalogueEntry[], p: DirectoryParams): CatalogueEntry[] {
  const sort = effectiveSort(p);
  const base = sortDirectory(all.filter((e) => matchesDirectory(e, p)), sort === 'relevant' || sort === 'activity' ? 'followers' : sort);
  return refineDirectory(base, p);
}

/** How many creators each option of a list would show, given every other filter as it is. */
export function optionCounts(all: CatalogueEntry[], p: DirectoryParams, key: 'platform' | 'niche' | 'location' | 'gender', options: string[]): Record<string, number> {
  const others = applyDirectory(all, { ...p, [key]: undefined, sort: 'followers' });
  const out: Record<string, number> = {};
  for (const o of options) out[o] = others.filter((e) => matchesDirectory(e, { [key]: o })).length;
  return out;
}

/** The single places across the list, most common first. */
export function placeFacets(all: CatalogueEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const e of all) for (const place of new Set(splitPlaces(e.location))) counts.set(place, (counts.get(place) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([place]) => place);
}
