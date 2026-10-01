import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Game } from './games-store';
import { METRICS, scoreGame, type BoardRow } from './metrics';

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'snapchat', 'x', 'facebook', 'other'] as const;
export type GameStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'archived';

/** Derived from the clock, never stored (principle 13). */
export function gameStatus(game: Game, now = Date.now()): GameStatus {
  if (game.archivedAt) return 'archived';
  if (!game.publishedAt) return 'draft';
  if (now < Date.parse(game.startsAt)) return 'scheduled';
  if (now < Date.parse(game.endsAt)) return 'live';
  return 'ended';
}

/** `platform:handle` until collectors supply platform user ids (G2). */
export function actorOf(platformRaw: unknown, handleRaw: unknown): { actorKey: string; platform: string; handle: string } {
  const platform = typeof platformRaw === 'string' ? platformRaw.trim().toLowerCase() : '';
  if (!(PLATFORMS as readonly string[]).includes(platform)) throw new HttpError(400, 'Unknown platform.');
  const handle = typeof handleRaw === 'string' ? handleRaw.trim().replace(/^@+/, '').toLowerCase() : '';
  if (!/^[\p{L}\p{N}._-]{1,60}$/u.test(handle)) throw new HttpError(400, 'Enter the handle without spaces.');
  return { actorKey: `${platform}:${handle}`, platform, handle };
}

const platformOf = (actorKey: string) => actorKey.split(':')[0];

/** The live board, computed from awards (and, from G2, events). Exclusions applied unless asked not to. */
function computeBoard(store: DataStore, game: Game, applyExclusions = true): BoardRow[] {
  const excluded = applyExclusions ? new Set(store.games.actorRules(game.id).map((r) => r.actorKey)) : new Set<string>();
  return scoreGame({
    metrics: store.games.metrics(game.id),
    events: [],
    awards: store.games.awards(game.id).map((a) => ({ ...a, createdAt: new Date(a.createdAt) })),
    excluded,
  });
}

/** Freezes an ended game's results exactly once. Returns the current game record. */
export function ensureFrozen(store: DataStore, game: Game): Game {
  if (game.frozenAt || gameStatus(game) !== 'ended') return game;
  const rows = computeBoard(store, game).map((r) => ({ actorKey: r.actorKey, actorHandle: r.handle, rank: r.rank, points: r.points, breakdown: r.breakdown }));
  store.games.freeze(game.id, rows);
  return store.games.get(game.id)!;
}

/** The ranked board: frozen results once ended, otherwise computed now. */
export function boardOf(store: DataStore, game: Game): Array<{ rank: number; actorKey: string; handle: string; points: number; breakdown: Record<string, number> }> {
  const current = ensureFrozen(store, game);
  if (current.frozenAt) {
    return store.games.results(current.id).map((r) => ({ rank: r.rank, actorKey: r.actorKey, handle: r.actorHandle, points: r.points, breakdown: r.breakdown }));
  }
  return computeBoard(store, current);
}

/** Staff view: everyone who scored, with exclusions flagged rather than hidden. */
export function staffBoard(store: DataStore, game: Game) {
  const rules = new Map(store.games.actorRules(game.id).map((r) => [r.actorKey, r]));
  const ranked = new Map(boardOf(store, game).map((r) => [r.actorKey, r.rank]));
  return computeBoard(store, game, false).map((r) => ({
    rank: ranked.get(r.actorKey) ?? null,
    platform: platformOf(r.actorKey),
    handle: r.handle,
    actorKey: r.actorKey,
    points: r.points,
    breakdown: r.breakdown,
    excluded: rules.get(r.actorKey)?.kind ?? null,
    excludedReason: rules.get(r.actorKey)?.reason ?? null,
  }));
}

/** What anyone may see about a game: rules, how points are earned, the prize, and rank, handle, points. */
export function publicGameSummary(game: Game) {
  return {
    slug: game.slug,
    name: game.name,
    nameAr: game.nameAr,
    status: gameStatus(game),
    startsAt: game.startsAt,
    endsAt: game.endsAt,
    prize: game.prize,
    prizeAr: game.prizeAr,
  };
}

export function publicGameDetail(store: DataStore, game: Game) {
  const current = ensureFrozen(store, game);
  return {
    ...publicGameSummary(current),
    rules: current.rules,
    rulesAr: current.rulesAr,
    metrics: store.games.metrics(current.id).map((m) => ({ key: m.metricKey, label: METRICS[m.metricKey]?.label ?? null, weight: m.weight, params: m.params })),
    frozen: Boolean(current.frozenAt),
    board: boardOf(store, current).slice(0, 100).map((r) => ({ rank: r.rank, platform: platformOf(r.actorKey), handle: r.handle, points: r.points })),
  };
}

export const isPubliclyListed = (game: Game) => game.visibility === 'public' && Boolean(game.publishedAt) && !game.archivedAt;
