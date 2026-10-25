import type { CatalogueEntry } from './catalogue';

/**
 * Comparing two or three creators side by side: one row per measure, the
 * best in each row marked. Only figures the client can already see on the
 * cards are used; a missing figure never wins, and a row where fewer than
 * two creators have a figure marks no one.
 */

export const MAX_COMPARE = 3;

export type RowKey = 'followers' | 'activity' | 'growth' | 'engagement' | 'price' | 'costPerK';

export interface CompareRow { key: RowKey; values: Array<number | null>; best: number[] }

/** Per 1,000 followers, from the middle of the price range; null without a price or followers. */
export function costPerThousand(e: CatalogueEntry): number | null {
  if (e.price.kind !== 'range' || e.followers <= 0) return null;
  return Math.round((((e.price.min + e.price.max) / 2) / e.followers) * 1000 * 10) / 10;
}

const RULES: Array<{ key: RowKey; value: (e: CatalogueEntry) => number | null; higher: boolean }> = [
  { key: 'followers', value: (e) => (e.followers > 0 ? e.followers : null), higher: true },
  { key: 'activity', value: (e) => e.activity?.perMonth ?? null, higher: true },
  { key: 'growth', value: (e) => e.growth3m, higher: true },
  { key: 'engagement', value: (e) => e.engagementRate, higher: true },
  { key: 'price', value: (e) => (e.price.kind === 'range' ? e.price.min : null), higher: false },
  { key: 'costPerK', value: costPerThousand, higher: false },
];

export function compareRows(entries: CatalogueEntry[]): CompareRow[] {
  return RULES.map((r) => {
    const values = entries.map(r.value);
    const known = values.filter((v): v is number => v !== null);
    if (known.length < 2) return { key: r.key, values, best: [] };
    const target = r.higher ? Math.max(...known) : Math.min(...known);
    // A tie for best marks everyone tied; all equal marks no one.
    const best = known.every((v) => v === target) ? [] : values.flatMap((v, i) => (v === target ? [i] : []));
    return { key: r.key, values, best };
  });
}

/** How many rows each creator wins: the one with the most gets the ring. */
export function winsBy(rows: CompareRow[], count: number): number[] {
  const wins = Array.from({ length: count }, () => 0);
  for (const row of rows) for (const i of row.best) wins[i] += 1;
  return wins;
}

/** Ids from the URL, known creators only, no repeats, at most three. */
export function readCompareIds(raw: string | string[] | undefined, known: Set<string>): string[] {
  const list = ([] as string[]).concat(raw ?? []).flatMap((v) => v.split(','));
  return [...new Set(list.map((v) => v.trim()).filter((v) => known.has(v)))].slice(0, MAX_COMPARE);
}
