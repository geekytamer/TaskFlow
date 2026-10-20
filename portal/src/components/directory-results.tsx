'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { BudgetPlanner } from './budget-planner';
import { FilterBar, ResultsHeader, ResultsPane, useDirectory } from './directory-filters';
import { InfluencerPhoto } from './influencer-photo';
import { PriceTag } from './price-tag';
import { ChooseButton, ShortlistItem } from './shortlist';
import { EmptyState, button, list, panel } from './ui';
import { VerifiedMark } from './verified-mark';
import type { CatalogueList, CatalogueEntry } from '@/lib/catalogue';
import { nicheLabel, placeLabel } from '@/lib/directory-labels';
import { applyDirectory, optionCounts, placeFacets, splitNiches, splitPlaces } from '@/lib/directory-match';
import { activityLevel, effectiveSort, goalOf, isUnavailable } from '@/lib/directory-view';
import { formatCompact, listSep, plural } from '@/lib/format';
import { dictionaries, t, type Key, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';

/**
 * The influencer directory in the browser: filters, order, Help me choose and
 * the cards all work on the list the page loaded, so every tap answers at
 * once. The server only renders the first view (from the URL).
 */

function Stats({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  const top = [...entry.platforms].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
  const growth = entry.growth3m === null ? null : `${entry.growth3m > 0 ? '+' : ''}${Math.round(entry.growth3m * 10) / 10}%`;
  // Posting rate a month replaces engagement on the card: is this creator still posting?
  const level = activityLevel(entry.activity);
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
        <dd className={`font-semibold ${level === 'high' || level === 'active' ? 'text-success' : 'text-ink-soft'}`}>{t(lang, `dir.activity.${level}` as Key)}</dd>
        <dt className="text-xs text-ink-soft">
          {entry.activity ? <bdi>{plural(lang, 'dir.activity.perMonth', entry.activity.perMonth, dictionaries[lang])}</bdi> : t(lang, 'dir.activity')}
        </dt>
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
  [splitNiches(entry.niche).map((n) => nicheLabel(n, lang)).join(listSep(lang)) || null, splitPlaces(entry.location).map((p) => placeLabel(p, lang)).join(listSep(lang)) || null, t(lang, `disc.tier.${entry.tier}` as Key)].filter(Boolean).join(listSep(lang));

export function InfluencerCard({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  // Hovering a creator starts loading their page, so the click opens it at once.
  const router = useRouter();
  return (
    <ShortlistItem id={entry.id} className={`${panel} flex flex-col gap-4 p-4`} chosenClassName="ring-2 ring-accent">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/influencers/${entry.id}`} prefetch={false} onMouseEnter={() => router.prefetch(`/influencers/${entry.id}`)} className="group flex min-w-0 items-center gap-3">
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
        <ChooseButton id={entry.id} name={entry.name} lang={lang} unavailable={isUnavailable(entry)} />
      </div>
    </ShortlistItem>
  );
}

export function InfluencerRow({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  const router = useRouter();
  return (
    <ShortlistItem id={entry.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_10rem_auto] md:items-center md:gap-6" chosenClassName="bg-accent/[0.04]">
      <Link href={`/influencers/${entry.id}`} prefetch={false} onMouseEnter={() => router.prefetch(`/influencers/${entry.id}`)} className="group flex min-w-0 items-center gap-3">
        <InfluencerPhoto id={entry.id} name={entry.name} photoAt={entry.photoAt} />
        <span className="min-w-0">
          <span className="block truncate font-semibold group-hover:underline"><bdi>{entry.name}</bdi></span>
          <span className="block truncate text-sm text-ink-soft">{metaOf(entry, lang)}</span>
          {entry.availability && <span className="block text-xs font-medium text-ink-soft">{availabilityLabel(entry.availability, lang)}</span>}
        </span>
      </Link>
      <Stats entry={entry} lang={lang} />
      <div className="md:text-end"><PriceTag price={entry.price} lang={lang} /></div>
      <ChooseButton id={entry.id} name={entry.name} lang={lang} unavailable={isUnavailable(entry)} />
    </ShortlistItem>
  );
}


export function DirectoryView({ all, facets, currency, lang, markSrc }: {
  all: CatalogueEntry[]; facets: CatalogueList['facets']; currency: string; lang: Lang; markSrc: string | null;
}) {
  const { values, view, navigate, clearAll } = useDirectory();
  const items = useMemo(() => applyDirectory(all, values), [all, values]);
  const sort = effectiveSort(values);
  // Places split into single towns ("Muscat, Nizwa" counts for both), most common first.
  const lists = useMemo(() => ({ ...facets, locations: placeFacets(all) }), [facets, all]);
  const showGender = useMemo(() => all.some((e) => e.gender), [all]);
  const counts = useMemo(() => ({
    platform: optionCounts(all, values, 'platform', lists.platforms),
    niche: optionCounts(all, values, 'niche', lists.niches),
    location: optionCounts(all, values, 'location', lists.locations),
    gender: optionCounts(all, values, 'gender', ['female', 'male']),
  }), [all, values, lists]);
  const Item = view === 'list' ? InfluencerRow : InfluencerCard;
  // Remounts the list when the results change, so new cards settle in.
  const resultsKey = `${JSON.stringify(values)}|${view}`;

  return (
    <>
      <BudgetPlanner items={items} currency={currency} lang={lang} goal={goalOf(values)} markSrc={markSrc} />
      <FilterBar values={values} facets={lists} currency={currency} lang={lang} count={items.length} counts={counts} showGender={showGender} />
      <section aria-labelledby="results-title" className="space-y-4">
        <ResultsHeader count={items.length} sort={sort} lang={lang} viewSwitch={
          <div role="group" aria-label={t(lang, 'cat.view')} className="inline-flex rounded-control border border-field p-0.5">
            {(['cards', 'list'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => navigate({ view: v })}
                className={`inline-flex min-h-9 items-center rounded-[6px] px-3 text-sm font-medium transition-colors ${view === v ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'}`}>
                {t(lang, v === 'cards' ? 'cat.viewCards' : 'cat.viewList')}
              </button>
            ))}
          </div>
        } />
        <p className="hidden text-sm text-ink-soft sm:block">{t(lang, 'cat.tickHint')}</p>
        <ResultsPane>
          {items.length === 0 ? (
            <EmptyState title={t(lang, 'cat.noMatchTitle')} action={<button type="button" onClick={clearAll} className={button.secondary}>{t(lang, 'dir.clearAll')}</button>} />
          ) : (
            <ul key={resultsKey} className={`results-in ${view === 'list' ? list : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}`}>
              {items.map((entry) => <Item key={entry.id} entry={entry} lang={lang} />)}
            </ul>
          )}
        </ResultsPane>
      </section>
    </>
  );
}
