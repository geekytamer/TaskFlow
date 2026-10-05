import { GameStatusPill } from './game-status';
import { StackedBarChart } from './stacked-bar-chart';
import { Figure, PageHeader, SectionTitle, button, list, panel, textLink } from './ui';
import { resultsCsvHref, summaryPdfHref } from '@/lib/brand-games';
import type { BrandGameReport } from '@/lib/brand-games-types';
import { formatDate, formatDateTime } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';

const num = (n: number, lang: Lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { maximumFractionDigits: 2 }).format(n);
const dayLabel = (date: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

function Ranked({ rows, lang, caption }: { rows: BrandGameReport['topFans']; lang: Lang; caption: string }) {
  return (
    <ol className={list} aria-label={caption}>
      {rows.map((r) => (
        <li key={r.rank} className="flex items-center gap-4 px-4 py-3 sm:px-5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${r.rank <= 3 ? 'bg-accent/10 text-accent' : 'bg-ink/[0.05] text-ink-soft'}`}><bdi>{r.rank}</bdi></span>
          <a href={`https://www.instagram.com/${encodeURIComponent(r.handle)}/`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
            <bdi dir="ltr">@{r.handle}</bdi>
          </a>
          <span className="shrink-0 text-sm"><bdi className="font-semibold">{num(r.points, lang)}</bdi> <span className="text-ink-soft">{t(lang, 'lobby.points')}</span></span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A game run for this brand: how it went, who took part most, and once it is
 * over, the winners and the files to keep. Nothing about moderation.
 */
export function BrandGameReportView({ report, lang }: { report: BrandGameReport; lang: Lang }) {
  const g = report.game;
  const pick = (en: string | null, ar: string | null) => (lang === 'ar' && ar) || en;
  const followers = g.audience === 'followers';
  const totalKeys = followers ? ['comments', 'replies', 'tags', 'likes'] : ['posts', 'views', 'shares', 'engagement'];
  const series = [
    { key: 'comments', label: t(lang, 'bg.comments') },
    { key: 'replies', label: t(lang, 'bg.replies') },
    { key: 'tags', label: t(lang, 'bg.tags') },
    { key: 'likes', label: t(lang, 'bg.likes') },
  ];
  const interactions = followers ? totalKeys.reduce((s, k) => s + (report.totals[k] ?? 0), 0) : null;
  // A game scored by hand has no posts to read: its interaction figures would be a row of zeros.
  const readsInstagram = !followers || report.posts.length > 0 || (interactions ?? 0) > 0;
  // Once final, the winners lead and the list below continues from fourth place.
  const board = report.winners ? report.topFans.slice(report.winners.length) : report.topFans;

  return (
    <div className="space-y-10">
      <PageHeader
        back={{ href: '/games', label: t(lang, 'lobby.back') }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi>{pick(g.name, g.nameAr)}</bdi><GameStatusPill status={g.status} lang={lang} /></span>}
        subtitle={<>
          <bdi>{formatDate(g.startsAt, lang)}</bdi> {t(lang, 'common.to')} <bdi>{formatDate(g.endsAt, lang)}</bdi>
          {g.updatedAt && <> · {t(lang, 'lobby.updated')} <bdi>{formatDateTime(g.updatedAt, lang)}</bdi></>}
        </>}
        actions={g.frozen ? (
          <>
            <a href={summaryPdfHref(g.slug)} download className={button.secondary}>{t(lang, 'bg.pdf')}</a>
            <a href={resultsCsvHref(g.slug)} download className={button.secondary}>{t(lang, 'bg.csv')}</a>
          </>
        ) : undefined}
      />

      <p className="max-w-2xl text-sm text-ink-soft">{t(lang, g.frozen ? 'bg.finalNote' : g.status === 'scheduled' ? 'bg.scheduledNote' : 'bg.liveNote')}</p>

      <dl className={`${panel} grid grid-cols-2 gap-6 p-5 sm:grid-cols-3 sm:p-6 ${readsInstagram ? (followers ? 'lg:grid-cols-6' : 'lg:grid-cols-5') : ''}`}>
        <Figure label={t(lang, 'bg.players')} value={<bdi>{num(report.players, lang)}</bdi>} />
        {readsInstagram && interactions !== null && <Figure label={t(lang, 'bg.interactions')} value={<bdi>{num(interactions, lang)}</bdi>} />}
        {readsInstagram && totalKeys.map((k) => <Figure key={k} label={t(lang, `bg.${k}` as Key)} value={<bdi>{num(report.totals[k] ?? 0, lang)}</bdi>} />)}
      </dl>

      {report.winners && report.winners.length > 0 && (
        <section aria-labelledby="winners-title">
          <SectionTitle id="winners-title">{t(lang, 'bg.winners')}</SectionTitle>
          {pick(g.prize, g.prizeAr) && <p className="mb-3 text-sm text-ink-soft">{t(lang, 'lobby.prize')}: <bdi className="font-medium text-ink">{pick(g.prize, g.prizeAr)}</bdi></p>}
          <Ranked rows={report.winners} lang={lang} caption={t(lang, 'bg.winners')} />
        </section>
      )}

      {followers && readsInstagram && (
        <section aria-labelledby="daily-title">
          <SectionTitle id="daily-title">{t(lang, 'bg.overTime')}</SectionTitle>
          <div className={`${panel} p-5 sm:p-6`}>
            <StackedBarChart
              lang={lang}
              title={t(lang, 'bg.overTime')}
              series={series}
              rows={report.daily.map((d) => ({ ...d, key: d.date, label: dayLabel(d.date, lang) }))}
              emptyText={t(lang, 'bg.noInteractions')}
            />
          </div>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="fans-title">
          <SectionTitle id="fans-title">{t(lang, report.winners ? 'bg.nextOnBoard' : 'bg.topFans')}</SectionTitle>
          {board.length === 0
            ? <p className="text-ink-soft">{t(lang, report.winners ? 'bg.noMore' : 'bg.noFans')}</p>
            : <Ranked rows={board} lang={lang} caption={t(lang, report.winners ? 'bg.nextOnBoard' : 'bg.topFans')} />}
        </section>

        {report.posts.length > 0 && (
          <section aria-labelledby="posts-title">
            <SectionTitle id="posts-title">{t(lang, 'bg.posts')}</SectionTitle>
            <ul className={list}>
              {report.posts.map((p) => (
                <li key={p.url} className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
                  <span className="text-sm text-ink-soft">{t(lang, p.kind === 'comment' ? 'bg.postComments' : 'bg.postLikes')}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className={textLink}>{t(lang, 'bg.openPost')}<span aria-hidden="true" className="ms-1">↗</span></a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
