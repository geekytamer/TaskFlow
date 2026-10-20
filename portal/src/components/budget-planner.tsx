'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogueEntry } from '@/lib/catalogue';
import { formatCompact, formatMoney, formatPercent } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { Goal } from '@/lib/directory-view';
import { planPackages, type Package } from '@/lib/planner';
import { InfluencerPhoto } from './influencer-photo';
import { PeakOrbit } from './peak-orbit';
import { useShortlist } from './shortlist';

/**
 * "Help me choose": the client types a total budget and a head count, and
 * gets up to three ready-made groups from the creators the filters show
 * (biggest reach, highest engagement, best value). Choosing a group adds it
 * to the shortlist, so the request flow that follows is the usual one.
 * Worked out in the browser from what is already on the page.
 */

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const MAX_COUNT = 10;

const fieldBase =
  'h-11 w-full rounded-control border border-field bg-surface text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

function PackageCard({ pkg, budget, currency, lang, featured = false }: { pkg: Package; budget: number; currency: string; lang: Lang; featured?: boolean }) {
  const { ids, addMany } = useShortlist();
  const added = pkg.items.every((e) => ids.includes(e.id));
  const shown = pkg.items.slice(0, 5);
  const left = budget - pkg.costMax;
  return (
    <li className={`chip-in flex flex-col gap-4 rounded-panel border bg-surface p-4 transition-[border-color] duration-200 hover:border-accent/40 ${featured ? 'border-accent/60' : 'border-line'}`}>
      <div>
        {featured && <p className="mb-1.5 inline-flex rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">{t(lang, 'plan.forGoal')}</p>}
        <h3 className="text-[17px] font-extrabold">{t(lang, `plan.${pkg.kind}` as Key)}</h3>
        <p className="mt-0.5 text-sm text-ink-soft">{t(lang, `plan.${pkg.kind}Hint` as Key)}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 -space-x-3 rtl:space-x-reverse">
          {shown.map((e) => (
            <span key={e.id} className="rounded-full ring-2 ring-surface"><InfluencerPhoto id={e.id} name={e.name} photoAt={e.photoAt} /></span>
          ))}
        </div>
        {pkg.items.length > shown.length && <span className="text-sm font-semibold text-ink-soft">+{pkg.items.length - shown.length}</span>}
      </div>
      <ul className="space-y-1 text-sm">
        {pkg.items.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-3">
            <bdi className="truncate font-medium">{e.name}</bdi>
            <span className="shrink-0 tabular-nums text-ink-soft"><bdi>{formatCompact(e.followers, lang)}</bdi></span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-center">
        <div className="rounded-control bg-ink/[0.04] px-2 py-2">
          <dd className="font-bold tabular-nums"><bdi>{formatCompact(pkg.followers, lang)}</bdi></dd>
          <dt className="text-xs text-ink-soft">{t(lang, 'plan.reachTotal')}</dt>
        </div>
        <div className="rounded-control bg-ink/[0.04] px-2 py-2">
          <dd className="font-bold tabular-nums"><bdi dir="ltr">{pkg.engagement === null ? '–' : formatPercent(Math.round(pkg.engagement * 10) / 10, lang)}</bdi></dd>
          <dt className="text-xs text-ink-soft">{t(lang, 'plan.avgEngagement')}</dt>
        </div>
      </dl>
      <div>
        <p className="text-xs text-ink-soft">{t(lang, 'plan.cost')}</p>
        <p className="text-[17px] font-bold tabular-nums"><bdi dir="ltr">{formatMoney(pkg.costMin, currency, lang)} – {formatMoney(pkg.costMax, currency, lang)}</bdi></p>
        {left > 0 && <p className="text-sm text-ink-soft">{fill(t(lang, 'plan.leftOver'), { a: formatMoney(left, currency, lang) })}</p>}
      </div>
      <button type="button" onClick={() => addMany(pkg.items.map((e) => e.id))} disabled={added}
        className={`mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-[15px] font-bold transition-colors duration-150 ${added ? 'border border-success/50 text-success' : 'bg-accent text-accent-ink hover:bg-accent/90'}`}>
        {added && <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
        {t(lang, added ? 'plan.chosen' : 'plan.choose')}
      </button>
    </li>
  );
}

/** The group that suits each campaign goal comes first and is marked. */
const GOAL_PACKAGE: Record<Goal, Package['kind']> = { awareness: 'reach', sales: 'engagement', launch: 'reach' };

export function BudgetPlanner({ items, currency, lang, goal = null }: { items: CatalogueEntry[]; currency: string; lang: Lang; goal?: Goal | null }) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState('');
  const [count, setCount] = useState(3);
  const [ask, setAsk] = useState<{ budget: number; count: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  // Closed, its fields leave the tab order (React 18 has no `inert` prop).
  useEffect(() => { body.current?.toggleAttribute('inert', !open); }, [open]);
  // Re-plans when the filters change the list, against the last request.
  const plan = useMemo(() => (ask ? planPackages(items, ask) : null), [items, ask]);

  // A client on a retainer sees no prices, so there is nothing to plan with.
  if (items.length > 0 && items.every((e) => e.price.kind === 'retainer')) return null;

  const amount = Number.parseInt(budget, 10);
  const canSuggest = Number.isFinite(amount) && amount > 0;

  return (
    <section aria-labelledby="plan-title" className="rounded-[14px] border border-accent/25 bg-accent/[0.04]">
      <button type="button" aria-expanded={open} aria-controls="plan-body" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-[14px] p-4 text-start">
        <PeakOrbit glyph />
        <span className="min-w-0 flex-1">
          <span id="plan-title" className="block text-[17px] font-extrabold">{t(lang, 'plan.open')}</span>
          <span className="block text-sm text-ink-soft">{t(lang, 'plan.intro')}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-5 w-5 shrink-0 text-ink-soft transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
      </button>

      <div id="plan-body" ref={body} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="space-y-4 px-4 pb-4">
            <form onSubmit={(e) => { e.preventDefault(); if (canSuggest) setAsk({ budget: amount, count }); }}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="plan-budget" className="block text-sm font-medium text-ink-soft">{t(lang, 'plan.budget')}</label>
                <div className="relative">
                  <input id="plan-budget" type="text" inputMode="numeric" dir="ltr" autoComplete="off" placeholder="2000"
                    value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
                    className={`${fieldBase} pl-3 pr-14 text-[17px] font-semibold tabular-nums`} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">{currency}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <span id="plan-count-label" className="block text-sm font-medium text-ink-soft">{t(lang, 'plan.count')}</span>
                <div role="group" aria-labelledby="plan-count-label" className="inline-flex h-11 items-center rounded-control border border-field bg-surface">
                  <button type="button" onClick={() => setCount((n) => Math.max(1, n - 1))} disabled={count <= 1} aria-label={t(lang, 'plan.fewer')}
                    className="inline-flex h-full w-11 items-center justify-center text-xl text-ink-soft hover:text-ink disabled:opacity-30">−</button>
                  <output aria-live="polite" className="w-10 text-center text-[17px] font-bold tabular-nums">{count}</output>
                  <button type="button" onClick={() => setCount((n) => Math.min(MAX_COUNT, n + 1))} disabled={count >= MAX_COUNT} aria-label={t(lang, 'plan.more')}
                    className="inline-flex h-full w-11 items-center justify-center text-xl text-ink-soft hover:text-ink disabled:opacity-30">+</button>
                </div>
              </div>
              <button type="submit" disabled={!canSuggest}
                className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-5 text-[15px] font-bold text-accent-ink transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
                {t(lang, 'plan.suggest')}
              </button>
            </form>

            {plan && (
              <div aria-live="polite" className="space-y-3">
                {plan.status === 'over-budget' && (
                  <p className="rounded-control border border-warning/40 bg-warning/[0.06] px-4 py-3 text-[15px]">
                    {fill(t(lang, 'plan.overBudget'), { a: formatMoney(plan.minBudget, currency, lang) })}
                  </p>
                )}
                {plan.status === 'too-few' && (
                  <p className="rounded-control border border-warning/40 bg-warning/[0.06] px-4 py-3 text-[15px]">
                    {fill(t(lang, 'plan.tooFew'), { n: String(plan.available) })}
                  </p>
                )}
                {plan.status === 'ok' && (
                  <ul className="grid gap-3 md:grid-cols-3">
                    {[...plan.packages].sort((a, b) => Number(goal !== null && b.kind === GOAL_PACKAGE[goal]) - Number(goal !== null && a.kind === GOAL_PACKAGE[goal]))
                      .map((p) => <PackageCard key={p.kind} pkg={p} budget={ask!.budget} currency={currency} lang={lang} featured={goal !== null && p.kind === GOAL_PACKAGE[goal]} />)}
                  </ul>
                )}
                <p className="text-sm text-ink-soft">
                  {t(lang, 'plan.note')}
                  {plan.onRequest > 0 && <> {fill(t(lang, 'plan.onRequest'), { n: String(plan.onRequest) })}</>}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
