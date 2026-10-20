'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import type { CatalogueList } from '@/lib/catalogue';
import { DIRECTORY_PARAMS, ENGAGEMENT_STEPS, GROWTH_STEPS, SORTS, type DirectoryParams, type Sort } from '@/lib/directory-view';
import { formatCompact, formatPercent } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';

/**
 * The influencer directory's filters. Every change updates the URL at once
 * (search and price fields after a short pause), the server page re-renders
 * with the new results, and the list dims under a thin bar while it does.
 * The URL stays the one source of truth: a reload, Back or a shared link
 * shows the same view. The shortlist's `with=` is carried along untouched.
 */

type Facets = CatalogueList['facets'];
type Update = Record<string, string | null | undefined>;

const FOLLOWER_STEPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];
/** Budget presets per post: [min, max], null for open. */
const BUDGETS: Array<[number | null, number | null]> = [[null, 250], [250, 1_000], [1_000, 5_000], [5_000, null]];

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

const presetValue = (min?: string, max?: string) => (min || max ? `${min ?? ''}:${max ?? ''}` : '');

function BudgetSelect({ id, values, currency, lang }: { id: string; values: DirectoryParams; currency: string; lang: Lang }) {
  const { navigate } = useDirectory();
  const current = presetValue(values.minPrice, values.maxPrice);
  const presets = BUDGETS.map(([a, b]) => {
    const value = presetValue(a === null ? undefined : String(a), b === null ? undefined : String(b));
    return { value, label: budgetLabel(a === null ? undefined : String(a), b === null ? undefined : String(b), currency, lang)! };
  });
  // A custom From/To pair still shows as itself, not as "Any".
  const options = current && !presets.some((p) => p.value === current)
    ? [...presets, { value: current, label: budgetLabel(values.minPrice, values.maxPrice, currency, lang)! }]
    : presets;
  return (
    <Select id={id} label={t(lang, 'dir.budget')} value={current} anyLabel={t(lang, 'cat.any')} options={options}
      onChange={(v) => { const [a, b] = v.split(':'); navigate({ minPrice: a, maxPrice: b }); }} />
  );
}

function PriceRange({ idPrefix, values, currency, lang }: { idPrefix: string; values: DirectoryParams; currency: string; lang: Lang }) {
  const { navigate } = useDirectory();
  const [range, setRange] = useState({ min: values.minPrice ?? '', max: values.maxPrice ?? '' });
  // As in the search box: only a change from elsewhere (a preset, a chip, Clear all) rewrites the fields.
  const urlKey = `${values.minPrice ?? ''}:${values.maxPrice ?? ''}`;
  const sent = useRef(urlKey);
  useEffect(() => {
    if (urlKey !== sent.current) { sent.current = urlKey; setRange({ min: values.minPrice ?? '', max: values.maxPrice ?? '' }); }
  }, [urlKey, values.minPrice, values.maxPrice]);
  useSettled(range, 600, (r) => {
    const key = `${r.min}:${r.max}`;
    if (key !== sent.current) { sent.current = key; navigate({ minPrice: r.min, maxPrice: r.max }); }
  });
  const input = (key: 'min' | 'max', label: string) => (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={`${idPrefix}-${key}Price`} className="block text-sm font-medium text-ink-soft">{label}</label>
      <div className="relative">
        <input id={`${idPrefix}-${key}Price`} type="text" inputMode="numeric" dir="ltr" autoComplete="off" placeholder="0"
          value={range[key]} onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value.replace(/[^\d]/g, '').slice(0, 7) }))}
          className={`${fieldBase} pe-14 ps-3 tabular-nums`} />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">{currency}</span>
      </div>
    </div>
  );
  return (
    <fieldset className="min-w-0">
      {/* One label row, level with the fields beside it: "Price range: From" / "To". */}
      <legend className="sr-only">{t(lang, 'dir.priceRange')}</legend>
      <div className="grid grid-cols-2 gap-3">{input('min', `${t(lang, 'dir.priceRange')}: ${t(lang, 'dir.from')}`)}{input('max', t(lang, 'dir.to'))}</div>
    </fieldset>
  );
}

