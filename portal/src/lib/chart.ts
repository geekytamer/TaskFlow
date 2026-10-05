/** Browser safe. Geometry for small stacked bar charts drawn as SVG. */

/** The axis top: the next 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 step at or above the largest value. */
export function niceMax(value: number): number {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * power >= value)!;
  return Number((step * power).toFixed(10));
}

export interface StackedBar {
  label: string;
  x: number;
  width: number;
  total: number;
  segments: Array<{ key: string; value: number; y: number; height: number }>;
}

export function stackedBars<K extends string>(
  series: Array<{ label: string } & Partial<Record<K, number>>>,
  keys: K[],
  box: { width: number; height: number },
): { bars: StackedBar[]; max: number; ticks: number[] } {
  if (series.length === 0) return { bars: [], max: 0, ticks: [] };
  const totals = series.map((row) => keys.reduce((s, k) => s + (row[k] ?? 0), 0));
  const max = niceMax(Math.max(...totals));
  const slot = box.width / series.length;
  const gap = Math.min(slot * 0.25, 6);
  const scale = (v: number) => (max > 0 ? (v / max) * box.height : 0);
  const bars = series.map((row, i) => {
    let top = box.height;
    const segments = keys.map((key) => {
      const value = row[key] ?? 0;
      const height = scale(value);
      top -= height;
      return { key, value, y: top, height };
    });
    return { label: row.label, x: i * slot + gap / 2, width: slot - gap, total: totals[i], segments };
  });
  return { bars, max, ticks: max > 0 ? [0, max / 2, max] : [] };
}

/** Weekly rows (Monday dates) with the missing weeks between first and last filled with `empty`. */
export function fillWeeks<T extends { week: string }>(rows: T[], empty: Omit<T, 'week'>): T[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.week.localeCompare(b.week));
  const byWeek = new Map(sorted.map((r) => [r.week, r]));
  const out: T[] = [];
  const last = Date.parse(`${sorted[sorted.length - 1].week}T00:00:00Z`);
  for (let t = Date.parse(`${sorted[0].week}T00:00:00Z`); t <= last; t += 7 * 86_400_000) {
    const week = new Date(t).toISOString().slice(0, 10);
    out.push(byWeek.get(week) ?? ({ ...empty, week } as T));
  }
  return out;
}

/**
 * A y-axis for one line: starts at a round step at or below the lowest value
 * (follower counts rarely start near zero) and always reaches the highest.
 */
export function lineAxis(lo: number, hi: number): { min: number; max: number; ticks: number[] } {
  const step = niceMax(Math.max(1, hi - lo)) / 4;
  const min = Math.max(0, Math.floor(lo / step) * step);
  const max = min + niceMax(Math.max(1, hi - min));
  return { min, max, ticks: [min, (min + max) / 2, max] };
}
