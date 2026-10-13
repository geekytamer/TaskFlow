import Link from 'next/link';
import { Disclosure } from '@/components/disclosure';
import { InfluencerPhoto } from '@/components/influencer-photo';
import { PriceTag } from '@/components/price-tag';
import { EmptyState, PageHeader, button, list, panel } from '@/components/ui';
import { VerifiedMark } from '@/components/verified-mark';
import { getCatalogue, type CatalogueEntry } from '@/lib/catalogue';
import { growthLabel } from '@/lib/discover';
import { CATALOGUE_FILTERS, catalogueQuery, formatCompact, formatPercent, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';
import { parseShortlist, shortlistHref, toggleShortlist } from '@/lib/shortlist';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type View = 'cards' | 'list';

const FOLLOWER_STEPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];
const BUDGET_STEPS = [100, 250, 500, 1_000, 2_500, 5_000];
const SORTS = [
  { value: 'followers', key: 'disc.sortFollowers' },
  { value: 'engagement', key: 'disc.sortEngagement' },
  { value: 'growth', key: 'disc.sortGrowth' },
  { value: 'price', key: 'cat.sortPrice' },
  { value: 'name', key: 'cat.sortName' },
] as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const control =
  'h-11 w-full rounded-control border border-field bg-surface px-3 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

