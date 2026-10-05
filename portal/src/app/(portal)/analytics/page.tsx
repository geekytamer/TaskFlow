import Link from 'next/link';
import { LineChart, ShareBars } from '@/components/line-chart';
import { StackedBarChart } from '@/components/stacked-bar-chart';
import { EmptyState, Figure, PageHeader, SectionTitle, button, panel } from '@/components/ui';
import { VerifiedMark } from '@/components/verified-mark';
import { fillWeeks } from '@/lib/chart';
import { RANGES, getClientAnalytics, getInfluencerAnalytics, parseRange, type Range } from '@/lib/analytics';
import type { ClientAnalytics, InfluencerAnalytics } from '@/lib/analytics-types';
import { getAudience } from '@/lib/audience';
import { formatCompact, formatDate, formatMoney, formatPercent } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const pct = (v: number | null, lang: Lang) => (v === null ? '-' : formatPercent(v * 100, lang));
const money2 = (n: number | null, currency: string, lang: Lang) =>
  n === null ? '-' : new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 2 }).format(n);
const day = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function RangeTabs({ lang, range, extra = '' }: { lang: Lang; range: Range; extra?: string }) {
  const tab = (active: boolean) => `inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold ${active ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_20_24/0.08)]' : 'text-ink-soft hover:text-ink'}`;
  return (
    <nav aria-label={t(lang, 'an.range')} className="flex w-fit gap-1 rounded-control bg-ink/[0.05] p-1">
      {RANGES.map((r) => (
        <Link key={r} href={`/analytics?range=${r}${extra}`} aria-current={r === range ? 'page' : undefined} className={tab(r === range)}>{t(lang, `an.range.${r}` as Key)}</Link>
      ))}
    </nav>
  );
}

