import { stackedBars } from '@/lib/chart';
import { t, type Lang } from '@/lib/i18n';

export interface ChartSeries { key: string; label: string }

const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * Stacked bars drawn in HTML, so they stay crisp at any width and mirror in
 * Arabic. Series colours come in fixed order from the tokens; the legend names
 * each one with its total, every bar has a worded tooltip, and the same
 * numbers sit in a table under the chart.
 */
export function StackedBarChart({ lang, title, series, rows, emptyText }: {
  lang: Lang;
  title: string;
  series: ChartSeries[];
  rows: Array<{ label: string; key: string } & Record<string, number | string>>;
  emptyText: string;
}) {
  const keys = series.map((s) => s.key);
  const numeric = rows.map((r) => ({ label: r.label, ...Object.fromEntries(keys.map((k) => [k, Number(r[k] ?? 0)])) })) as Array<{ label: string } & Record<string, number>>;
  const geo = stackedBars(numeric, keys, { width: 100, height: 100 });
  const totals = Object.fromEntries(keys.map((k) => [k, numeric.reduce((s, r) => s + (r[k] ?? 0), 0)]));
  const color = (i: number) => `var(--series-${i + 1})`;
  // Thin the date labels so they never collide, even on a phone: at most four.
  const every = Math.max(1, Math.ceil(rows.length / 4));

  return (
    <figure className="space-y-4">
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={t(lang, 'chart.legend')}>
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color(i) }} />
            <span className="text-ink-soft">{s.label}</span>
            <bdi className="font-semibold">{fmt(totals[s.key], lang)}</bdi>
          </li>
        ))}
      </ul>

      {geo.max === 0 ? (
        <p className="rounded-control bg-surface-2 px-4 py-10 text-center text-sm text-ink-soft">{emptyText}</p>
      ) : (
        <div aria-hidden="true">
          <div className="relative h-48">
            {geo.ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(tick / geo.max) * 100}%` }}>
                <span className="absolute -top-2.5 start-0 bg-surface pe-1.5 text-[11px] leading-none text-ink-soft"><bdi>{fmt(tick, lang)}</bdi></span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5 ps-8">
              {geo.bars.map((bar, b) => (
                <div key={bar.label + b} className="group flex h-full flex-1 items-end justify-center"
                  title={`${rows[b].label}: ${series.map((s) => `${s.label} ${numeric[b][s.key]}`).join(', ')}`}>
                  <div className="flex h-full w-full max-w-6 flex-col-reverse gap-[2px] group-hover:opacity-80">
                    {bar.segments.filter((seg) => seg.height > 0).map((seg, i, shown) => (
                      <div key={seg.key} style={{ height: `${seg.height}%`, background: color(keys.indexOf(seg.key)) }}
                        className={`min-h-[2px] ${i === shown.length - 1 ? 'rounded-t-[4px]' : ''}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-0.5 ps-8 text-[11px] text-ink-soft">
            {rows.map((r, i) => (
              <span key={r.key} className="flex flex-1 justify-center whitespace-nowrap">{i % every === 0 ? <bdi>{r.label}</bdi> : ''}</span>
            ))}
          </div>
        </div>
      )}

      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent">{t(lang, 'chart.table')}</summary>
        <div className="mt-2 overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[24rem]">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-surface-2 text-ink-soft">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t(lang, 'chart.date')}</th>
                {series.map((s) => <th key={s.key} scope="col" className="px-3 py-2 text-end font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="px-3 py-2 text-start font-normal"><bdi>{r.label}</bdi></th>
                  {series.map((s) => <td key={s.key} className="px-3 py-2 text-end"><bdi>{Number(r[s.key] ?? 0)}</bdi></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
