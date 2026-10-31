'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { FlexiCardState, FlexiData } from '@/lib/flexi';

/**
 * Home card for Peak Flexi: offer activation, show a request under review,
 * show a rejection with its reason, or show the balance with what is used and
 * what is left.
 */
export function FlexiCard({ lang, data, state }: { lang: Lang; data: FlexiData; state: FlexiCardState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const money = (n: number) => formatMoney(n, data.currency, lang);
  const button = 'inline-flex min-h-11 items-center justify-center rounded-control px-5 text-sm font-bold transition-colors';

  async function withdraw(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/flexi/applications/${encodeURIComponent(id)}/withdraw`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="flexi-title" className="relative overflow-hidden rounded-[28px] border border-white/[0.08] p-6 card-surface sm:p-7">
      <span aria-hidden="true" className="orange-disc -bottom-20 -end-20 h-36 w-36 opacity-50" />
      <div className="relative space-y-4">
        <p className="text-sm font-semibold text-accent">{t(lang, 'join.eyebrow')}</p>

        {state === 'none' && (
          <>
            <h2 id="flexi-title" className="text-[24px] font-extrabold leading-tight">{t(lang, 'fx.noneTitle')}</h2>
            <p className="max-w-xl text-ink-soft">{t(lang, 'fx.noneBody')}</p>
            <Link href="/flexi/activate" className={`${button} bg-accent text-accent-ink hover:bg-accent/90`}>{t(lang, 'fx.activate')}</Link>
          </>
        )}

        {state === 'pending' && (
          <>
            <h2 id="flexi-title" className="text-[24px] font-extrabold leading-tight">{t(lang, 'fx.pendingTitle')}</h2>
            <p className="max-w-xl text-ink-soft">{t(lang, 'fx.pendingBody')}</p>
            {data.open && <button type="button" disabled={busy} onClick={() => withdraw(data.open!.id)} className="text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">{t(lang, 'fx.withdraw')}</button>}
          </>
        )}

        {state === 'rejected' && (
          <>
            <h2 id="flexi-title" className="text-[24px] font-extrabold leading-tight">{t(lang, 'fx.rejectedTitle')}</h2>
            {data.last?.reviewNote && <p className="max-w-xl whitespace-pre-wrap rounded-[14px] bg-white/[0.04] p-4 text-ink-soft">{data.last.reviewNote}</p>}
            <Link href="/flexi/activate" className={`${button} bg-accent text-accent-ink hover:bg-accent/90`}>{t(lang, 'fx.tryAgain')}</Link>
          </>
        )}

        {state === 'enabled' && (
          <>
            <h2 id="flexi-title" className="text-[24px] font-extrabold leading-tight">{t(lang, 'fx.title')}</h2>
            <dl className="grid grid-cols-3 gap-3">
              {([['fx.balance', data.balance.balance], ['fx.used', data.balance.used], ['fx.available', data.balance.available]] as const).map(([key, value]) => (
                <div key={key} className="min-w-0 rounded-[16px] bg-white/[0.04] p-3 sm:p-4">
                  <dt className="text-xs text-ink-soft sm:text-sm">{t(lang, key)}</dt>
                  <dd className={`mt-1 truncate text-[17px] font-extrabold tabular-nums sm:text-[22px] ${key === 'fx.available' ? 'text-accent' : ''}`}><bdi>{money(value)}</bdi></dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-ink-soft"><bdi>{t(lang, 'fx.terms').replace('{p}', String(data.balance.upfrontPct)).replace('{m}', String(data.balance.maxMonths))}</bdi></p>
            {data.open ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-accent/[0.12] px-4 py-3 text-sm font-semibold text-accent">
                <span>{t(lang, 'fx.pendingIncrease')}</span>
                <button type="button" disabled={busy} onClick={() => withdraw(data.open!.id)} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">{t(lang, 'fx.withdraw')}</button>
              </div>
            ) : (
              <Link href="/flexi/increase" className={`${button} border border-white/[0.16] hover:border-ink/50`}>{t(lang, 'fx.increase')}</Link>
            )}
            {!data.open && data.last?.kind === 'increase' && data.last.status === 'rejected' && data.last.reviewNote && (
              <p className="text-sm text-ink-soft">{t(lang, 'fx.rejectedTitle')}: {data.last.reviewNote}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
