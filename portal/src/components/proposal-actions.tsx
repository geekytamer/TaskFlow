'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Lang } from '@/lib/i18n';

type Mode = 'idle' | 'accepting' | 'declining';

/** Accepting commits the client's company, so it takes a second, explicit confirmation. */
export function ProposalActions({ lang, proposalId, totalLabel }: { lang: Lang; proposalId: string; totalLabel: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(decision: 'accept' | 'decline') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'decline' ? reason : undefined }),
      });
      if (response.ok) {
        setMode('idle');
        router.refresh();
      } else {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(response.status === 409 && data.message ? data.message : t(lang, 'prop.failed'));
      }
    } catch {
      setError(t(lang, 'prop.failed'));
    }
    setBusy(false);
  }

  const solid = 'inline-flex h-11 items-center justify-center rounded-[10px] bg-ink px-6 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60';
  const plain = 'inline-flex h-11 items-center justify-center rounded-[10px] border border-field bg-surface px-5 text-[15px] font-semibold transition-colors hover:border-ink disabled:opacity-60';

  return (
    <div className="space-y-4">
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={solid} onClick={() => setMode('accepting')}>{t(lang, 'prop.accept')}</button>
          <button type="button" className={plain} onClick={() => setMode('declining')}>{t(lang, 'prop.decline')}</button>
        </div>
      )}

      {mode === 'accepting' && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <p className="font-semibold"><bdi dir="ltr">{totalLabel}</bdi></p>
          <p className="text-sm text-ink-soft">{t(lang, 'prop.confirmAccept')}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={solid} disabled={busy} onClick={() => send('accept')}>
              {busy ? t(lang, 'prop.working') : t(lang, 'prop.confirm')}
            </button>
            <button type="button" className={plain} disabled={busy} onClick={() => setMode('idle')}>{t(lang, 'prop.cancel')}</button>
          </div>
        </div>
      )}

      {mode === 'declining' && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <label htmlFor="decline-reason" className="block text-sm font-medium">{t(lang, 'prop.reason')}</label>
          <textarea id="decline-reason" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)}
            aria-describedby="decline-hint"
            className="w-full rounded-[10px] border border-field bg-canvas px-3.5 py-2.5 text-[15px] leading-relaxed focus-visible:border-ink" />
          <p id="decline-hint" className="text-sm text-ink-soft">{t(lang, 'prop.reasonHint')}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={solid} disabled={busy} onClick={() => send('decline')}>
              {busy ? t(lang, 'prop.working') : t(lang, 'prop.confirmDecline')}
            </button>
            <button type="button" className={plain} disabled={busy} onClick={() => setMode('idle')}>{t(lang, 'prop.cancel')}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
