'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatCompact, formatDateTime } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { SocialAccount } from '@/lib/social-types';
import { button, panel } from './ui';
import { VerifiedMark } from './verified-mark';

/** Platforms the portal names. Only Instagram can connect today; the others say so instead of offering a dead button. */
const COMING = ['TikTok', 'YouTube', 'Snapchat'] as const;

/**
 * One card per platform, each saying in words where it stands: connected (with
 * the handle, followers and last update), needing a reconnect, not connected,
 * or not available yet. Connecting goes to Instagram and comes back here.
 */
export function ConnectedAccounts({ lang, accounts, notice }: { lang: Lang; accounts: SocialAccount[]; notice: Key | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const live = accounts.filter((a) => a.status === 'active' || a.status === 'needs_reconnect');

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
    <div className="space-y-6">
      {notice && (
        <p role="status" className={`rounded-panel border p-4 text-sm ${notice === 'social.connected' ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/5 text-danger'}`}>
          {t(lang, notice)}
        </p>
      )}

      <ul className="space-y-3">
        <li className={`${panel} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <InstagramGlyph />
              <div className="min-w-0">
                <h2 className="font-semibold">Instagram</h2>
                {live.length === 0 ? (
                  <p className="text-sm text-ink-soft">{t(lang, 'conn.notConnected')} · {t(lang, 'conn.needsBusiness')}</p>
                ) : live.map((a) => (
                  <div key={a.id} className="mt-0.5 space-y-0.5 text-sm">
                    <p>
                      <span className="text-ink-soft">{t(lang, 'conn.connectedAs')}</span> <bdi dir="ltr" className="font-medium">@{a.username}</bdi>
                      {a.status === 'active' && <span className="ms-2 inline-block align-middle"><VerifiedMark lang={lang} compact /></span>}
                    </p>
                    {a.status === 'needs_reconnect' ? (
                      <p className="font-medium text-danger">{t(lang, 'social.needsReconnect')}</p>
                    ) : (
                      <p className="text-ink-soft">
                        {a.followers !== null && <>{t(lang, 'prof.followers')} <bdi className="font-medium tabular-nums text-ink">{formatCompact(a.followers, lang)}</bdi> · </>}
                        {t(lang, 'social.lastSynced')} <bdi>{a.lastSyncAt ? formatDateTime(a.lastSyncAt, lang) : '-'}</bdi>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {live.length === 0 && (
                <button type="button" onClick={connect} disabled={busy !== null} className={button.primary}>
                  {busy === 'connect' ? t(lang, 'social.working') : t(lang, 'social.connect')}
                </button>
              )}
              {live.some((a) => a.status === 'needs_reconnect') && (
                <button type="button" onClick={connect} disabled={busy !== null} className={button.primary}>{t(lang, 'social.reconnect')}</button>
              )}
              {live.map((a) => (
                <button key={a.id} type="button" onClick={() => disconnect(a.id)} disabled={busy !== null} className={button.secondary}>
                  {busy === a.id ? t(lang, 'social.working') : t(lang, 'social.disconnect')}
                </button>
              ))}
            </div>
          </div>
        </li>

        {COMING.map((name) => (
          <li key={name} className={`${panel} flex flex-wrap items-center justify-between gap-3 p-5`}>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink-soft">{name}</h2>
              <p className="text-sm text-ink-soft">{t(lang, 'conn.soonBody')}</p>
            </div>
            <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{t(lang, 'conn.soon')}</span>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}

      <section aria-labelledby="what-title" className="space-y-1.5">
        <h2 id="what-title" className="text-base font-semibold">{t(lang, 'conn.whatTitle')}</h2>
        <p className="max-w-[65ch] leading-relaxed text-ink-soft">{t(lang, 'conn.whatBody')}</p>
        <p className="max-w-[65ch] text-sm leading-relaxed text-ink-soft">{t(lang, 'social.privacy')}</p>
      </section>
    </div>
  );
}

function InstagramGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.2 6.8h.01" />
    </svg>
  );
}
