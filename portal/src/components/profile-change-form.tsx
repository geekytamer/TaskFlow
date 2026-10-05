'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PLATFORMS, type Profile, type ProfileChanges } from '@/lib/influencer-types';
import { t, type Key, type Lang } from '@/lib/i18n';
import { primaryButton } from './field';

const control =
  'w-full rounded-control border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

interface AccountDraft { id?: string; platform: string; handle: string; url: string; followers: string; engagementRate: string }

const draftOf = (p: Profile): AccountDraft[] => p.accounts.map((a) => ({
  id: a.id, platform: a.platform, handle: a.handle ?? '', url: a.url ?? '',
  followers: a.followers?.toString() ?? '', engagementRate: a.engagementRate?.toString() ?? '',
}));

const numberOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Sends only what changed; staff review it before it applies. */
export function ProfileChangeForm({ lang, profile }: { lang: Lang; profile: Profile }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountDraft[]>(() => draftOf(profile));
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  const setAccount = (i: number, patch: Partial<AccountDraft>) =>
    setAccounts((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changes: ProfileChanges = {};
    const niche = String(form.get('niche') ?? '').trim();
    const location = String(form.get('location') ?? '').trim();
    const languages = String(form.get('languages') ?? '').split(/[,،]/).map((l) => l.trim()).filter(Boolean);
    const rate = String(form.get('rateCard') ?? '').trim();
    if (niche && niche !== (profile.niche ?? '')) changes.niche = niche;
    if (location && location !== (profile.location ?? '')) changes.location = location;
    if (languages.length && languages.join('|') !== profile.languages.join('|')) changes.languages = languages;
    if (rate && Number(rate) !== profile.rateCard.amount) changes.rateCardAmount = Number(rate);

    const original = JSON.stringify(draftOf(profile));
    if (JSON.stringify(accounts) !== original) {
      changes.accounts = accounts
        .filter((a) => a.id || a.handle.trim() || a.url.trim())
        .map((a) => ({
          ...(a.id ? { id: a.id } : {}),
          platform: a.platform,
          ...(a.handle.trim() ? { handle: a.handle.trim() } : {}),
          ...(a.url.trim() ? { url: a.url.trim() } : {}),
          ...(numberOrUndefined(a.followers) !== undefined ? { followers: numberOrUndefined(a.followers) } : {}),
          ...(numberOrUndefined(a.engagementRate) !== undefined ? { engagementRate: numberOrUndefined(a.engagementRate) } : {}),
        }));
    }
    if (Object.keys(changes).length === 0) { setError('prof.errNothing'); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/change-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      });
      if (res.status === 201) { router.refresh(); return; }
      setError(res.status === 409 ? 'prof.errPending' : 'prof.errFailed');
    } catch {
      setError('prof.errFailed');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-xl border border-line bg-surface p-5 md:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{t(lang, 'prof.edit')}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="niche" className="block text-sm font-medium">{t(lang, 'prof.niche')}</label>
          <input id="niche" name="niche" dir="auto" maxLength={80} defaultValue={profile.niche ?? ''} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="location" className="block text-sm font-medium">{t(lang, 'prof.location')}</label>
          <input id="location" name="location" dir="auto" maxLength={80} defaultValue={profile.location ?? ''} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="languages" className="block text-sm font-medium">{t(lang, 'prof.languages')}</label>
          <input id="languages" name="languages" dir="auto" defaultValue={profile.languages.join(lang === 'ar' ? '، ' : ', ')} aria-describedby="languages-hint" className={`${control} h-11`} />
          <p id="languages-hint" className="text-sm text-ink-soft">{t(lang, 'prof.languagesHint')}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="rateCard" className="block text-sm font-medium">{t(lang, 'prof.rateCard')}</label>
          <div className="flex items-center gap-2">
            <input id="rateCard" name="rateCard" type="number" min={0} step="any" inputMode="decimal" defaultValue={profile.rateCard.amount ?? ''} className={`${control} h-11`} />
            <span className="text-sm font-medium text-ink-soft">{profile.rateCard.currency}</span>
          </div>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t(lang, 'prof.accounts')}</legend>
        {accounts.map((a, i) => (
          <div key={a.id ?? `new-${i}`} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[140px_1fr_1fr] md:grid-cols-[130px_1fr_1.4fr_110px_110px]">
            <div className="space-y-1">
              <label htmlFor={`platform-${i}`} className="block text-xs text-ink-soft">{t(lang, 'prof.platform')}</label>
              <select id={`platform-${i}`} value={a.platform} disabled={Boolean(a.id)} onChange={(e) => setAccount(i, { platform: e.target.value })} className={`${control} h-10`}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`handle-${i}`} className="block text-xs text-ink-soft">{t(lang, 'prof.handle')}</label>
              <input id={`handle-${i}`} dir="ltr" value={a.handle} onChange={(e) => setAccount(i, { handle: e.target.value })} className={`${control} h-10`} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`url-${i}`} className="block text-xs text-ink-soft">{t(lang, 'prof.link')}</label>
              <input id={`url-${i}`} dir="ltr" type="url" value={a.url} onChange={(e) => setAccount(i, { url: e.target.value })} className={`${control} h-10`} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`followers-${i}`} className="block text-xs text-ink-soft">{t(lang, 'prof.followers')}</label>
              <input id={`followers-${i}`} type="number" min={0} inputMode="numeric" value={a.followers} onChange={(e) => setAccount(i, { followers: e.target.value })} className={`${control} h-10`} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`engagement-${i}`} className="block text-xs text-ink-soft">{t(lang, 'prof.engagement')}</label>
              <input id={`engagement-${i}`} type="number" min={0} max={100} step="any" inputMode="decimal" value={a.engagementRate} onChange={(e) => setAccount(i, { engagementRate: e.target.value })} className={`${control} h-10`} />
            </div>
          </div>
        ))}
        {accounts.length < 10 && (
          <button
            type="button"
            onClick={() => setAccounts((list) => [...list, { platform: 'Instagram', handle: '', url: '', followers: '', engagementRate: '' }])}
            className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
          >
            {t(lang, 'prof.addAccount')}
          </button>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}
      <button type="submit" disabled={busy} className={`${primaryButton} md:w-auto md:px-8`}>{t(lang, 'prof.submit')}</button>
    </form>
  );
}
