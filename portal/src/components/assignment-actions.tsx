'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { primaryButton } from './field';

const secondary =
  'inline-flex h-11 items-center justify-center rounded-control border border-field bg-surface px-5 text-[15px] font-semibold text-ink transition-colors hover:border-ink/60 disabled:opacity-60';

export function AssignmentActions({ id, lang }: { id: string; lang: Lang }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(decision: 'accepted' | 'declined') {
    if (decision === 'declined' && reason.trim().length < 3) { setError('asg.errReason'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${encodeURIComponent(id)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'declined' ? { decision, reason: reason.trim() } : { decision }),
      });
      if (res.ok) { router.refresh(); return; }
      setError('asg.errFailed');
    } catch {
      setError('asg.errFailed');
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {declining ? (
        <div className="space-y-3">
          <label htmlFor={`reason-${id}`} className="block text-sm font-medium">{t(lang, 'asg.declineReason')}</label>
          <textarea
            id={`reason-${id}`}
            dir="auto"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-control border border-field bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed hover:border-ink/60 focus-visible:border-ink"
          />
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => respond('declined')} className={`${primaryButton} w-auto`}>{t(lang, 'asg.send')}</button>
            <button type="button" disabled={busy} onClick={() => { setDeclining(false); setError(null); }} className={secondary}>{t(lang, 'asg.cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => respond('accepted')} className={`${primaryButton} w-auto px-8`}>{t(lang, 'asg.accept')}</button>
          <button type="button" disabled={busy} onClick={() => setDeclining(true)} className={secondary}>{t(lang, 'asg.decline')}</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}
    </div>
  );
}
