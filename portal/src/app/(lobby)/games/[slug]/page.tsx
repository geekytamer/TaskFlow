import Link from 'next/link';
import { GameStatusPill } from '@/components/game-status';
import { formatDateTime } from '@/lib/format';
import { getGame, getMyStanding, type GameDetail, type MyStanding } from '@/lib/games';
import { t, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { BrandGameReportView } from '@/components/brand-game-report';
import { getHost } from '@/lib/audience';
import { getBrandGame } from '@/lib/brand-games';
import { backLink, primaryButton } from '@/components/field';

const PLATFORM: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', snapchat: 'Snapchat', x: 'X', facebook: 'Facebook', other: '' };
const ACTIONS = ['comment', 'reply', 'mention', 'like'] as const;

type Metric = GameDetail['metrics'][number];

const numberFormat = (lang: Lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { maximumFractionDigits: 2 });

/** What you do and what it is worth, one line each; weighted interactions list every action. */
function earning(m: Metric, lang: Lang): string[] {
  const n = numberFormat(lang);
  if (m.key === 'weighted_interactions') {
    const lines = ACTIONS
      .filter((a) => Number(m.params[a] ?? 0) > 0)
      .map((a) => `${t(lang, `lobby.earn.${a}`)}: ${n.format(Number(m.params[a]) * m.weight)}`);
    if (Number(m.params.diminishing ?? 1) < 1) lines.push(t(lang, 'lobby.earn.repeat'));
    if (Number(m.params.dailyCap ?? 0) > 0) lines.push(`${t(lang, 'lobby.earn.dailyCap')}: ${n.format(Number(m.params.dailyCap) * m.weight)}`);
    return lines;
  }
  const label = m.label ? m.label[lang] : m.key;
  const per = Object.entries(m.params).find(([k]) => k.startsWith('pointsPer'))?.[1];
  if (typeof per === 'number') return [`${label}: ${n.format(per * m.weight)}`];
  return [m.weight !== 1 ? `${label} ×${n.format(m.weight)}` : label];
}

function Standing({ me, lang }: { me: MyStanding; lang: Lang }) {
  const n = numberFormat(lang);
  const figures = me.stats ? [
    ['lobby.mine.posts', me.stats.posts], ['lobby.mine.views', me.stats.views], ['lobby.mine.shares', me.stats.shares],
    ['lobby.mine.engagement', me.stats.engagement], ['lobby.mine.growth', me.stats.followerGrowth],
  ] as const : [];
  return (
    <section aria-labelledby="mine-title" className="rounded-xl border border-line bg-surface p-5">
      <h2 id="mine-title" className="text-sm font-semibold">{t(lang, 'lobby.mine.title')}</h2>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {me.rank ? <><span className="text-base font-medium text-ink-soft">{t(lang, 'lobby.mine.rank')} </span><bdi>#{me.rank}</bdi></> : '—'}
        <span className="ms-2 text-base font-medium text-ink-soft"><bdi>{n.format(me.points ?? 0)}</bdi> {t(lang, 'lobby.points')}</span>
      </p>
      {!me.connected && <p className="mt-2 text-sm text-danger">{t(lang, 'lobby.mine.reconnect')}</p>}
      {figures.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {figures.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-ink-soft">{t(lang, key)}</dt>
              <dd className="font-semibold tabular-nums"><bdi>{key === 'lobby.mine.growth' && value > 0 ? '+' : ''}{n.format(value)}</bdi></dd>
            </div>
          ))}
        </dl>
      )}
      {(!me.stats || me.stats.posts === 0) && me.tag && (
        <p className="mt-3 text-sm text-ink-soft">{t(lang, 'lobby.mine.noPosts')} <bdi dir="ltr" className="font-semibold text-ink">{me.tag}</bdi></p>
      )}
    </section>
  );
}

