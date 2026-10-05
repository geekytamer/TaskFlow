import Link from 'next/link';
import { Disclosure } from '@/components/disclosure';
import { PriceTag } from '@/components/price-tag';
import { EmptyState, PageHeader, button, list } from '@/components/ui';
import { VerifiedMark } from '@/components/verified-mark';
import { getCatalogue, type CatalogueEntry } from '@/lib/catalogue';
import { CATALOGUE_FILTERS, catalogueQuery, formatCompact, formatPercent, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';
import { parseShortlist, shortlistHref, toggleShortlist } from '@/lib/shortlist';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FOLLOWER_STEPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const control =
  'h-11 w-full rounded-control border border-field bg-surface px-3 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

function FilterSelect({ name, label, value, options, lang }: { name: string; label: string; value: string; options: Array<{ value: string; label: string }>; lang: Lang }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`f-${name}`} className="block truncate text-sm font-medium">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value} className={control}>
        <option value="">{t(lang, 'cat.any')}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** The current page's URL with a different shortlist, so ticking keeps the filters. */
function hrefWith(params: Record<string, string | string[] | undefined>, ids: string[]) {
  const q = new URLSearchParams();
  for (const key of CATALOGUE_FILTERS) { const v = first(params[key]); if (v) q.set(key, v); }
  ids.forEach((id) => q.append('with', id));
  const text = q.toString();
  return text ? `/influencers?${text}` : '/influencers';
}

