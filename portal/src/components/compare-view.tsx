'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogueEntry } from '@/lib/catalogue';
import { compareRows, costPerThousand, MAX_COMPARE, winsBy, type RowKey } from '@/lib/compare';
import { nicheLabel, placeLabel } from '@/lib/directory-labels';
import { splitNiches, splitPlaces } from '@/lib/directory-match';
import { isUnavailable } from '@/lib/directory-view';
import { formatCompact, formatMoney, formatPercent, listSep } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';
import { shortlistHref } from '@/lib/shortlist';
import { InfluencerPhoto } from './influencer-photo';
import { button } from './ui';

/**
 * Two or three creators side by side. Each row shows one measure; the best
 * in the row is lit orange with a star, and the creator who wins most rows
 * gets the orange ring. A plain-words line on top says who leads in what.
 * The picks sit in the URL (?ids=), so a comparison can be shared.
 */

const display = { fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif' };
const ROW_LABEL: Record<RowKey, Key> = {
  followers: 'cat.followers', activity: 'dir.activity', growth: 'disc.growth', engagement: 'cat.engagement', price: 'cmp.price', costPerK: 'cmp.costPerK',
};
const WIN_WORD: Record<RowKey, Key> = {
  followers: 'cmp.win.followers', activity: 'cmp.win.activity', growth: 'cmp.win.growth', engagement: 'cmp.win.engagement', price: 'cmp.win.price', costPerK: 'cmp.win.costPerK',
};

function writeUrl(ids: string[]) {
  const sp = new URLSearchParams(window.location.search);
  sp.delete('ids');
  for (const id of ids) sp.append('ids', id);
  const text = sp.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${text ? `?${text}` : ''}`);
}

export function CompareView({ all, initial, lang }: { all: CatalogueEntry[]; initial: string[]; lang: Lang }) {
  const [ids, setIds] = useState(initial);
  const [query, setQuery] = useState('');
  const picker = useRef<HTMLDialogElement>(null);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const picked = ids.map((id) => byId.get(id)).filter((e): e is CatalogueEntry => Boolean(e));
  // A row nobody has a figure for yet (still measuring) is only dashes: leave it out.
  const rows = compareRows(picked).filter((r) => r.values.some((v) => v !== null));
  const wins = winsBy(rows, picked.length);
  const top = picked.length >= 2 ? Math.max(...wins) : 0;

  useEffect(() => { writeUrl(ids); try { sessionStorage.setItem('peak-compare', JSON.stringify(ids)); } catch { /* storage may be off */ } }, [ids]);

  const sep = lang === 'ar' ? '، ' : ', ';
  const num = (v: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-OM').format(v);
  const cell = (key: RowKey, e: CatalogueEntry): string => {
    switch (key) {
      case 'followers': return formatCompact(e.followers, lang);
      case 'activity': return e.activity ? t(lang, 'cmp.perMonth').replace('{n}', num(e.activity.perMonth)) : '–';
      case 'growth': return e.growth3m === null ? '–' : `${e.growth3m > 0 ? '+' : ''}${Math.round(e.growth3m * 10) / 10}%`;
      case 'engagement': return e.engagementRate === null ? '–' : formatPercent(e.engagementRate, lang);
      case 'price': return e.price.kind === 'range' ? `${formatMoney(e.price.min, e.price.currency, lang)} – ${formatMoney(e.price.max, e.price.currency, lang)}` : t(lang, e.price.kind === 'retainer' ? 'cat.retainer' : 'cat.onRequest');
      case 'costPerK': { const c = costPerThousand(e); return c === null || e.price.kind !== 'range' ? '–' : `${num(c)} ${e.price.currency}`; }
    }
  };
  // "Sara: more active, cheaper." One line per creator who leads in something.
  const summary = picked.map((e, i) => ({ e, words: rows.filter((r) => r.best.includes(i)).map((r) => t(lang, WIN_WORD[r.key])) })).filter((s) => s.words.length);

  const q = query.trim().toLowerCase();
  const hay = (e: CatalogueEntry) => [e.name, ...splitNiches(e.niche).flatMap((n) => [n, nicheLabel(n, lang)])].join(' ').toLowerCase();
  const candidates = all.filter((e) => !ids.includes(e.id) && (!q || hay(e).includes(q))).slice(0, 24);
  // Narrower minimums on phones so two creators fit; a third scrolls inside the box.
  const cols = `minmax(var(--cmp-label), 0.8fr) repeat(${Math.max(picked.length + (picked.length < MAX_COMPARE ? 1 : 0), 2)}, minmax(var(--cmp-col), 1fr))`;

  return (
    <div className="space-y-6">
      {summary.length > 0 && (
        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] p-5 card-surface">
          <span aria-hidden="true" className="orange-disc -bottom-16 -end-12 h-36 w-36 opacity-90" />
          <div className="relative space-y-1.5">
            <p className="text-sm text-ink-soft">{t(lang, 'cmp.inShort')}</p>
            {summary.map((s) => (
              <p key={s.e.id} className="max-w-xl text-[17px] font-bold leading-relaxed" style={display}><bdi>{s.e.name}</bdi>: {s.words.join(sep)}.</p>
            ))}
          </div>
        </div>
      )}

      {/* w-0 + min-w-full: the table never widens the page, it scrolls in place. */}
      <div className="w-0 min-w-full overflow-x-auto overscroll-x-contain pb-2">
        <div className="grid min-w-full gap-x-2 [--cmp-col:7.5rem] [--cmp-label:5rem] sm:gap-x-3 sm:[--cmp-col:9.5rem] sm:[--cmp-label:7.5rem]" style={{ gridTemplateColumns: cols }}>
          {/* Header: one card per creator, plus an empty slot to add another. */}
          <div />
          {picked.map((e, i) => (
            <div key={e.id} className={`relative flex flex-col items-center gap-2 rounded-[20px] border p-4 text-center card-surface ${wins[i] === top && top > 0 ? 'border-accent/60' : 'border-white/[0.08]'}`}>
              <button type="button" onClick={() => setIds(ids.filter((x) => x !== e.id))} aria-label={t(lang, 'cmp.remove').replace('{name}', e.name)}
                className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-ink/10 hover:text-ink">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></svg>
              </button>
              <span className={`rounded-full p-[3px] ${wins[i] === top && top > 0 ? 'bg-[conic-gradient(var(--accent),#f2a33a,var(--accent))]' : 'bg-white/[0.12]'}`}>
                <span className="block rounded-full bg-surface"><InfluencerPhoto id={e.id} name={e.name} photoAt={e.photoAt} size="lg" /></span>
              </span>
              <Link href={`/influencers/${e.id}`} className="line-clamp-2 text-[15px] font-extrabold leading-snug hover:underline sm:text-base" style={display}><bdi>{e.name}</bdi></Link>
              <span className="line-clamp-1 text-xs text-ink-soft">{[splitNiches(e.niche).map((n) => nicheLabel(n, lang)).join(listSep(lang)), splitPlaces(e.location).map((p) => placeLabel(p, lang)).join(listSep(lang))].filter(Boolean).join(' · ') || ' '}</span>
              {picked.length >= 2 && <span className="text-xs font-semibold text-accent">{t(lang, 'cmp.wins').replace('{n}', String(wins[i])).replace('{total}', String(rows.length))}</span>}
            </div>
          ))}
          {picked.length < MAX_COMPARE && (
            <button type="button" onClick={() => picker.current?.showModal()}
              className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-white/[0.2] text-ink-soft transition-colors hover:border-accent/60 hover:text-ink">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/[0.14] text-2xl text-accent">+</span>
              <span className="text-sm font-bold">{t(lang, 'cmp.add')}</span>
            </button>
          )}
          {picked.length === 0 && <div />}

          {/* Rows: the best value in each is lit. */}
          {picked.length > 0 && rows.map((r) => (
            <div key={r.key} className="contents">
              <div className="flex items-center border-b border-white/[0.07] py-3.5 text-sm font-semibold text-ink-soft">{t(lang, ROW_LABEL[r.key])}</div>
              {picked.map((e, i) => {
                const best = r.best.includes(i);
                return (
                  <div key={e.id} className={`my-1 flex items-center justify-center gap-1.5 rounded-xl border-b border-transparent px-2 py-2.5 text-center tabular-nums ${best ? 'bg-accent/[0.12] font-extrabold text-accent' : 'font-semibold'}`}>
                    {best && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" /></svg>}
                    <bdi dir="ltr" className="text-[15px]">{cell(r.key, e)}</bdi>
                    {best && <span className="sr-only">{t(lang, 'cmp.best')}</span>}
                  </div>
                );
              })}
              {picked.length < MAX_COMPARE && <div />}
            </div>
          ))}
          {picked.length > 0 && (
            <div className="contents">
              <div className="flex items-center py-3.5 text-sm font-semibold text-ink-soft">{t(lang, 'cat.availability')}</div>
              {picked.map((e) => (
                <div key={e.id} className="flex items-center justify-center py-3.5 text-sm">{e.availability ? availabilityLabel(e.availability, lang) : '–'}</div>
              ))}
              {picked.length < MAX_COMPARE && <div />}
            </div>
          )}
          {picked.length > 0 && (
            <div className="contents">
              <div />
              {picked.map((e) => (
                <div key={e.id} className="flex justify-center pt-2">
                  {isUnavailable(e)
                    ? <span className="text-sm text-ink-soft">{t(lang, 'dir.unavailableLock')}</span>
                    : <Link href={shortlistHref([e.id])} className="inline-flex h-11 items-center rounded-control border border-white/[0.16] px-4 text-sm font-bold hover:border-ink/50">{t(lang, 'cmp.pickOnly')}</Link>}
                </div>
              ))}
              {picked.length < MAX_COMPARE && <div />}
            </div>
          )}
        </div>
      </div>

      {picked.length >= 2 && (
        <div className="flex flex-wrap gap-3">
          <Link href={shortlistHref(picked.filter((e) => !isUnavailable(e)).map((e) => e.id))} className={button.primary}>{t(lang, 'cmp.requestAll')}</Link>
          <Link href="/influencers" className={button.secondary}>{t(lang, 'cmp.back')}</Link>
        </div>
      )}
      {picked.length < 2 && <p className="text-[15px] text-ink-soft">{t(lang, 'cmp.needTwo')}</p>}

      <dialog ref={picker} aria-labelledby="cmp-pick-title" onClick={(e) => { if (e.target === picker.current) picker.current?.close(); }}
        className="dir-sheet m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col rounded-t-[22px] border-t border-white/[0.08] bg-surface p-0 text-ink backdrop:bg-black/60 open:flex sm:m-auto sm:max-w-xl sm:rounded-[22px] sm:border">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 id="cmp-pick-title" className="text-lg font-extrabold">{t(lang, 'cmp.add')}</h2>
          <button type="button" onClick={() => picker.current?.close()} aria-label={t(lang, 'dir.close')} className="-me-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-soft hover:bg-ink/5 hover:text-ink">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto overscroll-contain p-5">
          <label htmlFor="cmp-q" className="sr-only">{t(lang, 'wiz.searchCreators')}</label>
          <input id="cmp-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(lang, 'wiz.searchCreators')}
            className="h-12 w-full rounded-[14px] border border-white/[0.16] bg-canvas/60 px-4 text-[15px] text-ink hover:border-ink/50 focus-visible:border-ink" />
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {candidates.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { setIds([...ids, e.id].slice(0, MAX_COMPARE)); picker.current?.close(); setQuery(''); }}
                  className="flex h-full w-full flex-col items-center gap-1.5 rounded-[18px] border border-white/[0.12] bg-canvas/60 px-3 py-4 text-center transition-colors hover:border-accent/60">
                  <InfluencerPhoto id={e.id} name={e.name} photoAt={e.photoAt} />
                  <bdi className="line-clamp-1 text-sm font-bold" style={display}>{e.name}</bdi>
                  <span className="text-xs text-ink-soft"><bdi>{formatCompact(e.followers, lang)}</bdi> {t(lang, 'cat.followers')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </div>
  );
}
