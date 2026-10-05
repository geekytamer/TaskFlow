import Link from 'next/link';
import { GameStatusPill } from '@/components/game-status';
import { formatDate } from '@/lib/format';
import { getGames } from '@/lib/games';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { getHost } from '@/lib/audience';
import { getBrandGames } from '@/lib/brand-games';
import { EmptyState, PageHeader, RowLink, SectionTitle, list, panel } from '@/components/ui';

const ORDER = { live: 0, scheduled: 1, ended: 2 } as const;

export default async function GamesPage() {
  const lang = await currentLang();
  const host = getHost();
  const [allGames, ours] = await Promise.all([getGames(), host === 'client' ? getBrandGames().catch(() => []) : Promise.resolve([])]);
  const oursSlugs = new Set(ours.map((g) => g.slug));
  // Games run for this brand get their own section; the rest is the lobby.
  const games = allGames.filter((g) => !oursSlugs.has(g.slug)).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const name = (g: { name: string; nameAr: string | null }) => (lang === 'ar' && g.nameAr) || g.name;
  const prize = (g: { prize: string | null; prizeAr: string | null }) => (lang === 'ar' && g.prizeAr) || g.prize;

  return (
    <div className="space-y-10">
      <PageHeader title={t(lang, 'lobby.title')} subtitle={t(lang, ours.length ? 'bg.listSubtitle' : 'lobby.subtitle')} />

      {ours.length > 0 && (
        <section aria-labelledby="ours-title">
          <SectionTitle id="ours-title">{t(lang, 'bg.yourGames')}</SectionTitle>
          <ul className={list}>
            {ours.map((g) => (
              <li key={g.slug}>
                <RowLink href={`/games/${g.slug}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 truncate font-semibold"><bdi>{name(g)}</bdi></p>
                    {g.status === 'live' || g.status === 'scheduled' || g.status === 'ended' ? <GameStatusPill status={g.status} lang={lang} /> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <bdi>{formatDate(g.startsAt, lang)}</bdi> {t(lang, 'common.to')} <bdi>{formatDate(g.endsAt, lang)}</bdi> · <bdi>{g.players}</bdi> {t(lang, 'lobby.players')}
                  </p>
                </RowLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="lobby-title">
        {ours.length > 0 && <SectionTitle id="lobby-title">{t(lang, 'bg.otherGames')}</SectionTitle>}
        {games.length === 0 ? (
          <EmptyState title={t(lang, 'lobby.emptyTitle')} body={t(lang, 'lobby.emptyBody')} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {games.map((g) => (
              <li key={g.slug}>
                <Link href={`/games/${g.slug}`} className={`${panel} block h-full p-5 transition-colors hover:border-ink/30`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold tracking-tight"><bdi>{name(g)}</bdi></h3>
                    <GameStatusPill status={g.status} lang={lang} />
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    <bdi>{formatDate(g.startsAt, lang)}</bdi> {t(lang, 'common.to')} <bdi>{formatDate(g.endsAt, lang)}</bdi>
                  </p>
                  {prize(g) && (
                    <p className="mt-4 text-sm"><span className="text-ink-soft">{t(lang, 'lobby.prize')}:</span> <span className="font-medium"><bdi>{prize(g)}</bdi></span></p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
