'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatCompact, formatDateTime } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { SocialAccount } from '@/lib/social-types';
import { primaryButton } from './field';

const quietButton =
  'inline-flex min-h-11 items-center rounded-[10px] border border-field bg-surface px-4 text-sm font-semibold transition-colors hover:border-ink/60 disabled:opacity-60';

/**
 * Instagram connections. Connecting sends the influencer to Instagram and back;
 * the figures that come back are what clients see as verified.
 */
export function ConnectedAccounts({ lang, accounts, notice }: { lang: Lang; accounts: SocialAccount[]; notice: Key | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);

  async function connect() {
    setBusy('connect');
    setError(null);
    try {
      const res = await fetch('/api/social/instagram/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = (await res.json()) as { url?: string };
      if (res.ok && data.url) { window.location.assign(data.url); return; }
      setError(res.status === 404 ? 'social.unavailable' : 'social.errFailed');
    } catch {
      setError('social.errFailed');
    }
    setBusy(null);
  }

  async function disconnect(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/social/${encodeURIComponent(id)}/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) { router.refresh(); return; }
      setError('social.errFailed');
    } catch {
      setError('social.errFailed');
    }
    setBusy(null);
  }

  return (
    <section aria-labelledby="social-title" className="space-y-4">
      <div>
        <h2 id="social-title" className="text-lg font-semibold tracking-tight">{t(lang, 'social.title')}</h2>
        <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-ink-soft">{t(lang, 'social.why')}</p>
      </div>

      {notice && (
        <p role="status" className={`rounded-lg border p-3 text-sm ${notice === 'social.connected' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-danger/30 bg-danger/5 text-danger'}`}>
          {t(lang, notice)}
        </p>
      )}

      {accounts.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  Instagram <bdi dir="ltr" className="ms-1 text-ink-soft">@{a.username}</bdi>
                </p>
                <p className="text-sm text-ink-soft">
                  {a.status === 'needs_reconnect'
                    ? <span className="font-medium text-danger">{t(lang, 'social.needsReconnect')}</span>
                    : <>
                        {a.followers !== null && <>{t(lang, 'prof.followers')} <bdi className="tabular-nums font-medium text-ink">{formatCompact(a.followers, lang)}</bdi> · </>}
                        {t(lang, 'social.lastSynced')} <bdi>{a.lastSyncAt ? formatDateTime(a.lastSyncAt, lang) : '-'}</bdi>
                      </>}
                </p>
              </div>
              <div className="flex gap-2">
                {a.status === 'needs_reconnect' && (
                  <button type="button" onClick={connect} disabled={busy !== null} className={`${primaryButton} w-auto px-5`}>{t(lang, 'social.reconnect')}</button>
                )}
                <button type="button" onClick={() => disconnect(a.id)} disabled={busy !== null} className={quietButton}>
                  {busy === a.id ? t(lang, 'social.working') : t(lang, 'social.disconnect')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!accounts.some((a) => a.status === 'active') && (
        <button type="button" onClick={connect} disabled={busy !== null} className={`${primaryButton} md:w-auto md:px-8`}>
          {busy === 'connect' ? t(lang, 'social.working') : t(lang, 'social.connect')}
        </button>
      )}
      <p className="max-w-[65ch] text-xs leading-relaxed text-ink-soft">{t(lang, 'social.privacy')}</p>
      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}
    </section>
  );
}
