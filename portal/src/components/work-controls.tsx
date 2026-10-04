'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatDateTime } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { AssignmentDeliverable } from '@/lib/influencer-types';
import { primaryButton } from './field';

const control =
  'w-full rounded-[10px] border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

const isLink = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/** What the influencer can do with one deliverable at its current stage. */
export function WorkControls({ lang, item }: { lang: Lang; item: AssignmentDeliverable }) {
  const router = useRouter();
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = item.latestSubmission;

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${encodeURIComponent(item.id)}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) { router.refresh(); return; }
      setError(res.status === 400 ? 'work.errLink' : 'work.errFailed');
    } catch {
      setError('work.errFailed');
    }
    setBusy(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contentUrl = String(form.get('contentUrl') ?? '').trim();
    if (!isLink(contentUrl)) { setError('work.errLink'); return; }
    void post('submissions', { contentUrl, caption: String(form.get('caption') ?? '').trim() || undefined });
  }

  function onPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const postUrl = String(new FormData(event.currentTarget).get('postUrl') ?? '').trim();
    if (!isLink(postUrl)) { setError('work.errLink'); return; }
    void post('publish', { postUrl });
  }

  const errorLine = error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>;
  const versionLine = latest && (
    <p className="text-sm text-ink-soft">
      {t(lang, 'work.version')} <bdi>{latest.version}</bdi> · <bdi>{formatDateTime(latest.submittedAt, lang)}</bdi>
      {latest.contentUrl && <> · <a href={latest.contentUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t(lang, 'work.open')}</a></>}
    </p>
  );

  if (item.status === 'published') {
    return item.postUrl
      ? <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t(lang, 'work.viewPost')}</a>
      : null;
  }

  if (item.status === 'submitted') {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium" role="status">{t(lang, item.waitingFor === 'client' ? 'work.waitingClient' : 'work.waitingTeam')}</p>
        {versionLine}
      </div>
    );
  }

  if (item.status === 'approved') {
    return (
      <form onSubmit={onPublish} noValidate className="space-y-3">
        <p className="text-sm font-medium text-accent">{t(lang, 'work.approved')}</p>
        <div className="space-y-1">
          <label htmlFor={`post-${item.id}`} className="block text-sm font-medium">{t(lang, 'work.postUrl')}</label>
          <input id={`post-${item.id}`} name="postUrl" type="url" dir="ltr" inputMode="url" className={`${control} h-11`} />
        </div>
        {errorLine}
        <button type="submit" disabled={busy} className={`${primaryButton} w-auto px-6`}>{t(lang, 'work.publish')}</button>
      </form>
    );
  }

  if (item.status !== 'planned' && item.status !== 'in_progress') return null;
  const changes = latest?.feedback?.decision === 'changes_requested' ? latest.feedback : null;

  return (
    <div className="space-y-3">
      {changes && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm font-semibold text-danger">{t(lang, 'work.changes')}</p>
          {changes.comment && <p dir="auto" className="mt-1 whitespace-pre-line text-sm leading-relaxed">{changes.comment}</p>}
          <div className="mt-1">{versionLine}</div>
        </div>
      )}
      {item.status === 'planned' && !latest ? (
        <button type="button" disabled={busy} onClick={() => post('start', {})} className="inline-flex h-10 items-center rounded-[10px] border border-field bg-surface px-4 text-sm font-semibold hover:border-ink/60 disabled:opacity-60">
          {t(lang, 'work.start')}
        </button>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={`link-${item.id}`} className="block text-sm font-medium">{t(lang, 'work.link')}</label>
          <input id={`link-${item.id}`} name="contentUrl" type="url" dir="ltr" inputMode="url" aria-describedby={`link-hint-${item.id}`} className={`${control} h-11`} />
          <p id={`link-hint-${item.id}`} className="text-sm text-ink-soft">{t(lang, 'work.linkHint')}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`caption-${item.id}`} className="block text-sm font-medium">{t(lang, 'work.caption')}</label>
          <textarea id={`caption-${item.id}`} name="caption" dir="auto" rows={3} maxLength={2200} className={`${control} py-2.5 leading-relaxed`} />
        </div>
        {errorLine}
        <button type="submit" disabled={busy} className={`${primaryButton} w-auto px-6`}>{t(lang, changes ? 'work.resubmit' : 'work.submit')}</button>
      </form>
    </div>
  );
}