export default async function GamePage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, lang] = await Promise.all([params, searchParams, currentLang()]);
  // A game run for this client opens as its report rather than the public board.
  if (getHost() === 'client') {
    const report = await getBrandGame(slug);
    if (report) return <BrandGameReportView report={report} lang={lang} />;
  }
  const handle = typeof query.handle === 'string' ? query.handle.trim().slice(0, 64) : '';
  const [game, me] = await Promise.all([getGame(slug, handle || undefined), getMyStanding(slug).catch(() => null)]);
  const pick = (en: string | null, ar: string | null) => (lang === 'ar' && ar) || en;
  const podium = ['bg-accent text-white', 'bg-ink text-white', 'bg-ink/80 text-white'];
  const n = numberFormat(lang);
  const you = game.you ?? null;

  return (
    <div className="space-y-10">
      <Link href="/games" className={backLink}>{t(lang, 'lobby.back')}</Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl"><bdi>{pick(game.name, game.nameAr)}</bdi></h1>
          <GameStatusPill status={game.status} lang={lang} />
        </div>
        <p className="text-sm text-ink-soft">
          {game.status === 'scheduled' ? t(lang, 'lobby.starts') : game.status === 'live' ? t(lang, 'lobby.ends') : t(lang, 'lobby.ended')}{' '}
          <bdi>{formatDateTime(game.status === 'scheduled' ? game.startsAt : game.endsAt, lang)}</bdi>
          {game.frozen && <> · {t(lang, 'lobby.final')}</>}
          {game.players > 0 && <> · <bdi>{n.format(game.players)}</bdi> {t(lang, 'lobby.players')}</>}
        </p>
        {game.audience === 'creators' && game.tag && (
          <p className="text-sm">{t(lang, 'lobby.creatorsNote')} <bdi dir="ltr" className="font-semibold">{game.tag}</bdi></p>
        )}
      </header>

      {game.playOn.length > 0 && game.status !== 'ended' && (
        <section aria-labelledby="play-title" className="space-y-3">
          <h2 id="play-title" className="text-base font-semibold">{t(lang, 'lobby.playOn')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {game.playOn.map((p) => (
              <li key={`${p.kind}:${p.url}`}>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  <span>
                    <span className="block font-medium">{t(lang, `lobby.play.${p.kind}`)}</span>
                    {p.handle && <bdi dir="ltr" className="text-sm text-ink-soft">@{p.handle}</bdi>}
                  </span>
                  <span aria-hidden="true" className="text-accent rtl:-scale-x-100">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="board-title" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="board-title" className="text-base font-semibold">{t(lang, game.frozen ? 'lobby.results' : 'lobby.board')}</h2>
            {game.status !== 'scheduled' && (
              <p className="text-xs text-ink-soft">
                {game.updatedAt ? <>{t(lang, 'lobby.updated')} <bdi>{formatDateTime(game.updatedAt, lang)}</bdi></> : game.playOn.length > 0 ? t(lang, 'lobby.notYetUpdated') : null}
              </p>
            )}
          </div>

          {game.status !== 'scheduled' && game.board.length > 0 && (
            <form method="get" className="flex flex-wrap items-end gap-2" role="search">
              <label className="min-w-[200px] flex-1 space-y-1">
                <span className="text-xs font-medium text-ink-soft">{t(lang, 'lobby.findLabel')}</span>
                <input name="handle" defaultValue={handle} dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@"
                  className="block h-11 w-full rounded-[10px] border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink" />
              </label>
              <button type="submit" className={primaryButton.replace('w-full', 'w-auto')}>{t(lang, 'lobby.findButton')}</button>
            </form>
          )}
          {handle && (
            <p role="status" className={`rounded-lg px-4 py-3 text-sm ${you ? 'bg-accent/10' : 'bg-line/60 text-ink-soft'}`}>
              {you
                ? <>{t(lang, 'lobby.youAre')} <b className="tabular-nums"><bdi>#{you.rank}</bdi></b> · <bdi dir="ltr">@{you.handle}</bdi> · <bdi>{n.format(you.points)}</bdi> {t(lang, 'lobby.points')}</>
                : t(lang, 'lobby.findNone')}
            </p>
          )}

          {game.board.length === 0 ? (
            <p className="border-y border-line py-6 text-ink-soft">{t(lang, game.status === 'scheduled' ? 'lobby.notStarted' : 'lobby.noScores')}</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {game.board.map((row) => {
                const mine = you?.handle === row.handle;
                return (
                  <li key={`${row.platform}:${row.handle}`} aria-current={mine ? 'true' : undefined}
                    className={`flex items-center gap-4 px-1 py-3 sm:px-3 ${mine ? 'bg-accent/10' : ''}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${row.rank <= 3 ? podium[row.rank - 1] : 'bg-line text-ink-soft'}`}>
                      <bdi>{row.rank}</bdi>
                    </span>
                    <span className="min-w-0 flex-1">
                      <bdi dir="ltr" className="block truncate font-medium">@{row.handle}</bdi>
                      {PLATFORM[row.platform] && <span className="text-xs text-ink-soft">{PLATFORM[row.platform]}</span>}
                    </span>
                    <span className="font-semibold tabular-nums"><bdi>{n.format(row.points)}</bdi></span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="space-y-6">
          {me?.participating && <Standing me={me} lang={lang} />}
          {pick(game.prize, game.prizeAr) && (
            <section aria-labelledby="prize-title" className="rounded-xl border border-accent/30 bg-accent/10 p-5">
              <h2 id="prize-title" className="text-sm font-semibold text-accent">{t(lang, 'lobby.prize')}</h2>
              <p className="mt-1 text-lg font-semibold"><bdi>{pick(game.prize, game.prizeAr)}</bdi></p>
            </section>
          )}
          <section aria-labelledby="earn-title">
            <h2 id="earn-title" className="mb-2 text-sm font-semibold">{t(lang, 'lobby.howToEarn')}</h2>
            <ul className="space-y-1 text-sm">
              {game.metrics.flatMap((m) => earning(m, lang).map((line) => <li key={`${m.key}:${line}`}>{line}</li>))}
            </ul>
            {game.playOn.length > 0 && <p className="mt-3 text-xs text-ink-soft">{t(lang, 'lobby.liveNote')}</p>}
          </section>
          {pick(game.rules, game.rulesAr) && (
            <section aria-labelledby="rules-title">
              <h2 id="rules-title" className="mb-2 text-sm font-semibold">{t(lang, 'lobby.rules')}</h2>
              <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{pick(game.rules, game.rulesAr)}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
