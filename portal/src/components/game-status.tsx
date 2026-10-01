import { t, type Lang } from '@/lib/i18n';
import type { GameStatus } from '@/lib/games';

const STYLE: Record<GameStatus, string> = {
  live: 'bg-accent text-white',
  scheduled: 'bg-line text-ink-soft',
  ended: 'bg-ink text-white',
};

export function GameStatusPill({ status, lang }: { status: GameStatus; lang: Lang }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>
      {status === 'live' && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" />}
      {t(lang, `lobby.status.${status}`)}
    </span>
  );
}