/** A table that keeps its first column and scrolls the rest on a phone. */
function DataTable({ head, rows }: { head: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className={`${panel} overflow-x-auto`}>
      <table className="w-full min-w-[30rem] text-sm">
        <thead className="text-ink-soft">
          <tr className="border-b border-line">
            {head.map((h, i) => <th key={h} scope="col" className={`px-4 py-3 font-medium ${i === 0 ? 'text-start' : 'text-end'}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => j === 0
              ? <th key={j} scope="row" className="px-4 py-3 text-start font-medium">{c}</th>
              : <td key={j} className="px-4 py-3 text-end">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientView({ data, lang, range, campaign }: { data: ClientAnalytics; lang: Lang; range: Range; campaign: string }) {
  const n = (v: number) => <bdi>{formatCompact(v, lang)}</bdi>;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <RangeTabs lang={lang} range={range} extra={campaign ? `&campaign=${encodeURIComponent(campaign)}` : ''} />
        {data.campaigns.length > 1 && (
          <form method="get" action="/analytics" className="flex items-end gap-2">
            <input type="hidden" name="range" value={range} />
            <div className="space-y-1.5">
              <label htmlFor="an-campaign" className="block text-sm font-medium">{t(lang, 'an.campaign')}</label>
              <select id="an-campaign" name="campaign" defaultValue={campaign} className="h-11 rounded-control border border-field bg-surface px-3 text-[15px]">
                <option value="">{t(lang, 'an.allCampaigns')}</option>
                {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="submit" className={button.secondary}>{t(lang, 'cat.apply')}</button>
          </form>
        )}
      </div>

      {!data.totals ? (
        <EmptyState title={t(lang, 'an.clientEmptyTitle')} body={t(lang, 'an.clientEmptyBody')} />
      ) : (
        <>
          <section aria-labelledby="totals-title">
            <SectionTitle id="totals-title" aside={<span className="flex items-center gap-2 text-sm text-ink-soft">{t(lang, 'social.posts').replace('{n}', String(data.totals.posts))}<VerifiedMark lang={lang} compact /></span>}>{t(lang, 'an.results')}</SectionTitle>
            <dl className={`${panel} grid grid-cols-2 gap-6 p-5 sm:grid-cols-4 sm:p-6`}>
              <Figure size="lg" label={t(lang, 'social.views')} value={n(data.totals.views)} />
              <Figure size="lg" label={t(lang, 'an.engagements')} value={n(data.totals.engagements)} hint={t(lang, 'an.engagementsHint')} />
              <Figure size="lg" label={t(lang, 'an.perView')} value={<bdi>{pct(data.totals.perView, lang)}</bdi>} hint={t(lang, 'an.perViewHint')} />
              <Figure size="lg" label={t(lang, 'an.posts')} value={<bdi>{data.totals.posts}</bdi>} />
            </dl>
          </section>

          {data.weekly.length > 0 && (
            <section aria-labelledby="weekly-title">
              <SectionTitle id="weekly-title">{t(lang, 'an.viewsByWeek')}</SectionTitle>
              <div className={`${panel} p-5 sm:p-6`}>
                <StackedBarChart lang={lang} title={t(lang, 'an.viewsByWeek')} series={[{ key: 'views', label: t(lang, 'social.views') }]}
                  rows={fillWeeks(data.weekly, { views: 0, engagements: 0 }).map((w) => ({ key: w.week, label: day(w.week, lang), views: w.views }))} emptyText={t(lang, 'an.noData')} />
              </div>
            </section>
          )}

          <section aria-labelledby="creators-title">
            <SectionTitle id="creators-title">{t(lang, 'an.byCreator')}</SectionTitle>
            {data.byCreator.length === 0 ? <p className="text-ink-soft">{t(lang, 'an.noCreators')}</p> : (
              <DataTable head={[t(lang, 'an.creator'), t(lang, 'an.posts'), t(lang, 'social.views'), t(lang, 'an.engagements'), t(lang, 'an.perView')]}
                rows={data.byCreator.map((c) => [<span key="n"><bdi>{c.name}</bdi>{c.handle && <span className="block text-xs font-normal text-ink-soft"><bdi dir="ltr">{c.handle}</bdi></span>}</span>, <bdi key="p">{c.posts}</bdi>, n(c.views), n(c.engagements), <bdi key="r">{pct(c.perView, lang)}</bdi>])} />
            )}
          </section>

          <section aria-labelledby="platforms-title">
            <SectionTitle id="platforms-title">{t(lang, 'an.byPlatform')}</SectionTitle>
            <DataTable head={[t(lang, 'cat.platform'), t(lang, 'an.posts'), t(lang, 'social.views'), t(lang, 'an.engagements'), t(lang, 'an.perView')]}
              rows={data.byPlatform.map((p) => [<bdi key="n">{p.platform}</bdi>, <bdi key="p">{p.posts}</bdi>, n(p.views), n(p.engagements), <bdi key="r">{pct(p.perView, lang)}</bdi>])} />
          </section>

          <section aria-labelledby="cost-title">
            <SectionTitle id="cost-title">{t(lang, 'an.costTitle')}</SectionTitle>
            <p className="mb-3 max-w-prose text-sm text-ink-soft">{t(lang, 'an.costNote')}</p>
            <DataTable head={[t(lang, 'an.campaign'), t(lang, 'an.invoiced'), t(lang, 'an.cpm'), t(lang, 'an.cpe')]}
              rows={data.byCampaign.flatMap((c) => (c.cost.length ? c.cost : [null]).map((cost, i) => [
                i === 0 ? <Link key="n" href={`/campaigns/${c.id}`} className="hover:underline"><bdi>{c.name}</bdi></Link> : '',
                cost ? <bdi key="i">{formatMoney(cost.invoiced, cost.currency, lang)}</bdi> : <span key="i" className="text-ink-soft">{t(lang, 'an.notInvoiced')}</span>,
                cost ? <bdi key="m">{money2(cost.perThousandViews, cost.currency, lang)}</bdi> : '-',
                cost ? <bdi key="e">{money2(cost.perEngagement, cost.currency, lang)}</bdi> : '-',
              ]))} />
          </section>
        </>
      )}
    </div>
  );
}

const MONTH = (m: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
const countryName = (code: string, lang: Lang) => { try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code; } catch { return code; } };

function InfluencerView({ data, lang, range }: { data: InfluencerAnalytics; lang: Lang; range: Range }) {
  const n = (v: number) => <bdi>{formatCompact(v, lang)}</bdi>;
  const signed = (v: number) => <bdi>{v > 0 ? '+' : ''}{formatCompact(v, lang)}</bdi>;
  const last = data.growth?.days[data.growth.days.length - 1];
  const currencies = [...new Set(data.earnings.map((e) => e.currency))];
  return (
    <div className="space-y-10">
      <RangeTabs lang={lang} range={range} />

      <section aria-labelledby="growth-title">
        <SectionTitle id="growth-title" aside={data.growth && <VerifiedMark lang={lang} compact />}>{t(lang, 'an.growth')}</SectionTitle>
        {!data.growth ? (
          <EmptyState title={t(lang, 'an.connectTitle')} body={t(lang, 'an.connectBody')} action={<Link href="/profile" className={button.secondary}>{t(lang, 'an.connectAction')}</Link>} />
        ) : !last ? (
          <p className="text-ink-soft">{t(lang, 'an.noSnapshots')}</p>
        ) : (
          <div className={`${panel} space-y-6 p-5 sm:p-6`}>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Figure label={t(lang, 'cat.followers')} value={n(last.followers)} hint={data.growth.change && signed(data.growth.change.followers)} />
              <Figure label={t(lang, 'an.reach')} value={n(last.reach)} hint={data.growth.change && signed(data.growth.change.reach)} />
              <Figure label={t(lang, 'social.views')} value={n(last.views)} hint={data.growth.change && signed(data.growth.change.views)} />
              <Figure label={t(lang, 'an.engaged')} value={n(last.engaged)} hint={data.growth.change && signed(data.growth.change.engaged)} />
            </dl>
            <p className="text-sm text-ink-soft">{t(lang, 'an.followersOverTime')}</p>
            <LineChart lang={lang} title={t(lang, 'an.followersOverTime')} points={data.growth.days.map((d) => ({ label: day(d.date, lang), value: d.followers }))} />
          </div>
        )}
      </section>

      {data.audience && (
        <section aria-labelledby="audience-title">
          <SectionTitle id="audience-title">{t(lang, 'an.audience')}</SectionTitle>
          <div className={`${panel} grid gap-8 p-5 sm:p-6 md:grid-cols-3`}>
            <div><h3 className="mb-3 text-sm font-semibold">{t(lang, 'an.countries')}</h3><ShareBars lang={lang} data={data.audience.country} labelOf={(c) => countryName(c, lang)} /></div>
            <div><h3 className="mb-3 text-sm font-semibold">{t(lang, 'an.ages')}</h3><ShareBars lang={lang} data={data.audience.age} /></div>
            <div><h3 className="mb-3 text-sm font-semibold">{t(lang, 'an.gender')}</h3><ShareBars lang={lang} data={data.audience.gender} labelOf={(g) => t(lang, g === 'F' ? 'an.gender.F' : g === 'M' ? 'an.gender.M' : 'an.gender.U')} /></div>
          </div>
        </section>
      )}

      <section aria-labelledby="posts-title">
        <SectionTitle id="posts-title">{t(lang, 'an.postResults')}</SectionTitle>
        {data.posts.length === 0 ? <p className="text-ink-soft">{t(lang, 'an.noPosts')}</p> : (
          <>
            {data.averages && (
              <dl className={`${panel} mb-4 grid grid-cols-2 gap-6 p-5 sm:grid-cols-4 sm:p-6`}>
                <Figure label={t(lang, 'an.avgViews')} value={n(data.averages.views)} />
                <Figure label={t(lang, 'an.avgLikes')} value={n(data.averages.likes)} />
                <Figure label={t(lang, 'an.avgComments')} value={n(data.averages.comments)} />
                <Figure label={t(lang, 'an.avgShares')} value={n(data.averages.shares)} />
              </dl>
            )}
            <DataTable head={[t(lang, 'an.post'), t(lang, 'social.after.24h'), t(lang, 'social.after.7d'), t(lang, 'social.after.30d')]}
              rows={data.posts.map((p) => [
                <span key="t"><bdi>{p.title}</bdi><span className="block text-xs font-normal text-ink-soft">{p.campaign && <><bdi>{p.campaign}</bdi> · </>}<bdi>{formatDate(p.publishedAt, lang)}</bdi></span></span>,
                ...(['24h', '7d', '30d'] as const).map((cp) => p.checkpoints[cp] ? <span key={cp}>{n(p.checkpoints[cp]!.views)}<span className="block text-xs text-ink-soft">{t(lang, 'social.views')}</span></span> : <span key={cp} className="text-ink-soft">-</span>),
              ])} />
          </>
        )}
      </section>

      <section aria-labelledby="earnings-title">
        <SectionTitle id="earnings-title">{t(lang, 'an.earnings')}</SectionTitle>
        {data.earnings.length === 0 ? <p className="text-ink-soft">{t(lang, 'an.noEarnings')}</p> : currencies.map((currency) => (
          <div key={currency} className={`${panel} mb-4 p-5 sm:p-6`}>
            <StackedBarChart lang={lang} title={`${t(lang, 'an.earnings')} (${currency})`}
              series={[{ key: 'paid', label: t(lang, 'pay.status.paid') }, { key: 'pending', label: t(lang, 'an.toCome') }]}
              rows={data.earnings.filter((e) => e.currency === currency).map((e) => ({ key: e.month, label: MONTH(e.month, lang), paid: e.paid, pending: e.pending }))}
              emptyText={t(lang, 'an.noEarnings')} />
            <p className="mt-2 text-xs text-ink-soft">{t(lang, 'an.amountsIn')} <bdi>{currency}</bdi></p>
          </div>
        ))}
      </section>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const audience = getAudience();
  const lang = await currentLang();
  const params = await searchParams;
  const range = parseRange(one(params.range));
  const campaign = one(params.campaign);
  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'nav.analytics')} subtitle={t(lang, audience === 'client' ? 'an.clientSubtitle' : 'an.influencerSubtitle')} />
      {audience === 'client'
        ? <ClientView data={await getClientAnalytics(range, campaign)} lang={lang} range={range} campaign={campaign} />
        : <InfluencerView data={await getInfluencerAnalytics(range)} lang={lang} range={range} />}
    </div>
  );
}
