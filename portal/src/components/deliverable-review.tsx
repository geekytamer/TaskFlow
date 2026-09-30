'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Lang } from '@/lib/i18n';

export function DeliverableReview({ lang, campaignId, deliverableId }: { lang: Lang; campaignId: string; deliverableId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
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

  const solid = 'inline-flex h-9 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60';
  const plain = 'inline-flex h-9 items-center rounded-[10px] border border-field bg-surface px-4 text-sm font-semibold transition-colors hover:border-ink disabled:opacity-60';
  const fieldId = `changes-${deliverableId}`;

  return (
    <div className="space-y-3">
      {!asking ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={solid} disabled={busy} onClick={() => send('approved')}>{t(lang, 'rev.approve')}</button>
          <button type="button" className={plain} disabled={busy} onClick={() => setAsking(true)}>{t(lang, 'rev.changes')}</button>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor={fieldId} className="block text-sm font-medium">{t(lang, 'rev.comment')}</label>
          <textarea id={fieldId} rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} dir="auto"
            className="w-full rounded-[10px] border border-field bg-canvas px-3.5 py-2.5 text-[15px] leading-relaxed focus-visible:border-ink" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={solid} disabled={busy} onClick={() => send('changes_requested')}>{t(lang, 'rev.send')}</button>
            <button type="button" className={plain} disabled={busy} onClick={() => { setAsking(false); setError(null); }}>{t(lang, 'prop.cancel')}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
