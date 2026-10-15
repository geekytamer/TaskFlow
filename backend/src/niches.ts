/**
 * An influencer's niche is one free-text field, but people type several:
 * "Food, Lifestyle", "طعام، سفر", "Beauty / Fashion". Filters and facets work
 * on the single niches inside it; storage keeps one canonical string.
 */
const SEPARATORS = /[,،;/|\r\n]+/;

/** The niches in a stored value: trimmed, no empties, de-duplicated ignoring case (first spelling wins). */
export function splitNiches(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(SEPARATORS)) {
    const niche = part.trim();
    const key = niche.toLowerCase();
    if (!niche || seen.has(key)) continue;
    seen.add(key);
    out.push(niche);
  }
  return out;
}

/** The canonical stored form ("food, travel"); null when nothing is left; undefined passes through (no change). */
export function normalizeNiches(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const niches = splitNiches(value);
  return niches.length ? niches.join(', ') : null;
}

/** True when one of the value's niches is the wanted one, ignoring case. */
export function hasNiche(value: string | null | undefined, wanted: string): boolean {
  const target = wanted.trim().toLowerCase();
  return splitNiches(value).some((n) => n.toLowerCase() === target);
}

/** Every single niche across the values, de-duplicated ignoring case, sorted. */
export function nicheFacets(values: Array<string | null | undefined>): string[] {
  return splitNiches(values.filter(Boolean).join(',')).sort((a, b) => a.localeCompare(b));
}
