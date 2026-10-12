import Link from 'next/link';
import { Disclosure } from '@/components/disclosure';
import { DiscoverRequest } from '@/components/discover-request';
import { EmptyState, PageHeader, button, list } from '@/components/ui';
import { discoverQuery, getDiscover, growthLabel, type DiscoverEntry, type Tier } from '@/lib/discover';
import { formatCompact, formatDate, formatPercent, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const control =
  'h-11 w-full rounded-control border border-field bg-surface px-3 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

const tierLabel = (tier: Tier, lang: Lang) => t(lang, `disc.tier.${tier}` as Key);

function Select({ name, label, value, options, lang, any = true }: {
  name: string; label: string; value: string; options: Array<{ value: string; label: string }>; lang: Lang; any?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`d-${name}`} className="block truncate text-sm font-medium">{label}</label>
      <select id={`d-${name}`} name={name} defaultValue={value} className={control}>
        {any && <option value="">{t(lang, 'disc.any')}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Avatar({ entry }: { entry: DiscoverEntry }) {
  const initial = (entry.fullName || entry.username).trim().charAt(0).toUpperCase();
  return entry.hasPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element -- served by the portal's own route, sized here
    <img src={`/api/discover/${encodeURIComponent(entry.id)}/photo`} alt="" width={56} height={56} loading="lazy"
      className="h-14 w-14 shrink-0 rounded-full border border-line object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-lg font-semibold text-ink-soft">{initial}</span>
  );
}

function Row({ entry, rank, lang }: { entry: DiscoverEntry; rank: number; lang: Lang }) {
  const growth = growthLabel(entry.growth3m);
  const meta = [entry.niche, entry.location, entry.gender ? t(lang, entry.gender === 'female' ? 'disc.female' : 'disc.male') : null]
    .filter(Boolean).join(listSep(lang));
  return (
    <li className="grid gap-4 px-4 py-5 sm:px-5 lg:grid-cols-[2.25rem_minmax(0,2.2fr)_minmax(0,1.6fr)_12rem] lg:items-center lg:gap-6">
      <p className="hidden text-lg font-semibold tabular-nums text-ink-soft lg:block"><bdi>{rank}</bdi></p>
      <div className="flex min-w-0 items-start gap-3">
        <Avatar entry={entry} />
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold tabular-nums text-ink-soft lg:hidden">#{rank}</span>
            <span className="truncate font-semibold"><bdi>{entry.fullName || entry.username}</bdi></span>
            {entry.verified && (
              <svg role="img" aria-label={t(lang, 'disc.verified')} viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="currentColor">
                <path d="M8 .9 9.9 2.3l2.3-.1.7 2.2 1.9 1.4-.8 2.2.8 2.2-1.9 1.4-.7 2.2-2.3-.1L8 15.1l-1.9-1.4-2.3.1-.7-2.2-1.9-1.4.8-2.2-.8-2.2 1.9-1.4.7-2.2 2.3.1Zm-1 9.8 4.4-4.4-1-1L7 8.7 5.6 7.3l-1 1Z" />
              </svg>
            )}
            {entry.catalogueId && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{t(lang, 'disc.worksWithPeak')}</span>}
          </p>
          <p className="text-sm text-ink-soft"><bdi dir="ltr">@{entry.username}</bdi>{meta && <> · {meta}</>}</p>
          {entry.bio && <p dir="auto" className="line-clamp-2 max-w-[60ch] whitespace-pre-line text-sm leading-relaxed">{entry.bio}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-soft">{t(lang, 'disc.followers')}</dt>
          <dd className="font-semibold"><bdi>{formatCompact(entry.followers, lang)}</bdi></dd>
          <dd className="text-xs text-ink-soft">{tierLabel(entry.tier, lang)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">{t(lang, 'disc.growth')}</dt>
          <dd className={`font-semibold ${entry.growth3m === null ? 'text-ink-soft' : entry.growth3m >= 0 ? 'text-success' : 'text-danger'}`}>
            <bdi dir="ltr">{growth ?? t(lang, 'disc.new')}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">{t(lang, 'disc.engagement')}</dt>
          <dd className="font-semibold"><bdi>{formatPercent(entry.engagementRate, lang)}</bdi></dd>
        </div>
      </dl>
      <div className="space-y-2 lg:text-end">
        {entry.catalogueId && (
          <Link href={`/influencers/${encodeURIComponent(entry.catalogueId)}`} className="block text-sm font-medium underline-offset-4 hover:underline">
            {t(lang, 'disc.viewProfile')}
          </Link>
        )}
        <DiscoverRequest lang={lang} id={entry.id} requested={entry.requested} />
        <p className="text-xs text-ink-soft">{t(lang, 'disc.checked')} <bdi>{formatDate(entry.lastCheckedAt, lang)}</bdi></p>
      </div>
    </li>
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  requireAudience('client');
  const params = await searchParams;
  const lang = await currentLang();
  const query = discoverQuery(params);
  const { items, total, facets } = await getDiscover(query);
  const filtered = ['q', 'tier', 'niche', 'location', 'gender', 'peak'].some((k) => first(params[k]));
  const active = ['tier', 'niche', 'location', 'gender', 'peak'].filter((k) => first(params[k])).length;
  const empty = total === 0 && !filtered;

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'disc.title')} subtitle={t(lang, 'disc.subtitle')} />

      {empty ? (
        <EmptyState title={t(lang, 'disc.emptyTitle')} body={t(lang, 'disc.emptyBody')} />
      ) : (
        <>
          <form method="get" action="/discover" className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,4fr)_auto] lg:items-end lg:gap-4 lg:space-y-0">
            <div className="space-y-1.5">
              <label htmlFor="d-q" className="block text-sm font-medium">{t(lang, 'disc.search')}</label>
              <input id="d-q" name="q" type="search" defaultValue={first(params.q)} placeholder={t(lang, 'disc.searchHint')} className={control} />
            </div>
            <Select name="sort" label={t(lang, 'disc.sort')} value={first(params.sort) || 'followers'} lang={lang} any={false} options={[
              { value: 'followers', label: t(lang, 'disc.sortFollowers') },
              { value: 'growth', label: t(lang, 'disc.sortGrowth') },
              { value: 'engagement', label: t(lang, 'disc.sortEngagement') },
            ]} />
            <Disclosure label={active ? `${t(lang, 'cat.filters')} (${active})` : t(lang, 'cat.filters')} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                <Select name="tier" label={t(lang, 'disc.tier')} value={first(params.tier)} lang={lang}
                  options={facets.tiers.map((v) => ({ value: v, label: tierLabel(v, lang) }))} />
                <Select name="niche" label={t(lang, 'disc.niche')} value={first(params.niche)} lang={lang} options={facets.niches.map((v) => ({ value: v, label: v }))} />
                <Select name="location" label={t(lang, 'disc.location')} value={first(params.location)} lang={lang} options={facets.locations.map((v) => ({ value: v, label: v }))} />
                <Select name="gender" label={t(lang, 'disc.gender')} value={first(params.gender)} lang={lang}
                  options={[{ value: 'female', label: t(lang, 'disc.female') }, { value: 'male', label: t(lang, 'disc.male') }]} />
                <label className="col-span-2 flex items-center gap-2 text-sm font-medium lg:col-span-4">
                  <input type="checkbox" name="peak" value="1" defaultChecked={first(params.peak) === '1'} className="h-4 w-4 accent-[var(--accent)]" />
                  {t(lang, 'disc.peakOnly')}
                </label>
              </div>
            </Disclosure>
            <div className="flex items-center gap-2">
              <button type="submit" className={button.primary}>{t(lang, 'disc.apply')}</button>
              {filtered && <Link href="/discover" className={button.ghost}>{t(lang, 'disc.clear')}</Link>}
            </div>
          </form>

          <section aria-labelledby="disc-results" className="space-y-3">
            <h2 id="disc-results" className="text-sm text-ink-soft">
              {t(lang, 'disc.results')}: <bdi className="font-semibold text-ink">{total}</bdi>
            </h2>
            {items.length === 0 ? (
              <EmptyState title={t(lang, 'disc.noMatch')} action={<Link href="/discover" className={button.secondary}>{t(lang, 'disc.clear')}</Link>} />
            ) : (
              <ol className={list}>
                {items.map((entry, i) => <Row key={entry.id} entry={entry} rank={i + 1} lang={lang} />)}
              </ol>
            )}
          </section>
          <p className="max-w-[70ch] text-sm leading-relaxed text-ink-soft">{t(lang, 'disc.note')}</p>
        </>
      )}
    </div>
  );
}
