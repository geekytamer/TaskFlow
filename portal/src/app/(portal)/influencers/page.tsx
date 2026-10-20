import Link from 'next/link';
import { DirectoryProvider, FilterBar, ResultsHeader, ResultsPane } from '@/components/directory-filters';
import { InfluencerPhoto } from '@/components/influencer-photo';
import { PriceTag } from '@/components/price-tag';
import { EmptyState, PageHeader, button, list, panel } from '@/components/ui';
import { VerifiedMark } from '@/components/verified-mark';
import { getCatalogue, type CatalogueEntry } from '@/lib/catalogue';
import { growthLabel } from '@/lib/discover';
import { backendQuery, DIRECTORY_PARAMS, effectiveSort, readParams, refineDirectory } from '@/lib/directory-view';
import { formatCompact, formatPercent, listSep, nicheText } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';
import { parseShortlist } from '@/lib/shortlist';
import { ChooseButton, ShortlistBar, ShortlistInputs, ShortlistItem, ShortlistLink, ShortlistProvider } from '@/components/shortlist';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type View = 'cards' | 'list';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** The current page's URL with a different view, so every click keeps the filters (the shortlist is added in the browser). */
function hrefWith(params: Record<string, string | string[] | undefined>, view: View) {
  const q = new URLSearchParams();
  for (const key of DIRECTORY_PARAMS) { const v = first(params[key]); if (v) q.set(key, v); }
  if (view === 'list') q.set('view', 'list');
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

const metaOf = (entry: CatalogueEntry, lang: Lang) =>
  [nicheText(entry.niche, lang), entry.location, t(lang, `disc.tier.${entry.tier}` as Key)].filter(Boolean).join(listSep(lang));

function InfluencerCard({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  return (
    <ShortlistItem id={entry.id} className={`${panel} flex flex-col gap-4 p-4`} chosenClassName="ring-2 ring-accent">
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
        <ChooseButton id={entry.id} name={entry.name} lang={lang} />
      </div>
    </ShortlistItem>
  );
}

function InfluencerRow({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  return (
    <ShortlistItem id={entry.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_10rem_auto] md:items-center md:gap-6" chosenClassName="bg-accent/[0.04]">
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
      <ChooseButton id={entry.id} name={entry.name} lang={lang} />
    </ShortlistItem>
  );
}

export default async function InfluencersPage({ searchParams }: { searchParams: SearchParams }) {
  requireAudience('client');
  const params = await searchParams;
  const lang = await currentLang();
  const view: View = first(params.view) === 'list' ? 'list' : 'cards';
  const values = readParams(params);
  const catalogue = await getCatalogue(backendQuery(values));
  const { facets, currency } = catalogue;
  // Engagement and growth floors and "most relevant" are applied here, on what the backend returned.
  const items = refineDirectory(catalogue.items, values);
  const sort = effectiveSort(values);
  const filtered = DIRECTORY_PARAMS.some((k) => k !== 'sort' && values[k]);
  const nothingListed = catalogue.total === 0 && !filtered;
  const shortlist = parseShortlist(params.with);
  const Item = view === 'list' ? InfluencerRow : InfluencerCard;
  // Remounts the list when the results change, so new cards fade in.
  const resultsKey = `${backendQuery(values)}|${values.minEngagement ?? ''}|${values.minGrowth ?? ''}|${view}`;

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'cat.title')} subtitle={t(lang, 'cat.subtitle')} />

      {nothingListed ? (
        <EmptyState title={t(lang, 'cat.emptyTitle')} body={t(lang, 'cat.emptyBody')} />
      ) : (
        // Keyed on the URL's shortlist: a Back/Forward that restores another
        // page starts from that page's `with`, not the one held in memory.
        <ShortlistProvider key={shortlist.join(',')} initial={shortlist}>
          <DirectoryProvider>
            <FilterBar values={values} facets={facets} currency={currency} lang={lang} count={items.length} />

            <section aria-labelledby="results-title" className="space-y-4">
              <ResultsHeader count={items.length} sort={sort} lang={lang} viewSwitch={
                <div role="group" aria-label={t(lang, 'cat.view')} className="inline-flex rounded-control border border-field p-0.5">
                  {(['cards', 'list'] as const).map((v) => (
                    <ShortlistLink key={v} href={hrefWith(params, v)} aria-current={view === v ? 'true' : undefined}
                      className={`inline-flex min-h-9 items-center rounded-[6px] px-3 text-sm font-medium transition-colors ${view === v ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'}`}>
                      {t(lang, v === 'cards' ? 'cat.viewCards' : 'cat.viewList')}
                    </ShortlistLink>
                  ))}
                </div>
              } />
              <p className="hidden text-sm text-ink-soft sm:block">{t(lang, 'cat.tickHint')}</p>
              <ResultsPane>
                {items.length === 0 ? (
                  <EmptyState title={t(lang, 'cat.noMatchTitle')} action={<ShortlistLink href={hrefWith({}, view)} className={button.secondary}>{t(lang, 'dir.clearAll')}</ShortlistLink>} />
                ) : (
                  <ul key={resultsKey} className={`results-in ${view === 'list' ? list : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}`}>
                    {items.map((entry) => (
                      <Item key={entry.id} entry={entry} lang={lang} />
                    ))}
                  </ul>
                )}
              </ResultsPane>
            </section>
          </DirectoryProvider>

          <ShortlistBar lang={lang} />
        </ShortlistProvider>
      )}
    </div>
  );
}
