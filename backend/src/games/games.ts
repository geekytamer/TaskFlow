import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Game } from './games-store';
import { METRICS, scoreGame, type BoardRow, type InteractionEvent, type Supply } from './metrics';

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

/** What a game's sources can supply, which decides the metrics it may use. */
export function suppliedFor(store: DataStore, game: Game): Supply[] {
  if (game.audience === 'creators') return ['creator_stats'];
  const kinds = new Set(store.games.sources(game.id).map((s) => s.kind));
  return [
    ...(kinds.has('post') ? (['comment', 'reply'] as const) : []),
    ...(kinds.has('tags') ? (['mention'] as const) : []),
    ...(kinds.has('import') ? (['like'] as const) : []),
  ];
}

/** Whether results depend on data collected from Meta (and so must be re-read before they freeze). */
export const collectsFromMeta = (store: DataStore, game: Game) =>
  game.audience === 'creators' ? store.games.participants(game.id).length > 0 : store.games.sources(game.id).some((s) => s.kind !== 'import');

/** A paced likers list (one a fetcher has served) that has not had its fetch after the end. */
export const awaitingFinalLikers = (store: DataStore, game: Game) =>
  store.games.sources(game.id).some((s) => s.kind === 'import' && s.metaMediaId && s.likersFetchedAt && Date.parse(s.likersFetchedAt) < Date.parse(game.endsAt));

/** If Meta cannot be reached after a game ends, results freeze anyway after this long, from what was collected. */
export const RECONCILE_GRACE_MS = 48 * 60 * 60 * 1000;

/** The live board, computed from awards, collected events and creator totals. Exclusions applied unless asked not to. */
function computeBoard(store: DataStore, game: Game, applyExclusions = true): BoardRow[] {
  const excluded = applyExclusions ? new Set(store.games.actorRules(game.id).map((r) => r.actorKey)) : new Set<string>();
  const start = Date.parse(game.startsAt);
  const end = Date.parse(game.endsAt);
  const events: InteractionEvent[] = store.games.events(game.id)
    .map((e) => ({ ...e, textHash: e.textHash ?? undefined, occurredAt: new Date(e.occurredAt) }))
    .filter((e) => +e.occurredAt >= start && +e.occurredAt < end);
  return scoreGame({
    metrics: store.games.metrics(game.id),
    events,
    awards: store.games.awards(game.id).map((a) => ({ ...a, createdAt: new Date(a.createdAt) })),
    stats: store.games.creatorStats(game.id).map((s) => ({ ...s, lastPostAt: s.lastPostAt ? new Date(s.lastPostAt) : null })),
    excluded,
  });
}

/**
 * Freezes an ended game's results exactly once. A game fed by Meta waits for a
 * full re-read after its end (so deleted comments do not count), up to a grace period.
 */
