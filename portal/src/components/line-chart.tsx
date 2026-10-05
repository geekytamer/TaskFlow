import { lineAxis } from '@/lib/chart';
import type { Lang } from '@/lib/i18n';

const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * One series over time: a 2px line in the first series colour on a recessive
 * grid. The y-axis starts near the data (follower counts rarely start at zero),
 * and says so with its lowest tick. The line stretches with the width; labels
 * are HTML so they stay sharp and mirror in Arabic.
 */
export function LineChart({ lang, title, points }: { lang: Lang; title: string; points: Array<{ label: string; value: number }> }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const { min, max, ticks } = lineAxis(lo, hi);
  const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const every = Math.max(1, Math.ceil(points.length / 4));

  return (
    <figure aria-label={title}>
      <div className="relative h-44" aria-hidden="true" dir="ltr">
        {ticks.map((tick) => (
          <div key={tick} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${100 - y(tick)}%` }}>
            <span className="absolute -top-2.5 start-0 bg-surface pe-1.5 text-[11px] leading-none text-ink-soft"><bdi>{fmt(tick, lang)}</bdi></span>
          </div>
        ))}
        <div className="absolute inset-0 ps-10">
          {/* Time runs left to right in both languages, as on any chart. */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="mt-2 flex ps-10 text-[11px] text-ink-soft" dir="ltr" aria-hidden="true">
        {points.map((p, i) => <span key={p.label + i} className="flex flex-1 justify-center whitespace-nowrap">{i % every === 0 ? p.label : ''}</span>)}
      </div>
    </figure>
  );
}

/** Shares of a whole as labelled horizontal bars in one hue: biggest first, top `limit`. */
export function ShareBars({ lang, data, labelOf, limit = 5 }: { lang: Lang; data: Record<string, number>; labelOf?: (key: string) => string; limit?: number }) {
  const rows = Object.entries(data).sort(([, a], [, b]) => b - a).slice(0, limit);
  const pct = (v: number) => `${new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { maximumFractionDigits: 0 }).format(v * 100)}%`;
  return (
    <ul className="space-y-2.5">
      {rows.map(([key, value]) => (
        <li key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-soft"><bdi>{labelOf ? labelOf(key) : key}</bdi></span>
          <span className="h-2 overflow-hidden rounded-full bg-ink/[0.06]"><span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.min(100, value * 100)}%` }} /></span>
          <span className="text-end font-semibold"><bdi>{pct(value)}</bdi></span>
        </li>
      ))}
    </ul>
  );
}
