'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { button, panel } from './ui';

type Mode = 'idle' | 'approving' | 'asking';

/**
 * Approve or ask for changes. Approving tells the team the piece can go live,
 * so it takes a second, explicit confirmation, like accepting a proposal.
 */
export function DeliverableReview({ lang, campaignId, deliverableId, title }: { lang: Lang; campaignId: string; deliverableId: string; title: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(decision: 'approved' | 'changes_requested') {
    if (decision === 'changes_requested' && comment.trim().length < 3) {
      setError(t(lang, 'rev.commentShort'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/deliverables/${encodeURIComponent(deliverableId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, comment: decision === 'changes_requested' ? comment : undefined }),
        },
      );
      if (response.ok) {
        router.refresh();
        return;
      }
      setError(t(lang, 'rev.failed'));
    } catch {
      setError(t(lang, 'rev.failed'));
    }
    setBusy(false);
  }

  const fieldId = `changes-${deliverableId}`;
  const cancel = () => { setMode('idle'); setError(null); };

  return (
    <div className="space-y-3">
      {mode === 'idle' && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={button.primary} disabled={busy} onClick={() => setMode('approving')}>{t(lang, 'rev.approve')}</button>
          <button type="button" className={button.secondary} disabled={busy} onClick={() => setMode('asking')}>{t(lang, 'rev.changes')}</button>
        </div>
      )}

      {mode === 'approving' && (
        <div className="space-y-3 rounded-control bg-surface-2 p-4 ring-1 ring-inset ring-line">
          <p className="text-sm"><span className="font-semibold">{t(lang, 'rev.confirmTitle')}</span> <bdi className="text-ink-soft">{title}</bdi></p>
          <p className="text-sm text-ink-soft">{t(lang, 'rev.confirmBody')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={button.primary} disabled={busy} onClick={() => send('approved')}>{busy ? t(lang, 'prop.working') : t(lang, 'rev.confirm')}</button>
            <button type="button" className={button.secondary} disabled={busy} onClick={cancel}>{t(lang, 'prop.cancel')}</button>
          </div>
        </div>
      )}

      {mode === 'asking' && (
        <div className="space-y-2">
          <label htmlFor={fieldId} className="block text-sm font-medium">{t(lang, 'rev.comment')}</label>
          <textarea id={fieldId} rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} dir="auto"
            className="w-full rounded-control border border-field bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed focus-visible:border-ink" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={button.primary} disabled={busy} onClick={() => send('changes_requested')}>{t(lang, 'rev.send')}</button>
            <button type="button" className={button.secondary} disabled={busy} onClick={cancel}>{t(lang, 'prop.cancel')}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