function tierOptions(facets: Facets, lang: Lang) {
  return facets.tiers.map((v) => ({ value: v, label: `${t(lang, `disc.tier.${v}` as Key)} · ${t(lang, `dir.tierHint.${v}` as Key)}` }));
}

/** Filters behind "Advanced": the same fields in the desktop panel and the phone sheet. */
function AdvancedFields({ idPrefix, values, facets, currency, lang }: { idPrefix: string; values: DirectoryParams; facets: Facets; currency: string; lang: Lang }) {
  const { navigate } = useDirectory();
  const any = t(lang, 'cat.any');
  return (
    <>
      <Select id={`${idPrefix}-location`} label={t(lang, 'disc.location')} value={values.location ?? ''} anyLabel={any}
        options={facets.locations.map((v) => ({ value: v, label: v }))} onChange={(v) => navigate({ location: v })} />
      <Select id={`${idPrefix}-gender`} label={t(lang, 'disc.gender')} value={values.gender ?? ''} anyLabel={any}
        options={[{ value: 'female', label: t(lang, 'disc.female') }, { value: 'male', label: t(lang, 'disc.male') }]} onChange={(v) => navigate({ gender: v })} />
      <Select id={`${idPrefix}-tier`} label={t(lang, 'disc.tier')} value={values.tier ?? ''} anyLabel={any}
        options={tierOptions(facets, lang)} onChange={(v) => navigate({ tier: v })} />
      <Select id={`${idPrefix}-availability`} label={t(lang, 'cat.availability')} value={values.availability ?? ''} anyLabel={any}
        options={facets.availability.map((v) => ({ value: v, label: availabilityLabel(v, lang) }))} onChange={(v) => navigate({ availability: v })} />
      <Select id={`${idPrefix}-engagement`} label={t(lang, 'dir.engagement')} value={values.minEngagement ?? ''} anyLabel={any}
        options={ENGAGEMENT_STEPS.map((n) => ({ value: String(n), label: fill(t(lang, 'dir.engagementAtLeast'), { n: formatPercent(n, lang) }) }))}
        onChange={(v) => navigate({ minEngagement: v })} />
      <Select id={`${idPrefix}-growth`} label={t(lang, 'dir.growth')} value={values.minGrowth ?? ''} anyLabel={any}
        options={GROWTH_STEPS.map((n) => ({ value: String(n), label: n === 0 ? t(lang, 'dir.growing') : fill(t(lang, 'dir.growthAtLeast'), { n: formatPercent(n, lang) }) }))}
        onChange={(v) => navigate({ minGrowth: v })} />
      <div className="sm:col-span-2 lg:col-span-2"><PriceRange idPrefix={idPrefix} values={values} currency={currency} lang={lang} /></div>
    </>
  );
}

function MainFields({ idPrefix, values, facets, currency, lang }: { idPrefix: string; values: DirectoryParams; facets: Facets; currency: string; lang: Lang }) {
  const { navigate } = useDirectory();
  const any = t(lang, 'cat.any');
  return (
    <>
      <Select id={`${idPrefix}-platform`} label={t(lang, 'cat.platform')} value={values.platform ?? ''} anyLabel={any}
        options={facets.platforms.map((v) => ({ value: v, label: v }))} onChange={(v) => navigate({ platform: v })} />
      <Select id={`${idPrefix}-niche`} label={t(lang, 'cat.niche')} value={values.niche ?? ''} anyLabel={any}
        options={facets.niches.map((v) => ({ value: v, label: v }))} onChange={(v) => navigate({ niche: v })} />
      <Select id={`${idPrefix}-minFollowers`} label={t(lang, 'cat.minFollowers')} value={values.minFollowers ?? ''} anyLabel={any}
        options={FOLLOWER_STEPS.map((n) => ({ value: String(n), label: `${formatCompact(n, lang)}+` }))} onChange={(v) => navigate({ minFollowers: v })} />
      <BudgetSelect id={`${idPrefix}-budget`} values={values} currency={currency} lang={lang} />
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
    <div className="relative min-w-0 flex-1">
      <label htmlFor="dir-q" className="sr-only">{t(lang, 'cat.search')}</label>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="9" cy="9" r="5.5" /><path d="m13.2 13.2 3.3 3.3" /></svg>
      <input id="dir-q" name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, 'dir.searchHint')}
        autoComplete="off" enterKeyHint="search" className={`${fieldBase} pe-3 ps-10`} />
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