function FilterSelect({ name, label, value, options, lang, any = true }: {
  name: string; label: string; value: string; options: Array<{ value: string; label: string }>; lang: Lang; any?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`f-${name}`} className="block truncate text-sm font-medium">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value} className={control}>
        {any && <option value="">{t(lang, 'cat.any')}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** The current page's URL with a different shortlist or view, so every click keeps the filters. */
function hrefWith(params: Record<string, string | string[] | undefined>, ids: string[], view: View) {
  const q = new URLSearchParams();
  for (const key of CATALOGUE_FILTERS) { const v = first(params[key]); if (v) q.set(key, v); }
  if (view === 'list') q.set('view', 'list');
  ids.forEach((id) => q.append('with', id));
  const text = q.toString();
  return text ? `/influencers?${text}` : '/influencers';
}

function Stats({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  const top = [...entry.platforms].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
  const growth = growthLabel(entry.growth3m);
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-control bg-ink/[0.04] px-2 py-2">
        <dd className="font-semibold tabular-nums">
          <bdi>{formatCompact(entry.followers, lang)}</bdi>
          {top?.verified && <span className="ms-1 align-middle"><VerifiedMark asOf={top.verified.asOf} lang={lang} compact /></span>}
        </dd>
        <dt className="text-xs text-ink-soft">{t(lang, 'cat.followers')}</dt>
      </div>
      <div className="rounded-control bg-ink/[0.04] px-2 py-2">
        <dd className="font-semibold tabular-nums"><bdi>{formatPercent(entry.engagementRate, lang)}</bdi></dd>
        <dt className="text-xs text-ink-soft">{t(lang, 'cat.engagement')}</dt>
      </div>
      <div className="rounded-control bg-ink/[0.04] px-2 py-2">
        <dd className={`font-semibold tabular-nums ${entry.growth3m === null ? 'text-ink-soft' : entry.growth3m >= 0 ? 'text-success' : 'text-danger'}`}>
          <bdi dir="ltr">{growth ?? t(lang, 'disc.new')}</bdi>
        </dd>
        <dt className="text-xs text-ink-soft">{t(lang, 'disc.growth')}</dt>
      </div>
    </dl>
  );
}

function ChooseLink({ entry, lang, chosen, href }: { entry: CatalogueEntry; lang: Lang; chosen: boolean; href: string }) {
  return (
    <Link href={href} scroll={false} aria-pressed={chosen}
      aria-label={`${t(lang, chosen ? 'cat.removeShortlist' : 'cat.addShortlist')}: ${entry.name}`}
      className={`inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-colors ${chosen ? 'bg-accent text-accent-ink' : 'border border-field hover:bg-surface-2'}`}>
      <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${chosen ? 'border-accent-ink' : 'border-field bg-surface'}`}>
        {chosen && <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
      </span>
      {t(lang, chosen ? 'cat.chosen' : 'cat.choose')}
    </Link>
  );
}

const metaOf = (entry: CatalogueEntry, lang: Lang) =>
  [entry.niche, entry.location, t(lang, `disc.tier.${entry.tier}` as Key)].filter(Boolean).join(listSep(lang));

function InfluencerCard({ entry, lang, chosen, toggleHref }: { entry: CatalogueEntry; lang: Lang; chosen: boolean; toggleHref: string }) {
  return (
    <li className={`${panel} flex flex-col gap-4 p-4 ${chosen ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/influencers/${entry.id}`} className="group flex min-w-0 items-center gap-3">
          <InfluencerPhoto id={entry.id} name={entry.name} photoAt={entry.photoAt} />
          <span className="min-w-0">
            <span className="block truncate font-semibold group-hover:underline"><bdi>{entry.name}</bdi></span>
            <span className="block truncate text-sm text-ink-soft">{metaOf(entry, lang)}</span>
          </span>
        </Link>
        {entry.availability && (
          <span className="shrink-0 rounded-full bg-ink/[0.06] px-2 py-0.5 text-xs font-medium text-ink-soft">{availabilityLabel(entry.availability, lang)}</span>
        )}
      </div>
      {entry.bio && <p dir="auto" className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{entry.bio}</p>}
      <Stats entry={entry} lang={lang} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <PriceTag price={entry.price} lang={lang} />
        <ChooseLink entry={entry} lang={lang} chosen={chosen} href={toggleHref} />
      </div>
    </li>
  );
}

function InfluencerRow({ entry, lang, chosen, toggleHref }: { entry: CatalogueEntry; lang: Lang; chosen: boolean; toggleHref: string }) {
  return (
    <li className={`grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_10rem_auto] md:items-center md:gap-6 ${chosen ? 'bg-accent/[0.04]' : ''}`}>
      <Link href={`/influencers/${entry.id}`} className="group flex min-w-0 items-center gap-3">
        <InfluencerPhoto id={entry.id} name={entry.name} photoAt={entry.photoAt} />
        <span className="min-w-0">
          <span className="block truncate font-semibold group-hover:underline"><bdi>{entry.name}</bdi></span>
          <span className="block truncate text-sm text-ink-soft">{metaOf(entry, lang)}</span>
          {entry.availability && <span className="block text-xs font-medium text-ink-soft">{availabilityLabel(entry.availability, lang)}</span>}
        </span>
      </Link>
      <Stats entry={entry} lang={lang} />
      <div className="md:text-end"><PriceTag price={entry.price} lang={lang} /></div>
      <ChooseLink entry={entry} lang={lang} chosen={chosen} href={toggleHref} />
    </li>
  );
}

export default async function InfluencersPage({ searchParams }: { searchParams: SearchParams }) {
  requireAudience('client');
  const params = await searchParams;
  const lang = await currentLang();
  const view: View = first(params.view) === 'list' ? 'list' : 'cards';
  const query = catalogueQuery(params);
  const { items, total, facets, currency } = await getCatalogue(query);
  const filtered = CATALOGUE_FILTERS.some((k) => k !== 'sort' && first(params[k]));
  const nothingListed = total === 0 && !filtered;
  const shortlist = parseShortlist(params.with);
  const active = CATALOGUE_FILTERS.filter((k) => k !== 'q' && k !== 'sort' && first(params[k])).length;
  const Item = view === 'list' ? InfluencerRow : InfluencerCard;

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'cat.title')} subtitle={t(lang, 'cat.subtitle')} />

      {nothingListed ? (
        <EmptyState title={t(lang, 'cat.emptyTitle')} body={t(lang, 'cat.emptyBody')} />
      ) : (
        <>
          <form method="get" action="/influencers" className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,4fr)_auto] lg:items-end lg:gap-4 lg:space-y-0">
            {shortlist.map((id) => <input key={id} type="hidden" name="with" value={id} />)}
            {view === 'list' && <input type="hidden" name="view" value="list" />}
            <div className="space-y-1.5">
              <label htmlFor="f-q" className="block text-sm font-medium">{t(lang, 'cat.search')}</label>
              <input id="f-q" name="q" type="search" defaultValue={first(params.q)} placeholder={t(lang, 'cat.searchHint')} className={control} />
            </div>
            <FilterSelect name="sort" label={t(lang, 'disc.sort')} value={first(params.sort) || 'followers'} lang={lang} any={false}
              options={SORTS.map((s) => ({ value: s.value, label: t(lang, s.key) }))} />
            <Disclosure label={active ? `${t(lang, 'cat.filters')} (${active})` : t(lang, 'cat.filters')} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                <FilterSelect name="platform" label={t(lang, 'cat.platform')} value={first(params.platform)} lang={lang} options={facets.platforms.map((v) => ({ value: v, label: v }))} />
                <FilterSelect name="niche" label={t(lang, 'cat.niche')} value={first(params.niche)} lang={lang} options={facets.niches.map((v) => ({ value: v, label: v }))} />
                <FilterSelect name="location" label={t(lang, 'disc.location')} value={first(params.location)} lang={lang} options={facets.locations.map((v) => ({ value: v, label: v }))} />
                <FilterSelect name="gender" label={t(lang, 'disc.gender')} value={first(params.gender)} lang={lang}
                  options={[{ value: 'female', label: t(lang, 'disc.female') }, { value: 'male', label: t(lang, 'disc.male') }]} />
                <FilterSelect name="tier" label={t(lang, 'disc.tier')} value={first(params.tier)} lang={lang}
                  options={facets.tiers.map((v) => ({ value: v, label: t(lang, `disc.tier.${v}` as Key) }))} />
                <FilterSelect name="availability" label={t(lang, 'cat.availability')} value={first(params.availability)} lang={lang} options={facets.availability.map((v) => ({ value: v, label: availabilityLabel(v, lang) }))} />
                <FilterSelect name="minFollowers" label={t(lang, 'cat.minFollowers')} value={first(params.minFollowers)} lang={lang} options={FOLLOWER_STEPS.map((n) => ({ value: String(n), label: formatCompact(n, lang) }))} />
                <FilterSelect name="maxPrice" label={t(lang, 'cat.maxPrice')} value={first(params.maxPrice)} lang={lang}
                  options={BUDGET_STEPS.map((n) => ({ value: String(n), label: `${formatCompact(n, lang)} ${currency}` }))} />
              </div>
            </Disclosure>
            <div className="flex items-center gap-2">
              <button type="submit" className={button.primary}>{t(lang, 'cat.apply')}</button>
              {filtered && <Link href={hrefWith({}, shortlist, view)} className={button.ghost}>{t(lang, 'cat.clear')}</Link>}
            </div>
          </form>

          <section aria-labelledby="results-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="results-title" className="text-sm text-ink-soft">
                {t(lang, 'cat.results')}: <bdi className="font-semibold text-ink">{total}</bdi>
                <span className="ms-2 hidden sm:inline">{t(lang, 'cat.tickHint')}</span>
              </h2>
              <div role="group" aria-label={t(lang, 'cat.view')} className="inline-flex rounded-control border border-field p-0.5">
                {(['cards', 'list'] as const).map((v) => (
                  <Link key={v} href={hrefWith(params, shortlist, v)} scroll={false} aria-current={view === v ? 'true' : undefined}
                    className={`inline-flex min-h-9 items-center rounded-[6px] px-3 text-sm font-medium ${view === v ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'}`}>
                    {t(lang, v === 'cards' ? 'cat.viewCards' : 'cat.viewList')}
                  </Link>
                ))}
              </div>
            </div>
            {items.length === 0 ? (
              <EmptyState title={t(lang, 'cat.noMatchTitle')} action={<Link href={hrefWith({}, shortlist, view)} className={button.secondary}>{t(lang, 'cat.clear')}</Link>} />
            ) : (
              <ul className={view === 'list' ? list : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                {items.map((entry) => (
                  <Item key={entry.id} entry={entry} lang={lang} chosen={shortlist.includes(entry.id)} toggleHref={hrefWith(params, toggleShortlist(shortlist, entry.id), view)} />
                ))}
              </ul>
            )}
          </section>

          {shortlist.length > 0 && (
            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 lg:bottom-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-3 shadow-float sm:px-5">
                <p className="text-[15px] font-medium">{t(lang, shortlist.length === 1 ? 'cat.chosenOne' : 'cat.chosenMany').replace('{n}', String(shortlist.length))}</p>
                <div className="flex items-center gap-2">
                  <Link href={hrefWith(params, [], view)} scroll={false} className={button.ghost}>{t(lang, 'cat.clearShortlist')}</Link>
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
