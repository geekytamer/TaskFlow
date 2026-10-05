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