function InfluencerRow({ entry, lang, chosen, toggleHref }: { entry: CatalogueEntry; lang: Lang; chosen: boolean; toggleHref: string }) {
  const meta = [entry.niche, entry.location].filter(Boolean).join(listSep(lang));
  const top = [...entry.platforms].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
  return (
    <li className={`flex items-stretch ${chosen ? 'bg-accent/[0.04]' : ''}`}>
      <Link href={toggleHref} scroll={false} aria-pressed={chosen}
        aria-label={`${t(lang, chosen ? 'cat.removeShortlist' : 'cat.addShortlist')}: ${entry.name}`}
        className="flex w-14 shrink-0 items-center justify-center border-e border-line hover:bg-surface-2">
        <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-[5px] border ${chosen ? 'border-accent bg-accent text-accent-ink' : 'border-field bg-surface'}`}>
          {chosen && <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
        </span>
      </Link>
      <Link href={`/influencers/${entry.id}`} className="group grid min-w-0 flex-1 gap-3 px-4 py-4 hover:bg-surface-2 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_9rem] md:items-center md:gap-6">
        <div className="min-w-0">
          <p className="truncate font-semibold group-hover:underline"><bdi>{entry.name}</bdi></p>
          {meta && <p className="mt-0.5 truncate text-sm text-ink-soft">{meta}</p>}
          {entry.availability && <p className="mt-0.5 text-xs font-medium text-ink-soft">{availabilityLabel(entry.availability, lang)}</p>}
        </div>
        {top ? (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-ink-soft"><bdi>{top.platform}</bdi></dt><dd className="font-semibold"><bdi>{formatCompact(top.followers, lang)}</bdi>{top.verified && <span className="ms-1 align-middle"><VerifiedMark asOf={top.verified.asOf} lang={lang} compact /></span>}</dd></div>
            <div><dt className="text-xs text-ink-soft">{t(lang, 'cat.avgViewsShort')}</dt><dd className="font-semibold"><bdi>{formatCompact(top.avgViews, lang)}</bdi></dd></div>
            <div><dt className="text-xs text-ink-soft">{t(lang, 'cat.engagement')}</dt><dd className="font-semibold"><bdi>{formatPercent(top.engagementRate, lang)}</bdi></dd></div>
          </dl>
        ) : <p className="text-sm text-ink-soft">{t(lang, 'cat.noAccounts')}</p>}
        <div className="md:text-end"><PriceTag price={entry.price} lang={lang} /></div>
      </Link>
    </li>
  );
}

export default async function InfluencersPage({ searchParams }: { searchParams: SearchParams }) {
  requireAudience('client');
  const params = await searchParams;
  const lang = await currentLang();
  const query = catalogueQuery(params);
  const { items, total, facets } = await getCatalogue(query);
  const nothingListed = facets.platforms.length === 0 && facets.niches.length === 0 && total === 0 && !query;
  const shortlist = parseShortlist(params.with);
  const active = CATALOGUE_FILTERS.filter((k) => k !== 'q' && first(params[k])).length;

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'cat.title')} subtitle={t(lang, 'cat.subtitle')} />

      {nothingListed ? (
        <EmptyState title={t(lang, 'cat.emptyTitle')} body={t(lang, 'cat.emptyBody')} />
      ) : (
        <>
          <form method="get" action="/influencers" className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,4fr)_auto] lg:items-end lg:gap-4 lg:space-y-0">
            {shortlist.map((id) => <input key={id} type="hidden" name="with" value={id} />)}
            <div className="space-y-1.5">
              <label htmlFor="f-q" className="block text-sm font-medium">{t(lang, 'cat.search')}</label>
              <input id="f-q" name="q" type="search" defaultValue={first(params.q)} placeholder={t(lang, 'cat.searchHint')} className={control} />
            </div>
            <Disclosure label={active ? `${t(lang, 'cat.filters')} (${active})` : t(lang, 'cat.filters')} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                <FilterSelect name="platform" label={t(lang, 'cat.platform')} value={first(params.platform)} lang={lang} options={facets.platforms.map((v) => ({ value: v, label: v }))} />
                <FilterSelect name="niche" label={t(lang, 'cat.niche')} value={first(params.niche)} lang={lang} options={facets.niches.map((v) => ({ value: v, label: v }))} />
                <FilterSelect name="availability" label={t(lang, 'cat.availability')} value={first(params.availability)} lang={lang} options={facets.availability.map((v) => ({ value: v, label: availabilityLabel(v, lang) }))} />
                <FilterSelect name="minFollowers" label={t(lang, 'cat.minFollowers')} value={first(params.minFollowers)} lang={lang} options={FOLLOWER_STEPS.map((n) => ({ value: String(n), label: formatCompact(n, lang) }))} />
              </div>
            </Disclosure>
            <div className="flex items-center gap-2">
              <button type="submit" className={button.primary}>{t(lang, 'cat.apply')}</button>
              {query && <Link href={hrefWith({}, shortlist)} className={button.ghost}>{t(lang, 'cat.clear')}</Link>}
            </div>
          </form>

          <section aria-labelledby="results-title" className="space-y-3">
            <h2 id="results-title" className="text-sm text-ink-soft">
              {t(lang, 'cat.results')}: <bdi className="font-semibold text-ink">{total}</bdi>
              <span className="ms-2 hidden sm:inline">{t(lang, 'cat.tickHint')}</span>
            </h2>
            {items.length === 0 ? (
              <EmptyState title={t(lang, 'cat.noMatchTitle')} action={<Link href={hrefWith({}, shortlist)} className={button.secondary}>{t(lang, 'cat.clear')}</Link>} />
            ) : (
              <ul className={list}>
                {items.map((entry) => (
                  <InfluencerRow key={entry.id} entry={entry} lang={lang} chosen={shortlist.includes(entry.id)} toggleHref={hrefWith(params, toggleShortlist(shortlist, entry.id))} />
                ))}
              </ul>
            )}
            {total > items.length && <p className="text-sm text-ink-soft">{t(lang, 'cat.truncated')}</p>}
          </section>

          {shortlist.length > 0 && (
            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 lg:bottom-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-3 shadow-float sm:px-5">
                <p className="text-[15px] font-medium">{t(lang, shortlist.length === 1 ? 'cat.chosenOne' : 'cat.chosenMany').replace('{n}', String(shortlist.length))}</p>
                <div className="flex items-center gap-2">
                  <Link href={hrefWith(params, [])} scroll={false} className={button.ghost}>{t(lang, 'cat.clearShortlist')}</Link>
                  <Link href={shortlistHref(shortlist)} className={button.primary}>{t(lang, 'cat.requestWith')}</Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
