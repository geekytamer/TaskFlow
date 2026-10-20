'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import type { CatalogueList } from '@/lib/catalogue';
import { DIRECTORY_PARAMS, ENGAGEMENT_STEPS, SORTS, type DirectoryParams, type Sort } from '@/lib/directory-view';
import { formatCompact, formatPercent } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';

/**
 * The influencer directory's filters. Every change updates the URL at once
 * (search and the sliders after a short pause), the server page re-renders
 * with the new results, and the list dims under a thin bar while it does.
 * The URL stays the one source of truth: a reload, Back or a shared link
 * shows the same view. The shortlist's `with=` is carried along untouched.
 */

type Facets = CatalogueList['facets'];
type Update = Record<string, string | null | undefined>;

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

const Ctx = createContext<{ pending: boolean; navigate: (u: Update) => void; clearAll: () => void }>({
  pending: false, navigate: () => {}, clearAll: () => {},
});

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const go = (sp: URLSearchParams) => {
    const text = sp.toString();
    start(() => router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false }));
  };
  // Read the live URL each time: the shortlist rewrites `with=` in place.
  const navigate = (u: Update) => {
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(u)) { if (v) sp.set(k, v); else sp.delete(k); }
    go(sp);
  };
  const clearAll = () => {
    const sp = new URLSearchParams(window.location.search);
    for (const k of DIRECTORY_PARAMS) if (k !== 'sort') sp.delete(k);
    go(sp);
  };
  return <Ctx.Provider value={{ pending, navigate, clearAll }}>{children}</Ctx.Provider>;
}

const useDirectory = () => useContext(Ctx);

/** Calls `fn` once `value` has been still for `ms`; skips the first render. */
function useSettled<T>(value: T, ms: number, fn: (v: T) => void) {
  const first = useRef(true);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => latest.current(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
}

const fieldBase =
  'h-11 w-full rounded-control border border-field bg-surface text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
  );
}

