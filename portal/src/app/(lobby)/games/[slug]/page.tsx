import Link from 'next/link';
import { GameStatusPill } from '@/components/game-status';
import { formatDateTime } from '@/lib/format';
import { getGame } from '@/lib/games';
import { t, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { backLink } from '@/components/field';

const PLATFORM: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', snapchat: 'Snapchat', x: 'X', facebook: 'Facebook', other: '' };

/** One line per metric: what you do and what it is worth. */
function earning(m: { key: string; label: { en: string; ar: string } | null; weight: number; params: Record<string, number | boolean> }, lang: Lang) {
  const label = m.label ? m.label[lang] : m.key;
  const per = Object.entries(m.params).find(([k]) => k.startsWith('pointsPer'))?.[1];
  const points = typeof per === 'number' ? per * m.weight : null;
  return points !== null ? `${label}: ${points}` : m.weight !== 1 ? `${label} ×${m.weight}` : label;
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = await currentLang();
  const game = await getGame(slug);
  const pick = (en: string | null, ar: string | null) => (lang === 'ar' && ar) || en;
  const podium = ['bg-accent text-white', 'bg-ink text-white', 'bg-ink/80 text-white'];

  return (
    <div className="space-y-10">
      <Link href="/games" className={backLink}>{t(lang, 'lobby.back')}</Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 dir="auto" className="text-3xl font-semibold tracking-tight md:text-4xl">{pick(game.name, game.nameAr)}</h1>
          <GameStatusPill status={game.status} lang={lang} />
        </div>
        <p className="text-sm text-ink-soft">
          {game.status === 'scheduled' ? t(lang, 'lobby.starts') : game.status === 'live' ? t(lang, 'lobby.ends') : t(lang, 'lobby.ended')}{' '}
          <bdi>{formatDateTime(game.status === 'scheduled' ? game.startsAt : game.endsAt, lang)}</bdi>
          {game.frozen && <> · {t(lang, 'lobby.final')}</>}
        </p>
      </header>

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="board-title">
          <h2 id="board-title" className="mb-3 text-base font-semibold">{t(lang, game.frozen ? 'lobby.results' : 'lobby.board')}</h2>
          {game.board.length === 0 ? (
            <p className="border-y border-line py-6 text-ink-soft">{t(lang, game.status === 'scheduled' ? 'lobby.notStarted' : 'lobby.noScores')}</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {game.board.map((row) => (
                <li key={`${row.platform}:${row.handle}`} className="flex items-center gap-4 px-1 py-3 sm:px-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${row.rank <= 3 ? podium[row.rank - 1] : 'bg-line text-ink-soft'}`}>
                    <bdi>{row.rank}</bdi>
                  </span>
                  <span className="min-w-0 flex-1">
                    <bdi dir="ltr" className="block truncate font-medium">@{row.handle}</bdi>
                    {PLATFORM[row.platform] && <span className="text-xs text-ink-soft">{PLATFORM[row.platform]}</span>}
                  </span>
                  <span className="font-semibold tabular-nums"><bdi>{new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en').format(row.points)}</bdi></span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-6">
          {pick(game.prize, game.prizeAr) && (
            <section aria-labelledby="prize-title" className="rounded-xl border border-accent/30 bg-accent/10 p-5">
              <h2 id="prize-title" className="text-sm font-semibold text-accent">{t(lang, 'lobby.prize')}</h2>
              <p dir="auto" className="mt-1 text-lg font-semibold">{pick(game.prize, game.prizeAr)}</p>
            </section>
          )}
          <section aria-labelledby="earn-title">
            <h2 id="earn-title" className="mb-2 text-sm font-semibold">{t(lang, 'lobby.howToEarn')}</h2>
            <ul className="space-y-1 text-sm">
              {game.metrics.map((m) => <li key={m.key}>{earning(m, lang)}</li>)}
            </ul>
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
