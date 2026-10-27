'use client';

import { useState } from 'react';
import { t, type Lang } from '@/lib/i18n';

/**
 * Peak Flexi in numbers: a campaign amount, the share paid up front, and the
 * rest split evenly over 3, 6 or 12 months. An illustration only; the limit,
 * the up-front share and the terms are set per client after review.
 */

const UPFRONT = [35, 40] as const;
const MONTHS = [3, 6, 12] as const;
const MIN = 500;
const MAX = 20_000;
const STEP = 250;

export function flexiPlan(amount: number, upfrontPct: number, months: number) {
  const upfront = Math.round((amount * upfrontPct) / 100);
  const rest = amount - upfront;
  return { upfront, rest, monthly: Math.round((rest / months) * 10) / 10 };
}

export function FlexiCalculator({ lang }: { lang: Lang }) {
  const [amount, setAmount] = useState(3000);
  const [upfrontPct, setUpfrontPct] = useState<(typeof UPFRONT)[number]>(35);
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(6);
  const plan = flexiPlan(amount, upfrontPct, months);
  const num = (v: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-OM', { maximumFractionDigits: 1 }).format(v);
  const monthsLabel = (n: number) => t(lang, n > 10 ? 'flexi.monthsMany' : 'flexi.months').replace('{n}', String(n));
  const omr = (v: number) => `${num(v)} ${t(lang, 'flexi.omr')}`;
  const pct = ((amount - MIN) / (MAX - MIN)) * 100;
  const chip = (on: boolean) => `inline-flex min-h-11 flex-1 items-center justify-center rounded-full border px-4 text-sm font-bold transition-colors ${on ? 'border-accent bg-accent text-accent-ink' : 'border-white/[0.16] text-ink-soft hover:border-ink/50 hover:text-ink'}`;

  return (
    <div className="grid gap-6 rounded-[28px] border border-white/[0.08] p-5 card-surface sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
      <div className="space-y-6">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <label htmlFor="flexi-amount" className="text-sm font-semibold text-ink-soft">{t(lang, 'flexi.amount')}</label>
            <bdi className="text-[26px] font-extrabold tabular-nums">{omr(amount)}</bdi>
          </div>
          {/* Same build as the directory's price slider: a drawn track, the input laid over it. */}
          <div className="relative mx-2.5 h-6">
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/15" />
            <div aria-hidden="true" className="absolute start-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
            <input id="flexi-amount" type="range" min={MIN} max={MAX} step={STEP} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="price-thumb" />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-soft"><bdi>{omr(MIN)}</bdi><bdi>{omr(MAX)}</bdi></div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-soft">{t(lang, 'flexi.upfront')}</legend>
          <div className="flex gap-2">
            {UPFRONT.map((p) => <button key={p} type="button" aria-pressed={upfrontPct === p} onClick={() => setUpfrontPct(p)} className={chip(upfrontPct === p)}><bdi>{p}%</bdi></button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-soft">{t(lang, 'flexi.over')}</legend>
          <div className="flex gap-2">
            {MONTHS.map((m) => <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)} className={chip(months === m)}>{monthsLabel(m)}</button>)}
          </div>
        </fieldset>
      </div>

      <div className="relative overflow-hidden rounded-[22px] bg-canvas/70 p-5 sm:p-6" aria-live="polite">
        <span aria-hidden="true" className="orange-disc -bottom-20 -end-16 h-44 w-44 opacity-90" />
        <dl className="relative space-y-4">
          <div>
            <dt className="text-sm text-ink-soft">{t(lang, 'flexi.payNow')}</dt>
            <dd className="text-[28px] font-extrabold tabular-nums"><bdi>{omr(plan.upfront)}</bdi></dd>
          </div>
          <div className="border-t border-white/[0.08] pt-4">
            <dt className="text-sm text-ink-soft">{t(lang, 'flexi.monthly').replace('{m}', monthsLabel(months))}</dt>
            <dd className="text-[36px] font-extrabold leading-tight text-accent tabular-nums"><bdi>{omr(plan.monthly)}</bdi></dd>
          </div>
        </dl>
        <p className="relative mt-4 border-t border-white/[0.08] pt-4 text-sm font-semibold">{t(lang, 'flexi.campaignStarts')}</p>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft lg:col-span-2">{t(lang, 'flexi.note')}</p>
    </div>
  );
}