function Select({ id, label, value, onChange, options, anyLabel, hideLabel = false }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; anyLabel?: string; hideLabel?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'block truncate text-sm font-medium text-ink-soft'}>{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldBase} appearance-none truncate pe-9 ps-3 ${value ? 'border-ink/50' : ''}`}>
          {anyLabel !== undefined && <option value="">{anyLabel}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Chevron />
      </div>
    </div>
  );
}

function budgetLabel(min: string | undefined, max: string | undefined, currency: string, lang: Lang): string | null {
  const money = (v: string) => `${formatCompact(Number(v), lang)} ${currency}`;
  if (min && max) return fill(t(lang, 'dir.budgetBetween'), { a: money(min), b: money(max) });
  if (max) return fill(t(lang, 'dir.budgetUpTo'), { b: money(max) });
  if (min) return fill(t(lang, 'dir.budgetFrom'), { a: money(min) });
  return null;
}

/**
 * Slider stops. Steps widen as values grow, so the low end (where most
 * creators sit) gets room. The first stop means "no minimum", the last
 * "no maximum".
 */
const PRICE_STOPS = [0, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1_000, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000, 7_500, 10_000];
const FOLLOWER_STOPS = [0, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 2_000_000, 5_000_000];
/** Follower bands (the backend's tiers): where each starts on FOLLOWER_STOPS. */
const TIER_BANDS: Array<{ tier: 'nano' | 'micro' | 'mid' | 'macro' | 'mega'; from: number; to: number }> = [
  { tier: 'nano', from: 0, to: 2 }, { tier: 'micro', from: 2, to: 5 }, { tier: 'mid', from: 5, to: 7 },
  { tier: 'macro', from: 7, to: 9 }, { tier: 'mega', from: 9, to: 11 },
];

/** The stop nearest an amount, for placing a handle. */
function stopOf(stops: number[], v: string, fallback: number) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  let best = 0;
  stops.forEach((x, i) => { if (Math.abs(x - n) < Math.abs(stops[best] - n)) best = i; });
  return best;
}

/**
 * A min/max pair of URL params edited locally and sent once still. Only a
 * change from elsewhere (a chip, Clear all, Back) rewrites what is shown, so
 * results arriving late never undo a drag in progress.
 */
function useRangeParam(values: DirectoryParams, minKey: 'minPrice' | 'minFollowers', maxKey: 'maxPrice' | 'maxFollowers') {
  const { navigate } = useDirectory();
  const fromUrl = { min: values[minKey] ?? '', max: values[maxKey] ?? '' };
  const [range, setRange] = useState(fromUrl);
  const urlKey = `${fromUrl.min}:${fromUrl.max}`;
  const sent = useRef(urlKey);
  useEffect(() => {
    if (urlKey !== sent.current) { sent.current = urlKey; setRange({ min: values[minKey] ?? '', max: values[maxKey] ?? '' }); }
  }, [urlKey, values, minKey, maxKey]);
  useSettled(range, 500, (r) => {
    const key = `${r.min}:${r.max}`;
    if (key !== sent.current) { sent.current = key; navigate({ [minKey]: r.min, [maxKey]: r.max }); }
  });
  return [range, setRange] as const;
}

/** Two native range inputs on one track: keyboard, touch and screen readers work as usual. */
function SliderTrack({ lo, hi, last, onLo, onHi, loText, hiText, minLabel, maxLabel, lang }: {
  lo: number; hi: number; last: number; onLo: (i: number) => void; onHi: (i: number) => void;
  loText: string; hiText: string; minLabel: string; maxLabel: string; lang: Lang;
}) {
  const pct = (i: number) => (i / last) * 100;
  const inward = lang === 'ar' ? '50%' : '-50%';
  const close = hi - lo <= Math.max(1, Math.round(last / 6));
  return (
    <>
      <div className="relative mx-2.5 h-6">
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/15" />
        <div aria-hidden="true" className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ insetInlineStart: `${pct(lo)}%`, insetInlineEnd: `${100 - pct(hi)}%` }} />
        <input type="range" min={0} max={last} step={1} value={lo} aria-label={minLabel} aria-valuetext={loText}
          onChange={(e) => onLo(Math.min(Number(e.target.value), hi))} className="price-thumb" style={{ zIndex: lo >= last - 1 ? 3 : 2 }} />
        <input type="range" min={0} max={last} step={1} value={hi} aria-label={maxLabel} aria-valuetext={hiText}
          onChange={(e) => onHi(Math.max(Number(e.target.value), lo))} className="price-thumb" style={{ zIndex: 2 }} />
      </div>
      {/* Labels ride under their handles; when the handles meet, one label shows both. */}
      <div aria-hidden="true" className="relative mx-2.5 mt-2 h-5 text-[13px] font-semibold tabular-nums text-ink">
        {close ? (
          <span className="absolute whitespace-nowrap" style={{ insetInlineStart: `${pct((lo + hi) / 2)}%`, translate: (lo + hi) / 2 / last < 0.2 ? '0' : (lo + hi) / 2 / last > 0.8 ? (lang === 'ar' ? '100%' : '-100%') : inward }}>
            <bdi dir="ltr">{lo === hi ? loText : `${loText} – ${hiText}`}</bdi>
          </span>
        ) : (
          <>
            <span className="absolute whitespace-nowrap" style={{ insetInlineStart: `${pct(lo)}%`, translate: lo / last < 0.15 ? '0' : inward }}><bdi dir="ltr">{loText}</bdi></span>
            <span className="absolute whitespace-nowrap" style={{ insetInlineEnd: `${100 - pct(hi)}%`, translate: hi / last > 0.85 ? '0' : (lang === 'ar' ? '-50%' : '50%') }}><bdi dir="ltr">{hiText}</bdi></span>
          </>
        )}
      </div>
    </>
  );
}

const numberFmt = (lang: Lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-OM');

function PriceRange({ idPrefix, values, currency, lang }: { idPrefix: string; values: DirectoryParams; currency: string; lang: Lang }) {
  const [range, setRange] = useRangeParam(values, 'minPrice', 'maxPrice');
  const last = PRICE_STOPS.length - 1;
  const lo = stopOf(PRICE_STOPS, range.min, 0);
  const hi = Math.max(lo, stopOf(PRICE_STOPS, range.max, last));
  const money = (n: number) => `${currency} ${numberFmt(lang).format(n)}`;
  const set = (key: 'min' | 'max', i: number) => setRange((r) => ({
    ...r, [key]: (key === 'min' && i === 0) || (key === 'max' && i === last) ? '' : String(PRICE_STOPS[i]),
  }));
  const input = (key: 'min' | 'max', label: string) => (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={`${idPrefix}-${key}Price`} className="block text-sm font-medium text-ink-soft">{label}</label>
      <div className="relative">
        <input id={`${idPrefix}-${key}Price`} type="text" inputMode="numeric" dir="ltr" autoComplete="off"
          placeholder={key === 'min' ? '0' : t(lang, 'cat.any')}
          value={range[key]} onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value.replace(/[^\d]/g, '').slice(0, 7) }))}
          className={`${fieldBase} pl-3 pr-14 tabular-nums`} />
        {/* The field is always left-to-right (digits), so the unit sits on its physical right in both languages. */}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">{currency}</span>
      </div>
    </div>
  );
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-medium text-ink-soft">{t(lang, 'dir.budget')} ({currency})</legend>
      <SliderTrack lo={lo} hi={hi} last={last} onLo={(i) => set('min', i)} onHi={(i) => set('max', i)} lang={lang}
        loText={money(PRICE_STOPS[lo])} hiText={hi === last ? `${money(PRICE_STOPS[last])}+` : money(PRICE_STOPS[hi])}
        minLabel={`${t(lang, 'dir.budget')}: ${t(lang, 'dir.min')}`} maxLabel={`${t(lang, 'dir.budget')}: ${t(lang, 'dir.max')}`} />
      <div className="mt-3 grid grid-cols-2 gap-3">{input('min', t(lang, 'dir.min'))}{input('max', t(lang, 'dir.max'))}</div>
    </fieldset>
  );
}

/** Followers as a range, with the size bands (Nano to Mega) named along the track. */
function FollowerRange({ values, lang }: { values: DirectoryParams; lang: Lang }) {
  const [range, setRange] = useRangeParam(values, 'minFollowers', 'maxFollowers');
  const last = FOLLOWER_STOPS.length - 1;
  const lo = stopOf(FOLLOWER_STOPS, range.min, 0);
  const hi = Math.max(lo, stopOf(FOLLOWER_STOPS, range.max, last));
  const set = (key: 'min' | 'max', i: number) => setRange((r) => ({
    ...r, [key]: (key === 'min' && i === 0) || (key === 'max' && i === last) ? '' : String(FOLLOWER_STOPS[i]),
  }));
  const num = (i: number) => formatCompact(FOLLOWER_STOPS[i], lang);
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-ink-soft">{t(lang, 'dir.followers')}</legend>
      {/* The bands explain the sizes; the ones the range covers are lit. */}
      <div aria-hidden="true" className="mx-2.5 mb-1 flex text-[11px] font-semibold">
        {TIER_BANDS.map((b) => (
          <span key={b.tier} className={`truncate text-center transition-colors duration-150 ${b.to > lo && b.from < hi ? 'text-ink' : 'text-ink-soft/60'}`}
            style={{ width: `${((b.to - b.from) / last) * 100}%` }}>
            {t(lang, `disc.tier.${b.tier}` as Key)}
          </span>
        ))}
      </div>
      <SliderTrack lo={lo} hi={hi} last={last} onLo={(i) => set('min', i)} onHi={(i) => set('max', i)} lang={lang}
        loText={num(lo)} hiText={hi === last ? `${num(last)}+` : num(hi)}
        minLabel={`${t(lang, 'dir.followers')}: ${t(lang, 'dir.min')}`} maxLabel={`${t(lang, 'dir.followers')}: ${t(lang, 'dir.max')}`} />
    </fieldset>
  );
}

/** Engagement floors as one row of toggles: a single tap, no menu. */
function EngagementChips({ values, lang }: { values: DirectoryParams; lang: Lang }) {
  const { navigate } = useDirectory();
  const current = values.minEngagement ?? '';
  const options = [{ value: '', label: t(lang, 'cat.any') }, ...ENGAGEMENT_STEPS.map((n) => ({ value: String(n), label: `${formatPercent(n, lang)}+` }))];
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-ink-soft">{t(lang, 'dir.engagement')}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = current === o.value;
          return (
            <button key={o.value || 'any'} type="button" aria-pressed={on} onClick={() => navigate({ minEngagement: o.value })}
              className={`inline-flex h-11 min-w-[3.25rem] items-center justify-center rounded-control border px-3 text-[15px] font-semibold tabular-nums transition-colors duration-150 ${on ? 'border-accent bg-accent text-accent-ink' : 'border-field bg-surface text-ink hover:border-ink/60'}`}>
              <bdi dir="ltr">{o.label}</bdi>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ListFields({ idPrefix, values, facets, lang }: { idPrefix: string; values: DirectoryParams; facets: Facets; lang: Lang }) {
  const { navigate } = useDirectory();
  const any = t(lang, 'cat.any');
  return (
    <>
      <Select id={`${idPrefix}-platform`} label={t(lang, 'cat.platform')} value={values.platform ?? ''} anyLabel={any}
        options={facets.platforms.map((v) => ({ value: v, label: v }))} onChange={(v) => navigate({ platform: v })} />
      <Select id={`${idPrefix}-niche`} label={t(lang, 'cat.niche')} value={values.niche ?? ''} anyLabel={any}
        options={facets.niches.map((v) => ({ value: v, label: v }))} onChange={(v) => navigate({ niche: v })} />
      <Select id={`${idPrefix}-location`} label={t(lang, 'disc.location')} value={values.location ?? ''} anyLabel={any}
        options={facets.locations.map((v) => ({ value: v, label: v }))} onChange={(v) => navigate({ location: v })} />
      <Select id={`${idPrefix}-gender`} label={t(lang, 'disc.gender')} value={values.gender ?? ''} anyLabel={any}
        options={[{ value: 'female', label: t(lang, 'disc.female') }, { value: 'male', label: t(lang, 'disc.male') }]} onChange={(v) => navigate({ gender: v })} />
    </>
  );
}

function SearchBox({ value, lang }: { value: string; lang: Lang }) {
  const { navigate } = useDirectory();
  const [q, setQ] = useState(value);
  // What this box last sent. Only a change from elsewhere (a chip, Clear all,
  // Back) replaces the text: results arriving late never undo fresh typing.
  const sent = useRef(value);
  useEffect(() => { if (value !== sent.current) { sent.current = value; setQ(value); } }, [value]);
  useSettled(q, 300, (v) => { if (v.trim() !== sent.current) { sent.current = v.trim(); navigate({ q: v.trim() }); } });
  return (
    <div className="min-w-0 flex-1 space-y-1.5 lg:col-span-4 xl:col-span-1">
      <label htmlFor="dir-q" className="sr-only lg:not-sr-only lg:block lg:text-sm lg:font-medium lg:text-ink-soft">{t(lang, 'cat.search')}</label>
      <div className="relative">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="9" cy="9" r="5.5" /><path d="m13.2 13.2 3.3 3.3" /></svg>
        <input id="dir-q" name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, 'dir.searchHint')}
          autoComplete="off" enterKeyHint="search" className={`${fieldBase} pe-3 ps-10`} />
      </div>
    </div>
  );
}

function FilterIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M3.5 6h13M6 10h8M8.5 14h3" /></svg>;
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold leading-5 text-accent-ink"><bdi>{n}</bdi></span>;
}

/**
 * Seven filters, all in view on a wide screen: search and four lists on top,
 * the two ranges and engagement below. Phones get the search box and a
 * Filters button that opens the same fields in a bottom sheet.
 */
export function FilterBar({ values, facets, currency, lang, count, before }: {
  values: DirectoryParams; facets: Facets; currency: string; lang: Lang; count: number; before?: ReactNode;
}) {
  const { navigate } = useDirectory();
  const active = (['platform', 'niche', 'location', 'gender', 'minEngagement'] as const).filter((k) => values[k]).length
    + (values.minFollowers || values.maxFollowers ? 1 : 0) + (values.minPrice || values.maxPrice ? 1 : 0);
  const sheet = useRef<HTMLDialogElement>(null);

  return (
    <div className="space-y-3">
      {/* Enter in the search box still works without the debounce, and without JavaScript. */}
      <form method="get" action="/influencers" role="search" onSubmit={(e) => { e.preventDefault(); navigate({ q: (new FormData(e.currentTarget).get('q') as string)?.trim() }); }}
        className="rounded-[14px] border border-line bg-surface/80 p-3 sm:p-4">
        {before}
        <div className="flex items-end gap-2 lg:grid lg:grid-cols-4 lg:gap-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
          <SearchBox value={values.q ?? ''} lang={lang} />
          <button type="button" onClick={() => sheet.current?.showModal()} aria-haspopup="dialog"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-control border border-field bg-surface px-3.5 text-[15px] font-semibold transition-colors hover:border-ink/60 lg:hidden">
            <FilterIcon /><span>{t(lang, 'cat.filters')}</span><Badge n={active} />
          </button>
          <div className="hidden lg:contents">
            <ListFields idPrefix="bar" values={values} facets={facets} lang={lang} />
          </div>
        </div>
        <div className="mt-4 hidden gap-x-8 gap-y-5 border-t border-line pt-4 lg:grid lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <FollowerRange values={values} lang={lang} />
          <PriceRange idPrefix="bar" values={values} currency={currency} lang={lang} />
          <div className="lg:col-span-2 2xl:col-span-1"><EngagementChips values={values} lang={lang} /></div>
        </div>
      </form>

      <ActiveChips values={values} facets={facets} currency={currency} lang={lang} />

      <dialog ref={sheet} aria-labelledby="dir-sheet-title"
        onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}
        className="dir-sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none flex-col rounded-t-[18px] border-t border-line bg-surface p-0 text-ink backdrop:bg-black/60 open:flex lg:hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="dir-sheet-title" className="text-lg font-extrabold">{t(lang, 'cat.filters')}</h2>
          <button type="button" onClick={() => sheet.current?.close()} aria-label={t(lang, 'dir.close')}
            className="-me-2 inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-soft hover:bg-ink/5 hover:text-ink">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <ListFields idPrefix="sheet" values={values} facets={facets} lang={lang} />
          </div>
          <FollowerRange values={values} lang={lang} />
          <PriceRange idPrefix="sheet" values={values} currency={currency} lang={lang} />
          <EngagementChips values={values} lang={lang} />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-3 border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <ClearAllButton lang={lang} className="h-11 rounded-control border border-field px-4 text-[15px] font-semibold disabled:opacity-40" disabled={!active && !values.q} />
          <button type="button" onClick={() => sheet.current?.close()}
            className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 text-[15px] font-bold text-accent-ink transition-colors hover:bg-accent/90">
            {fill(t(lang, 'dir.showResults'), { n: String(count) })}
          </button>
        </div>
      </dialog>
    </div>
  );
}

function ClearAllButton({ lang, className, disabled }: { lang: Lang; className: string; disabled?: boolean }) {
  const { clearAll } = useDirectory();
  return <button type="button" onClick={clearAll} disabled={disabled} className={className}>{t(lang, 'dir.clearAll')}</button>;
}

function ActiveChips({ values, facets, currency, lang }: { values: DirectoryParams; facets: Facets; currency: string; lang: Lang }) {
  const { navigate } = useDirectory();
  const tier = values.tier && facets.tiers.includes(values.tier as Facets['tiers'][number]) ? t(lang, `disc.tier.${values.tier}` as Key) : values.tier;
  const growth = values.minGrowth === '0' ? t(lang, 'dir.growing') : values.minGrowth ? fill(t(lang, 'dir.growthAtLeast'), { n: formatPercent(Number(values.minGrowth), lang) }) : null;
  type Chip = { id: string; label: string; clear: Update };
  const chips = ([
    values.q ? { id: 'q', label: `“${values.q}”`, clear: { q: null } } : null,
    values.platform ? { id: 'platform', label: values.platform, clear: { platform: null } } : null,
    values.niche ? { id: 'niche', label: values.niche, clear: { niche: null } } : null,
    values.minFollowers || values.maxFollowers ? {
      id: 'followers',
      label: values.minFollowers && values.maxFollowers
        ? fill(t(lang, 'dir.followersBetween'), { a: formatCompact(Number(values.minFollowers), lang), b: formatCompact(Number(values.maxFollowers), lang) })
        : values.maxFollowers
          ? fill(t(lang, 'dir.followersUpTo'), { b: formatCompact(Number(values.maxFollowers), lang) })
          : fill(t(lang, 'dir.followersAtLeast'), { n: formatCompact(Number(values.minFollowers), lang) }),
      clear: { minFollowers: null, maxFollowers: null },
    } : null,
    values.minPrice || values.maxPrice ? { id: 'price', label: budgetLabel(values.minPrice, values.maxPrice, currency, lang)!, clear: { minPrice: null, maxPrice: null } } : null,
    values.location ? { id: 'location', label: values.location, clear: { location: null } } : null,
    values.gender ? { id: 'gender', label: t(lang, values.gender === 'male' ? 'disc.male' : 'disc.female'), clear: { gender: null } } : null,
    tier ? { id: 'tier', label: `${t(lang, 'disc.tier')}: ${tier}`, clear: { tier: null } } : null,
    values.availability ? { id: 'availability', label: availabilityLabel(values.availability, lang), clear: { availability: null } } : null,
    values.minEngagement ? { id: 'engagement', label: `${t(lang, 'dir.engagement')}: ${fill(t(lang, 'dir.engagementAtLeast'), { n: formatPercent(Number(values.minEngagement), lang) })}`, clear: { minEngagement: null } } : null,
    growth ? { id: 'growth', label: `${t(lang, 'dir.growth')}: ${growth}`, clear: { minGrowth: null } } : null,
  ] as Array<Chip | null>).filter((c): c is Chip => c !== null);

  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul className="contents">
        {chips.map((c) => (
          <li key={c.id} className="chip-in">
            <button type="button" onClick={() => navigate(c.clear)} aria-label={fill(t(lang, 'dir.remove'), { f: c.label })}
              className="group inline-flex h-8 max-w-[18rem] items-center gap-1.5 rounded-full border border-line bg-surface-2 pe-2 ps-3 text-sm font-medium text-ink transition-colors hover:border-accent/50">
              <bdi className="truncate" dir="auto">{c.label}</bdi>
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ink-soft transition-colors group-hover:text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></svg>
            </button>
          </li>
        ))}
      </ul>
      <ClearAllButton lang={lang} className="inline-flex h-8 items-center px-2 text-sm font-semibold text-accent underline-offset-4 hover:underline" />
    </div>
  );
}

function countText(n: number, lang: Lang): string {
  if (n === 0) return t(lang, 'dir.count.none');
  const form = new Intl.PluralRules(lang === 'ar' ? 'ar' : 'en').select(n);
  const key = (form === 'one' ? 'dir.count.one' : form === 'two' ? 'dir.count.two' : form === 'few' ? 'dir.count.few' : form === 'many' ? 'dir.count.many' : 'dir.count.other') as Key;
  return fill(t(lang, key), { n: new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-OM').format(n) });
}

export function ResultsHeader({ count, sort, lang, viewSwitch }: { count: number; sort: Sort; lang: Lang; viewSwitch: ReactNode }) {
  const { navigate, pending } = useDirectory();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h2 id="results-title" aria-live="polite" className={`text-[15px] font-semibold transition-opacity duration-200 ${pending ? 'opacity-60' : ''}`}>
        {countText(count, lang)}
        <span className="sr-only">{pending ? `, ${t(lang, 'dir.updating')}` : ''}</span>
      </h2>
      <div className="flex items-center gap-2">
        <div className="w-[11.5rem]">
          <Select id="dir-sort" label={t(lang, 'disc.sort')} hideLabel value={sort}
            options={SORTS.map((s) => ({ value: s, label: t(lang, `dir.sort.${s}` as Key) }))} onChange={(v) => navigate({ sort: v })} />
        </div>
        {viewSwitch}
      </div>
    </div>
  );
}

/** The result list: dims and shows a thin moving bar while new results load. */
export function ResultsPane({ children }: { children: ReactNode }) {
  const { pending } = useDirectory();
  return (
    <div aria-busy={pending} className="relative">
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 -top-2 h-0.5 overflow-hidden rounded-full transition-opacity duration-200 ${pending ? 'opacity-100' : 'opacity-0'}`}>
        <div className="dir-progress h-full w-1/3 rounded-full bg-accent" />
      </div>
      <div className={`transition-opacity duration-200 ${pending ? 'opacity-50' : 'opacity-100'}`}>{children}</div>
    </div>
  );
}