export function ensureFrozen(store: DataStore, game: Game, now = Date.now()): Game {
  if (game.frozenAt || gameStatus(game, now) !== 'ended') return game;
  const withinGrace = now - Date.parse(game.endsAt) < RECONCILE_GRACE_MS;
  if (withinGrace && !game.reconciledAt && collectsFromMeta(store, game)) return game;
  if (withinGrace && awaitingFinalLikers(store, game)) return game;
  const rows = computeBoard(store, game).map((r) => ({ actorKey: r.actorKey, actorHandle: r.handle, rank: r.rank, points: r.points, breakdown: r.breakdown }));
  if (store.games.freeze(game.id, rows)) {
    // Tell whoever built it, once, with the podium, so winners can be contacted.
    const podium = rows.slice(0, 3).map((r) => `${r.rank}. @${r.actorHandle} (${r.points})`).join(', ');
    store.notify({
      companyId: game.companyId, userIds: [game.createdByUserId], type: 'followup_assigned',
      title: `Game "${game.name}" ended: results are final`,
      body: podium || 'Nobody scored.',
      data: { tKey: 'notif.followupAssigned.t', name: `${game.name}: results are final` },
      link: '/games', entityType: 'game', entityId: game.id,
    });
  }
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

/** Several accounts posting the same text, or one account posting in bursts, look like bots. */
export const RING_SIZE = 3;
export const BURST = { events: 8, withinMs: 60_000 };

/**
 * Signals for staff, never applied automatically: `same_text` when an actor's
 * comment text was also posted by RING_SIZE or more accounts in total, `burst`
 * when BURST.events of their interactions fall within BURST.withinMs.
 */
export function integrityFlags(store: DataStore, game: Game): Map<string, Array<'same_text' | 'burst'>> {
  const events = store.games.events(game.id).filter((e) => e.action === 'comment' || e.action === 'reply' || e.action === 'mention');
  const byText = new Map<string, Set<string>>();
  events.forEach((e) => { if (e.textHash && e.textLength >= 3) byText.set(e.textHash, (byText.get(e.textHash) ?? new Set()).add(e.actorKey)); });
  const flags = new Map<string, Array<'same_text' | 'burst'>>();
  const flag = (actorKey: string, f: 'same_text' | 'burst') => {
    const list = flags.get(actorKey) ?? [];
    if (!list.includes(f)) list.push(f);
    flags.set(actorKey, list);
  };
  byText.forEach((actors) => { if (actors.size >= RING_SIZE) actors.forEach((a) => flag(a, 'same_text')); });
  const times = new Map<string, number[]>();
  events.forEach((e) => times.set(e.actorKey, [...(times.get(e.actorKey) ?? []), Date.parse(e.occurredAt)]));
  times.forEach((list, actorKey) => {
    const sorted = list.sort((a, b) => a - b);
    for (let i = 0; i + BURST.events - 1 < sorted.length; i += 1) {
      if (sorted[i + BURST.events - 1] - sorted[i] <= BURST.withinMs) { flag(actorKey, 'burst'); break; }
    }
  });
  return flags;
}

/** Staff view: everyone who scored, with exclusions flagged rather than hidden. */
export function staffBoard(store: DataStore, game: Game) {
  const rules = new Map(store.games.actorRules(game.id).map((r) => [r.actorKey, r]));
  const flags = integrityFlags(store, game);
  const everyone = computeBoard(store, game, false);
  // Frozen games rank from their stored results; live ones re-rank this same list
  // without the excluded actors, instead of scoring the game a second time.
  const ranked = game.frozenAt
    ? new Map(boardOf(store, game).map((r) => [r.actorKey, r.rank]))
    : new Map(everyone.filter((r) => !rules.has(r.actorKey)).map((r, i) => [r.actorKey, i + 1]));
  return everyone.map((r) => ({
    rank: ranked.get(r.actorKey) ?? null,
    platform: platformOf(r.actorKey),
    handle: r.handle,
    actorKey: r.actorKey,
    points: r.points,
    breakdown: r.breakdown,
    excluded: rules.get(r.actorKey)?.kind ?? null,
    excludedReason: rules.get(r.actorKey)?.reason ?? null,
    flags: flags.get(r.actorKey) ?? [],
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

/** When the game's data was last read from Instagram (or a likers list imported). */
export function lastUpdatedOf(store: DataStore, game: Game): string | null {
  const times = [
    ...store.games.sources(game.id).map((s) => s.lastCollectedAt),
    ...store.games.creatorStats(game.id).map((s) => s.updatedAt),
  ].filter((t): t is string => Boolean(t)).sort();
  return times[times.length - 1] ?? null;
}

/**
 * Where people play: the posts to comment on or like and the account to tag.
 * All of it is public on Instagram already; nothing about how it is read.
 */
function playOn(store: DataStore, game: Game) {
  if (game.audience === 'creators') return [];
  const seen = new Set<string>();
  return store.games.sources(game.id).flatMap((s) => {
    const username = s.accountId ? store.social.getAccount(s.accountId)?.username ?? null : null;
    const item = s.kind === 'tags' ? { kind: 'tag' as const, url: username ? `https://www.instagram.com/${username}/` : null, handle: username }
      : { kind: s.kind === 'post' ? 'comment' as const : 'like' as const, url: s.permalink, handle: username };
    const key = `${item.kind}|${item.url}`;
    if (!item.url || seen.has(key)) return [];
    seen.add(key);
    return [item];
  });
}

/** A handle's place on the full board (not only the top 100). Null when it has no points. */
export function rankOf(store: DataStore, game: Game, handleRaw: string) {
  const handle = handleRaw.trim().replace(/^@+/, '').toLowerCase();
  if (!/^[\p{L}\p{N}._-]{1,60}$/u.test(handle)) return null;
  const row = boardOf(store, game).find((r) => r.handle === handle);
  return row ? { rank: row.rank, handle: row.handle, points: row.points } : null;
}

export function publicGameDetail(store: DataStore, game: Game, options: { handle?: string } = {}) {
  const current = ensureFrozen(store, game);
  const board = boardOf(store, current);
  return {
    ...publicGameSummary(current),
    rules: current.rules,
    rulesAr: current.rulesAr,
    audience: current.audience,
    tag: current.tag,
    playOn: playOn(store, current),
    updatedAt: lastUpdatedOf(store, current),
    players: board.length,
    metrics: store.games.metrics(current.id).map((m) => ({ key: m.metricKey, label: METRICS[m.metricKey]?.label ?? null, weight: m.weight, params: m.params })),
    frozen: Boolean(current.frozenAt),
    board: board.slice(0, 100).map((r) => ({ rank: r.rank, platform: platformOf(r.actorKey), handle: r.handle, points: r.points })),
    ...(options.handle !== undefined ? { you: rankOf(store, current, options.handle) } : {}),
  };
}

export const isPubliclyListed = (game: Game) => game.visibility === 'public' && Boolean(game.publishedAt) && !game.archivedAt;
