import type { CatalogueEntry } from './catalogue';
import { isUnavailable } from './directory-view';

/**
 * "Help me choose": up to three ready-made groups of creators for a budget
 * and a head count, from the directory as the client already sees it. Each
 * creator is costed at the top of their price range, so a group never runs
 * past the budget; the proposal still sets the final figure. Creators priced
 * on request (no figure) and those marked unavailable are left out.
 */

export type PackageKind = 'reach' | 'engagement' | 'value';

export interface Package {
  kind: PackageKind;
  items: CatalogueEntry[];
  costMin: number;
  costMax: number;
  followers: number;
  /** Mean of the members' engagement rates that are known; null when none are. */
  engagement: number | null;
}

export type Plan =
  | { status: 'ok'; packages: Package[]; onRequest: number }
  | { status: 'over-budget'; minBudget: number; packages: []; onRequest: number }
  | { status: 'too-few'; available: number; packages: []; onRequest: number };

type Priced = CatalogueEntry & { price: { kind: 'range'; min: number; max: number; currency: string } };

/** Budget slices for the knapsack. Costs round up to a slice, so a chosen group always fits. */
const SLICES = 200;

/** The best `count` creators by `score` whose summed cost stays within the budget (0/1 knapsack with a head count). */
function bestGroup(items: Priced[], count: number, budget: number, score: (e: Priced) => number): Priced[] | null {
  const w = items.map((e) => Math.ceil((e.price.max / budget) * SLICES));
  const NEG = -Infinity;
  // best[j][b]: highest total score using j creators within b slices.
  const best = Array.from({ length: count + 1 }, (_, j) => new Float64Array(SLICES + 1).fill(j === 0 ? 0 : NEG));
  const took = items.map(() => Array.from({ length: count + 1 }, () => new Uint8Array(SLICES + 1)));
  items.forEach((e, i) => {
    const s = score(e);
    for (let j = Math.min(count, i + 1); j >= 1; j--) {
      for (let b = SLICES; b >= w[i]; b--) {
        const cand = best[j - 1][b - w[i]] + s;
        if (cand > best[j][b]) { best[j][b] = cand; took[i][j][b] = 1; }
      }
    }
  });
  if (best[count][SLICES] === NEG) return null;
  // Walk back through the choices.
  const out: Priced[] = [];
  let j = count;
  let b = SLICES;
  for (let i = items.length - 1; i >= 0 && j > 0; i--) {
    if (took[i][j][b]) { out.push(items[i]); b -= w[i]; j -= 1; }
  }
  return j === 0 ? out.reverse() : null;
}

function summarise(kind: PackageKind, items: Priced[]): Package {
  const rates = items.map((e) => e.engagementRate).filter((r): r is number => r !== null);
  return {
    kind,
    items,
    costMin: items.reduce((n, e) => n + e.price.min, 0),
    costMax: items.reduce((n, e) => n + e.price.max, 0),
    followers: items.reduce((n, e) => n + e.followers, 0),
    engagement: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
  };
}

/** The creators a plan can use: a price range to cost, and not marked unavailable. */
export const plannable = (entries: CatalogueEntry[]) => entries.filter((e): e is Priced => e.price.kind === 'range' && !isUnavailable(e));

/** How many groups of `k` there are among `n`, capped (only ever shown as a count). */
export function groupsOf(n: number, k: number, cap = 1_000_000): number {
  if (k > n) return 0;
  let out = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) { out = (out * (n - i + 1)) / i; if (out >= cap) return cap; }
  return Math.round(out);
}

export function planPackages(entries: CatalogueEntry[], ask: { budget: number; count: number }): Plan {
  const onRequest = entries.filter((e) => e.price.kind === 'on_request' && !isUnavailable(e)).length;
  const priced = plannable(entries);
  const count = Math.max(1, Math.floor(ask.count));
  if (priced.length < count) return { status: 'too-few', available: priced.length, packages: [], onRequest };

  // Cheapest first; among equals, the bigger audience.
  const cheapest = [...priced].sort((a, b) => a.price.max - b.price.max || b.followers - a.followers).slice(0, count);
  const floor = cheapest.reduce((n, e) => n + e.price.max, 0);
  if (floor > ask.budget) return { status: 'over-budget', minBudget: floor, packages: [], onRequest };

  const reach = bestGroup(priced, count, ask.budget, (e) => e.followers);
  // Unknown engagement counts as zero, so it is never preferred for this group.
  const engagement = bestGroup(priced, count, ask.budget, (e) => e.engagementRate ?? 0);
  const candidates: Package[] = [
    ...(reach ? [summarise('reach', reach)] : []),
    ...(engagement ? [summarise('engagement', engagement)] : []),
    summarise('value', cheapest),
  ];
  // The same group under two names is shown once, under the first.
  const seen = new Set<string>();
  const packages = candidates.filter((p) => {
    const key = p.items.map((e) => e.id).sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { status: 'ok', packages, onRequest };
}
