import Link from 'next/link';
import { VerifiedMark } from '@/components/verified-mark';
import { PriceTag } from '@/components/price-tag';
import { getCatalogue, type CatalogueEntry } from '@/lib/catalogue';
import { catalogueQuery, formatCompact, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Lang } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';
import { currentLang } from '@/lib/session';
import { backLink } from '@/components/field';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FOLLOWER_STEPS = [10_000, 50_000, 100_000, 500_000, 1_000_000];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const control =
  'h-10 w-full rounded-[10px] border border-field bg-surface px-3 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

function FilterSelect({
  name, label, value, options, lang,
}: { name: string; label: string; value: string; options: Array<{ value: string; label: string }>; lang: Lang }) {
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

function InfluencerRow({ entry, lang }: { entry: CatalogueEntry; lang: Lang }) {
  const meta = [entry.niche, entry.location].filter(Boolean).join(listSep(lang));
  return (
    <li>
      <Link
        href={`/influencers/${entry.id}`}
        className="grid gap-3 px-1 py-5 transition-colors hover:bg-surface md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_10rem] md:items-center md:gap-6 md:px-3"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold">{entry.name}</p>
          {meta && <p className="mt-0.5 truncate text-sm text-ink-soft">{meta}</p>}
          {entry.availability && (
            <p className="mt-1 text-xs font-medium text-ink-soft">{availabilityLabel(entry.availability, lang)}</p>
          )}
        </div>
        <ul className="flex flex-wrap gap-2" aria-label={t(lang, 'cat.accounts')}>
          {entry.platforms.map((p) => (
            <li key={`${p.platform}-${p.handle ?? ''}`} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
              <bdi className="font-medium">{p.platform}</bdi>
              <bdi className="ms-1.5 tabular-nums text-ink-soft">{formatCompact(p.followers, lang)}</bdi>
              {p.verified && <span className="ms-1.5 align-middle"><VerifiedMark asOf={p.verified.asOf} lang={lang} compact /></span>}
            </li>
          ))}
        </ul>
        <div className="md:text-end">
          <PriceTag price={entry.price} lang={lang} />
        </div>
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

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'cat.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'cat.subtitle')}</p>
      </header>

      {nothingListed ? (
        <section className="max-w-xl border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'cat.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'cat.emptyBody')}</p>
        </section>
      ) : (
        <>
          <form method="get" action="/influencers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div className="col-span-2 space-y-1.5 lg:col-span-1">
              <label htmlFor="f-q" className="block text-sm font-medium">{t(lang, 'cat.search')}</label>
              <input id="f-q" name="q" type="search" defaultValue={first(params.q)} placeholder={t(lang, 'cat.searchHint')} className={control} />
            </div>
            <FilterSelect name="platform" label={t(lang, 'cat.platform')} value={first(params.platform)} lang={lang}
              options={facets.platforms.map((v) => ({ value: v, label: v }))} />
            <FilterSelect name="niche" label={t(lang, 'cat.niche')} value={first(params.niche)} lang={lang}
              options={facets.niches.map((v) => ({ value: v, label: v }))} />
            <FilterSelect name="availability" label={t(lang, 'cat.availability')} value={first(params.availability)} lang={lang}
              options={facets.availability.map((v) => ({ value: v, label: availabilityLabel(v, lang) }))} />
            <FilterSelect name="minFollowers" label={t(lang, 'cat.minFollowers')} value={first(params.minFollowers)} lang={lang}
              options={FOLLOWER_STEPS.map((n) => ({ value: String(n), label: formatCompact(n, lang) }))} />
            <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
              <button type="submit" className="h-10 rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90 active:translate-y-px">
                {t(lang, 'cat.apply')}
              </button>
              {query && (
                <Link href="/influencers" className={`whitespace-nowrap ${backLink}`}>
                  {t(lang, 'cat.clear')}
                </Link>
              )}
            </div>
          </form>

          <section aria-labelledby="results-title">
            <h2 id="results-title" className="mb-2 text-sm text-ink-soft">
              {t(lang, 'cat.results')}: <span className="tabular-nums">{total}</span>
            </h2>
            {items.length === 0 ? (
              <div className="border-t border-line pt-8">
                <p className="font-semibold">{t(lang, 'cat.noMatchTitle')}</p>
                <Link href="/influencers" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
                  {t(lang, 'cat.clear')}
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {items.map((entry) => <InfluencerRow key={entry.id} entry={entry} lang={lang} />)}
              </ul>
            )}
            {total > items.length && <p className="mt-4 text-sm text-ink-soft">{t(lang, 'cat.truncated')}</p>}
          </section>
        </>
      )}
    </div>
  );
}
