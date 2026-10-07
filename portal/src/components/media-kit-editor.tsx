'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { wsWrite } from '@/lib/workspace-client';
import { KIT_PLATFORMS, type MediaKit, type WsContact } from '@/lib/workspace-types';
import { CopyButton } from './copy-button';
import { control } from './field';
import { button, panel, SectionTitle } from './ui';
import { VerifiedMark } from './verified-mark';

type Row = { platform: string; handle: string; followers: string; engagementRate: string };

/** Edits the media kit in one form; publishing is a separate, explicit switch. */
export function MediaKitEditor({ lang, kit, brands, origin }: { lang: Lang; kit: MediaKit; brands: WsContact[]; origin: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(kit.slug);
  const [featured, setFeatured] = useState<Set<string>>(new Set(kit.featuredContactIds));
  const [rows, setRows] = useState<Row[]>(kit.manualStats.map((s) => ({
    platform: s.platform, handle: s.handle ?? '', followers: s.followers?.toString() ?? '', engagementRate: s.engagementRate?.toString() ?? '',
  })));
  const [status, setStatus] = useState<{ kind: 'error' | 'saved'; key: Key } | null>(null);
  const [busy, setBusy] = useState(false);
  const verifiedPlatforms = new Set(kit.stats.filter((s) => s.verified).map((s) => s.platform));
  const url = `${origin}/kit/${kit.slug}`;

  async function save(extra: Record<string, unknown> = {}, form?: HTMLFormElement) {
    const f = form ? new FormData(form) : null;
    setBusy(true);
    setStatus(null);
    const res = await wsWrite<{ message?: string }>('media-kit', {
      slug,
      ...(f ? { headline: f.get('headline'), bio: f.get('bio'), contactEmail: f.get('contactEmail') } : {}),
      featuredContactIds: [...featured],
      manualStats: rows.filter((r) => r.platform).map((r) => ({
        platform: r.platform, handle: r.handle || null, followers: r.followers === '' ? null : Number(r.followers), engagementRate: r.engagementRate === '' ? null : Number(r.engagementRate),
      })),
      ...extra,
    });
    setBusy(false);
    if (res.ok) { setStatus({ kind: 'saved', key: 'kit.saved' }); router.refresh(); return; }
    setStatus({ kind: 'error', key: res.status === 409 ? 'kit.errTaken' : /address/i.test(res.data?.message ?? '') ? 'kit.errSlug' : 'deal.errFailed' });
  }

  const label = 'block text-sm font-medium';
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void save({}, e.currentTarget); }}
      noValidate
      className="space-y-10"
    >
      <section className={`${panel} flex flex-wrap items-center justify-between gap-4 p-5`} aria-live="polite">
        <div className="min-w-0">
          <p className="font-semibold">{t(lang, kit.published ? 'kit.published' : 'kit.draft')}</p>
          <p className="text-sm text-ink-soft">{t(lang, kit.published ? 'kit.publishedNote' : 'kit.draftNote')}</p>
          {kit.published && <p className="mt-1 truncate text-sm"><a href={url} target="_blank" rel="noreferrer" dir="ltr" className="text-accent underline-offset-4 hover:underline">{url}</a></p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kit.published && <CopyButton value={url} label={t(lang, 'pay.copy')} done={t(lang, 'pay.copied')} />}
          <button
            type="button"
            disabled={busy}
            onClick={(e) => void save({ published: !kit.published }, e.currentTarget.form ?? undefined)}
            className={kit.published ? button.secondary : button.primary}
          >
            {t(lang, kit.published ? 'kit.unpublish' : 'kit.publish')}
          </button>
        </div>
      </section>

      <section className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="kit-slug" className={label}>{t(lang, 'kit.address')}</label>
          <div className="flex items-stretch overflow-hidden rounded-control border border-field focus-within:border-ink" dir="ltr">
            <span className="hidden items-center bg-surface-2 px-3 text-sm text-ink-soft sm:flex">{origin.replace(/^https?:\/\//, '')}/kit/</span>
            <input id="kit-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={40} className="h-11 min-w-0 flex-1 bg-surface px-3 text-[15px] text-ink outline-none" />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="kit-headline" className={label}>{t(lang, 'kit.headline')}</label>
          <input id="kit-headline" name="headline" dir="auto" maxLength={120} defaultValue={kit.headline ?? ''} placeholder={t(lang, 'kit.headlineHint')} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="kit-bio" className={label}>{t(lang, 'kit.bio')}</label>
          <textarea id="kit-bio" name="bio" dir="auto" rows={4} maxLength={1500} defaultValue={kit.bio ?? ''} className={`${control} py-2.5 leading-relaxed`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="kit-email" className={label}>{t(lang, 'kit.contactEmail')}</label>
          <input id="kit-email" name="contactEmail" type="email" dir="ltr" maxLength={200} defaultValue={kit.contactEmail ?? ''} className={`${control} h-11 sm:max-w-sm`} />
        </div>
      </section>

      <section aria-labelledby="kit-stats-title" className="space-y-4">
        <SectionTitle id="kit-stats-title">{t(lang, 'kit.stats')}</SectionTitle>
        <p className="text-sm text-ink-soft">{t(lang, 'kit.statsHint')}</p>
        {verifiedPlatforms.size === 0 && (
          <a href="/connections" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline">{t(lang, 'conn.kitPrompt')}</a>
        )}
        {kit.stats.filter((s) => s.verified).map((s) => (
          <div key={s.platform} className={`${panel} flex items-center justify-between gap-4 px-4 py-3`}>
            <span className="font-medium">{s.platform} <bdi className="text-ink-soft">{s.handle}</bdi></span>
            <span className="flex items-center gap-3"><span className="tabular-nums">{s.followers?.toLocaleString('en-US')}</span><VerifiedMark lang={lang} asOf={s.asOf ?? undefined} compact /></span>
          </div>
        ))}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_8rem_7rem_auto] sm:items-end">
            <div className="space-y-1">
              <label htmlFor={`kit-p-${i}`} className="block text-xs text-ink-soft">{t(lang, 'deal.platform')}</label>
              <select id={`kit-p-${i}`} value={r.platform} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))} className={`${control} h-11`}>
                {KIT_PLATFORMS.filter((p) => !verifiedPlatforms.has(p)).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`kit-h-${i}`} className="block text-xs text-ink-soft">{t(lang, 'kit.handle')}</label>
              <input id={`kit-h-${i}`} dir="ltr" value={r.handle} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)))} className={`${control} h-11`} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`kit-f-${i}`} className="block text-xs text-ink-soft">{t(lang, 'kit.followers')}</label>
              <input id={`kit-f-${i}`} inputMode="numeric" dir="ltr" value={r.followers} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, followers: e.target.value.replace(/[^\d]/g, '') } : x)))} className={`${control} h-11 tabular-nums`} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`kit-e-${i}`} className="block text-xs text-ink-soft">{t(lang, 'kit.engagement')}</label>
              <input id={`kit-e-${i}`} inputMode="decimal" dir="ltr" value={r.engagementRate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, engagementRate: e.target.value } : x)))} className={`${control} h-11 tabular-nums`} />
            </div>
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="inline-flex min-h-11 items-center text-sm font-medium text-ink-soft hover:text-danger">{t(lang, 'kit.removeRow')}</button>
          </div>
        ))}
        {rows.length < 10 && (
          <button type="button" onClick={() => setRows([...rows, { platform: KIT_PLATFORMS.find((p) => !verifiedPlatforms.has(p)) ?? 'Other', handle: '', followers: '', engagementRate: '' }])} className={button.secondary}>
            {t(lang, 'kit.addPlatform')}
          </button>
        )}
      </section>

      <section aria-labelledby="kit-brands-title" className="space-y-3">
        <SectionTitle id="kit-brands-title">{t(lang, 'kit.brands')}</SectionTitle>
        {brands.length === 0 ? <p className="text-ink-soft">{t(lang, 'kit.noBrands')}</p> : (
          <>
            <p className="text-sm text-ink-soft">{t(lang, 'kit.brandsHint')}</p>
            <ul className="flex flex-wrap gap-2">
              {brands.map((b) => {
                const on = featured.has(b.id);
                return (
                  <li key={b.id}>
                    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${on ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line text-ink-soft hover:text-ink'}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => { const n = new Set(featured); if (on) n.delete(b.id); else n.add(b.id); setFeatured(n); }} />
                      <span aria-hidden="true">{on ? '✓' : '+'}</span>
                      <bdi dir="auto">{b.name}</bdi>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy} className={button.primary}>{busy ? t(lang, 'deal.saving') : t(lang, 'kit.save')}</button>
        {status && <p role={status.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${status.kind === 'error' ? 'text-danger' : 'text-success'}`}>{t(lang, status.key)}</p>}
      </div>
    </form>
  );
}
