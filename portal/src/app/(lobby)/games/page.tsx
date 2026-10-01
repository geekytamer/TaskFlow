import Link from 'next/link';
import { GameStatusPill } from '@/components/game-status';
import { formatDate } from '@/lib/format';
import { getGames } from '@/lib/games';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

const ORDER = { live: 0, scheduled: 1, ended: 2 } as const;

export default async function GamesPage() {
  const lang = await currentLang();
  const games = (await getGames()).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const name = (g: { name: string; nameAr: string | null }) => (lang === 'ar' && g.nameAr) || g.name;
  const prize = (g: { prize: string | null; prizeAr: string | null }) => (lang === 'ar' && g.prizeAr) || g.prize;

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'lobby.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'lobby.subtitle')}</p>
      </header>
      {games.length === 0 ? (
        <section className="max-w-xl border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'lobby.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'lobby.emptyBody')}</p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <li key={g.slug}>
              <Link href={`/games/${g.slug}`} className="block h-full rounded-xl border border-line bg-surface p-5 transition-colors hover:border-ink/40">
                <div className="flex items-start justify-between gap-3">
                  <h2 dir="auto" className="text-lg font-semibold tracking-tight">{name(g)}</h2>
                  <GameStatusPill status={g.status} lang={lang} />
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  <bdi>{formatDate(g.startsAt, lang)}</bdi> {lang === 'ar' ? 'إلى' : 'to'} <bdi>{formatDate(g.endsAt, lang)}</bdi>
                </p>
                {prize(g) && (
                  <p className="mt-4 text-sm"><span className="text-ink-soft">{t(lang, 'lobby.prize')}:</span> <span dir="auto" className="font-medium">{prize(g)}</span></p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
