/**
 * An influencer's niche is one free-text field that often holds several
 * ("Food, Lifestyle"). Same behaviour as backend/src/niches.ts: filters and
 * options work on the single niches inside it.
 */
const SEPARATORS = /[,،;/|\r\n]+/;

/** The niches in a value: trimmed, no empties, de-duplicated ignoring case (first spelling wins). */
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

/** True when one of the value's niches is the wanted one, ignoring case. */
export function hasNiche(value: string | null | undefined, wanted: string): boolean {
  const target = wanted.trim().toLowerCase();
  return splitNiches(value).some((n) => n.toLowerCase() === target);
}

/** Every single niche across the values, de-duplicated ignoring case, sorted. */
export function nicheOptions(values: Array<string | null | undefined>): string[] {
  return splitNiches(values.filter(Boolean).join(',')).sort((a, b) => a.localeCompare(b));
}
