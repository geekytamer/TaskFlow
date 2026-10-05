import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { PortalSession } from '../portal/portal-store';
import { boardOf, ensureFrozen, gameStatus, lastUpdatedOf } from './games';
import type { Game } from './games-store';

/**
 * The report a brand reads about a game run for it. Everything here is an
 * allowlist: no integrity flags, exclusions, data-capture gaps, source
 * internals or staff. Excluded actors are left out of the counts as well as
 * the board, so the totals never hint that someone was removed.
 */

const ACTION_TO_TYPE = { comment: 'comments', reply: 'replies', mention: 'tags', like: 'likes' } as const;
type InteractionType = (typeof ACTION_TO_TYPE)[keyof typeof ACTION_TO_TYPE];
type Counts = Record<InteractionType, number>;
const zero = (): Counts => ({ comments: 0, replies: 0, tags: 0, likes: 0 });

const timeZone = () => process.env.PORTAL_TIME_ZONE ?? 'Asia/Muscat';
const dayOf = (iso: string | number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** A brand's game, or 404: published, not archived, in this company, run for this session's client. */
export function brandGameFor(store: DataStore, companyId: string, session: PortalSession, slug: string): Game {
  const game = store.games.bySlug(companyId, slug);
  const mine = game && session.audience === 'client' && game.clientContactId === session.contactId && game.publishedAt && !game.archivedAt;
  if (!game || !mine) throw new HttpError(404, 'Not found.');
  return ensureFrozen(store, game);
}

export function brandGames(store: DataStore, companyId: string, session: PortalSession): Game[] {
  if (session.audience !== 'client') return [];
  return store.games.forClient(companyId, session.contactId)
    .filter((g) => g.publishedAt && !g.archivedAt)
    .map((g) => ensureFrozen(store, g));
}

export function brandGameSummary(store: DataStore, game: Game) {
  return {
    slug: game.slug, name: game.name, nameAr: game.nameAr, status: gameStatus(game),
    startsAt: game.startsAt, endsAt: game.endsAt, players: boardOf(store, game).length,
  };
}

/** The game's public post links: where people commented or liked. */
function postsOf(store: DataStore, game: Game) {
  const seen = new Set<string>();
  return store.games.sources(game.id).flatMap((s) => {
    if (s.kind === 'tags' || !s.permalink || seen.has(s.permalink)) return [];
    seen.add(s.permalink);
    return [{ url: s.permalink, kind: s.kind === 'post' ? 'comment' as const : 'like' as const }];
  });
}

/** Interactions that count, per type, in total and per day of the game (in the business's time zone). */
function interactionsOf(store: DataStore, game: Game, now: number, tz: string) {
  const excluded = new Set(store.games.actorRules(game.id).map((r) => r.actorKey));
  const start = Date.parse(game.startsAt);
  const end = Math.min(Date.parse(game.endsAt), now);
  const totals = zero();
  const byDay = new Map<string, Counts>();
  if (end > start) {
    // Every day of the game so far gets a row, even a quiet one.
    for (let t = start; dayOf(t, tz) <= dayOf(end, tz); t += 24 * 60 * 60 * 1000) byDay.set(dayOf(t, tz), zero());
    byDay.set(dayOf(end, tz), byDay.get(dayOf(end, tz)) ?? zero());
  }
  for (const e of store.games.events(game.id)) {
    const at = Date.parse(e.occurredAt);
    const type = ACTION_TO_TYPE[e.action];
    if (!type || excluded.has(e.actorKey) || at < start || at >= end) continue;
    totals[type] += 1;
    const day = byDay.get(dayOf(at, tz));
    if (day) day[type] += 1;
  }
  return { totals, daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, c]) => ({ date, ...c })) };
}

export function brandGameReport(store: DataStore, game: Game, now = Date.now(), tz = timeZone()) {
  const board = boardOf(store, game);
  const topFans = board.slice(0, 10).map(({ rank, handle, points }) => ({ rank, handle, points }));
  const excluded = new Set(store.games.actorRules(game.id).map((r) => r.actorKey));
  const creators = game.audience === 'creators';
  const stats = creators ? store.games.creatorStats(game.id).filter((s) => !excluded.has(s.actorKey)) : [];
  const sum = (k: 'posts' | 'views' | 'shares' | 'engagement') => stats.reduce((n, s) => n + s[k], 0);
  const interactions = creators ? null : interactionsOf(store, game, now, tz);
  return {
    game: {
      slug: game.slug, name: game.name, nameAr: game.nameAr, rules: game.rules, rulesAr: game.rulesAr,
      prize: game.prize, prizeAr: game.prizeAr, status: gameStatus(game, now), startsAt: game.startsAt, endsAt: game.endsAt,
      audience: game.audience, tag: game.tag, updatedAt: lastUpdatedOf(store, game), frozen: Boolean(game.frozenAt),
    },
    players: board.length,
    totals: creators ? { posts: sum('posts'), views: sum('views'), shares: sum('shares'), engagement: sum('engagement') } : interactions!.totals,
    daily: creators ? [] : interactions!.daily,
    posts: creators ? [] : postsOf(store, game),
    topFans,
    winners: game.frozenAt ? topFans.slice(0, 3) : null,
  };
}