const ADVANCED_KEYS = ['location', 'gender', 'tier', 'availability', 'minEngagement', 'minGrowth'] as const;

export function FilterBar({ values, facets, currency, lang, count }: { values: DirectoryParams; facets: Facets; currency: string; lang: Lang; count: number }) {
  const { navigate } = useDirectory();
  const advancedActive = ADVANCED_KEYS.filter((k) => values[k]).length;
  const allActive = advancedActive + (['platform', 'niche', 'minFollowers'] as const).filter((k) => values[k]).length + (values.minPrice || values.maxPrice ? 1 : 0);
  const [open, setOpen] = useState(advancedActive > 0);
  const panelId = useId();
  const sheet = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Closed, the panel's fields leave the tab order (React 18 has no `inert` prop).
  useEffect(() => { panel.current?.toggleAttribute('inert', !open); }, [open]);

  return (
    <div className="space-y-3">
      {/* Enter in the search box still works without the debounce, and without JavaScript. */}
      <form method="get" action="/influencers" role="search" onSubmit={(e) => { e.preventDefault(); navigate({ q: (new FormData(e.currentTarget).get('q') as string)?.trim() }); }}
        className={`rounded-[14px] border border-line bg-surface/80 p-3 transition-[border-color] duration-200 sm:p-4 ${open ? 'border-ink/20' : ''}`}>
        <div className="flex gap-2">
          <SearchBox value={values.q ?? ''} lang={lang} />
          <button type="button" onClick={() => sheet.current?.showModal()} aria-haspopup="dialog"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-control border border-field bg-surface px-3.5 text-[15px] font-semibold transition-colors hover:border-ink/60 lg:hidden">
            <FilterIcon /><span>{t(lang, 'cat.filters')}</span><Badge n={allActive} />
          </button>
          <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}
            className={`hidden h-11 shrink-0 items-center gap-2 rounded-control border px-3.5 text-[15px] font-semibold transition-colors lg:inline-flex ${open ? 'border-ink/60 bg-ink/[0.06]' : 'border-field bg-surface hover:border-ink/60'}`}>
            <FilterIcon /><span className="whitespace-nowrap">{t(lang, 'dir.advanced')}</span><Badge n={advancedActive} />
            <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 text-ink-soft transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
          </button>
        </div>
        <div className="mt-3 hidden grid-cols-4 gap-3 lg:grid">
          <MainFields idPrefix="bar" values={values} facets={facets} currency={currency} lang={lang} />
        </div>
        {/* Opens by growing its row: no measuring, no layout jump below. */}
        <div id={panelId} ref={panel} className={`hidden transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] lg:grid ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="mt-4 grid grid-cols-4 gap-x-3 gap-y-4 border-t border-line pt-4">
              <AdvancedFields idPrefix="adv" values={values} facets={facets} currency={currency} lang={lang} />
            </div>
          </div>
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
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MainFields idPrefix="sheet" values={values} facets={facets} currency={currency} lang={lang} />
            <div className="border-t border-line sm:col-span-2" />
            <AdvancedFields idPrefix="sheet-adv" values={values} facets={facets} currency={currency} lang={lang} />
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-3 border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <ClearAllButton lang={lang} className="h-11 rounded-control border border-field px-4 text-[15px] font-semibold disabled:opacity-40" disabled={!allActive && !values.q} />
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
    values.minFollowers ? { id: 'minFollowers', label: fill(t(lang, 'dir.followersAtLeast'), { n: formatCompact(Number(values.minFollowers), lang) }), clear: { minFollowers: null } } : null,
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
