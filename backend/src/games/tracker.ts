import type { DataStore } from '../data/store';
import { openToken } from '../social/crypto';
import { MetaAuthError, MetaRateLimitError, type MetaClient } from '../social/meta-client';
import { actor } from './collector';
import { gameStatus } from './games';
import type { Game, GameSource } from './games-store';
import type { LikersFetcher } from './likers-fetcher';

/**
 * Live tracking for followers games.
 *
 * Discovery: a game follows connected accounts; each new post they make during
 * the game (with the game tag, when set) becomes a comments source and a likers
 * source by itself, so collection starts the moment the post is up.
 *
 * Likers pacing: fetchers return only a window of the newest likers (often
 * 100–200), with no promise about order beyond "newest first". So instead of
 * one big fetch, the tracker reads the post's like count from Meta (cheap and
 * official) and fetches likers often enough that the likes arriving between two
 * fetches stay within half a window. Every liker then appears in some fetch,
 * and the fetch they first appear in orders them: that is what secures the
 * first N. When likes outrun the pace, the shortfall is counted as missed and
 * shown to staff, never hidden.
 */

export const PACING = {
  /** Never fetch likers more often than this, per post. */
  minIntervalMs: 60_000,
  /** Never leave a post with new likes unchecked longer than this. */
  maxIntervalMs: 20 * 60_000,
  /** Check a quiet post this often. */
  idleIntervalMs: 5 * 60_000,
  /** Aim for at most this share of a window of new likes between fetches. */
  safety: 0.5,
  /** Assumed window until a fetch shows a bigger one. */
  defaultWindow: 100,
  /** Largest window to ask for (fetchers billed per result get smaller asks). */
  maxRequest: 1000,
  /** How often to look for new posts on tracked accounts. */
  discoverEveryMs: 2 * 60_000,
} as const;

/** The key a post's likers list is stored under: its link without query, slash or case. */
export const permalinkKey = (permalink: string) => permalink.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');

const tokenOf = (store: DataStore, accountId: string) => {
  const account = store.social.getAccount(accountId);
  if (!account || account.status !== 'active' || !account.tokenSealed) return null;
  return { account, token: openToken(account.tokenSealed) };
};

const describe = (error: unknown) =>
  error instanceof MetaAuthError ? 'The account must be reconnected.'
    : error instanceof MetaRateLimitError ? 'Instagram is limiting requests; will retry.'
      : (error as Error).message.slice(0, 300);

/** New posts by the game's tracked accounts become sources. Returns how many posts were added. */
export async function discoverPosts(store: DataStore, client: MetaClient, game: Game, now = new Date()): Promise<number> {
  if (game.audience !== 'followers') return 0;
  const tag = (game.tag ?? '').toLowerCase();
  const start = new Date(game.startsAt);
  const end = Date.parse(game.endsAt);
  let added = 0;
  for (const accountId of store.games.trackedAccounts(game.id)) {
    let auth: ReturnType<typeof tokenOf>;
    try { auth = tokenOf(store, accountId); } catch { continue; }
    if (!auth) continue;
    const posts = (await client.recentMedia(auth.token, auth.account.externalId, start))
      .filter((m) => +m.timestamp < end && +m.timestamp <= now.getTime() && (!tag || m.caption.toLowerCase().includes(tag)));
    const existing = store.games.sources(game.id);
    for (const post of posts) {
      const postedAt = post.timestamp.toISOString();
      let isNew = false;
      if (!existing.some((s) => s.kind === 'post' && s.mediaId === post.id)) {
        isNew = Boolean(store.games.addSource({ gameId: game.id, kind: 'post', accountId, mediaId: post.id, permalink: post.permalink, postedAt, autoAdded: 1 })) || isNew;
      }
      const key = permalinkKey(post.permalink);
      const likers = existing.find((s) => s.kind === 'import' && s.mediaId === key);
      if (!likers) {
        const created = store.games.addSource({ gameId: game.id, kind: 'import', accountId, mediaId: key, permalink: post.permalink, metaMediaId: post.id, postedAt, autoAdded: 1 });
        if (created) store.games.updateSource(created.id, { nextLikersAt: now.toISOString() });
        isNew = Boolean(created) || isNew;
      } else if (!likers.metaMediaId) {
        // A likers list staff started by hand on this post: pacing can now read its like count.
        store.games.linkLikersSource(likers.id, accountId, post.id, postedAt);
      }
      if (isNew) added += 1;
    }
  }
  return added;
}

/** How long until the next likers fetch, from how fast likes arrived since the last one. */
export function nextInterval(newLikes: number, elapsedMs: number, window: number): number {
  if (newLikes <= 0) return PACING.idleIntervalMs;
  const perMs = newLikes / Math.max(elapsedMs, 1000);
  const target = (window * PACING.safety) / perMs;
  return Math.round(Math.min(PACING.maxIntervalMs, Math.max(PACING.minIntervalMs, target)));
}

/** How many likers to ask for: enough to reach back past the last fetch, with margin. */
export const requestSize = (newLikes: number, firstFetch: boolean) =>
  firstFetch ? PACING.maxRequest : Math.min(PACING.maxRequest, Math.max(50, Math.ceil(newLikes * 1.25) + 20));

/** One likers source, if due: check the like count, fetch when there are new likes, schedule the next. */
export async function tickLikersSource(store: DataStore, client: MetaClient, fetcher: LikersFetcher, game: Game, source: GameSource, now = new Date()): Promise<void> {
  if (source.kind !== 'import' || !source.metaMediaId || !source.accountId || !source.permalink) return;
  if (source.nextLikersAt && now.getTime() < Date.parse(source.nextLikersAt)) return;
  // One last fetch after the end catches likes from the final minutes; then stop.
  if (source.likersFetchedAt && Date.parse(source.likersFetchedAt) >= Date.parse(game.endsAt)) return;
  const nowIso = now.toISOString();
  try {
    const auth = tokenOf(store, source.accountId);
    if (!auth) throw new Error('The connected account is not active.');
    const counts = await client.mediaCounts(auth.token, source.metaMediaId);
    const firstFetch = !source.likersFetchedAt;
    const since = Date.parse(source.likersFetchedAt ?? source.postedAt ?? source.createdAt);
    const newLikes = counts.likes - (source.likeCount ?? 0);
    const window = source.likersWindow || PACING.defaultWindow;
    if (newLikes <= 0 && !firstFetch) {
      // Nothing new after the end means the list is final.
      const final = now.getTime() >= Date.parse(game.endsAt) ? { likersFetchedAt: nowIso } : {};
      store.games.updateSource(source.id, { ...final, likesCheckedAt: nowIso, nextLikersAt: new Date(now.getTime() + PACING.idleIntervalMs).toISOString(), lastError: null });
      return;
    }

    const result = await fetcher.fetch(source.permalink, requestSize(newLikes, firstFetch));
    const known = new Set(store.games.events(game.id, true).filter((e) => e.sourceId === source.id).map((e) => e.externalId));
    const idOf = (h: string) => `import:${source.id}:${h}`;
    const fresh = result.handles.filter((h) => !known.has(idOf(h)));
    const reachedKnown = fresh.length < result.handles.length;
    // Newest first: spread the new likers across the time since the last fetch, oldest earliest.
    const span = Math.max(now.getTime() - since, 1000);
    const rows = fresh.map((h, i) => ({
      externalId: idOf(h), ...actor(h), action: 'like' as const, postRef: source.mediaId,
      occurredAt: new Date(now.getTime() - Math.round(((i + 0.5) / fresh.length) * span)).toISOString(),
      textLength: 0, textHash: null,
    }));
    store.games.syncSourceEvents(game.id, source.id, rows, nowIso, false);

    // Likes we could not see: the fetch never reached likers we already had, so
    // anything between is unknown. Unlikes make this an estimate, never a count of people.
    const missed = result.complete || reachedKnown ? 0 : Math.max(0, (firstFetch ? counts.likes : newLikes) - fresh.length);
    const nextWindow = Math.max(source.likersWindow, result.handles.length);
    store.games.updateSource(source.id, {
      likeCount: counts.likes, likesCheckedAt: nowIso, likersFetchedAt: nowIso, lastCollectedAt: nowIso, lastError: null,
      likersWindow: nextWindow, likersMissed: source.likersMissed + missed,
      nextLikersAt: new Date(now.getTime() + nextInterval(newLikes, now.getTime() - since, nextWindow || window)).toISOString(),
    });
  } catch (error) {
    store.games.updateSource(source.id, { lastError: describe(error), nextLikersAt: new Date(now.getTime() + PACING.idleIntervalMs).toISOString() });
  }
}

const lastDiscovery = new Map<string, number>();

/**
 * The fast sweep (every minute): discover new posts on tracked accounts and
 * pace likers fetching, for running games and for ended games still owed their
 * final fetch.
 */
export async function trackGames(store: DataStore, client: MetaClient, fetcher: LikersFetcher | undefined, companyId: string, now = new Date()): Promise<void> {
  for (const game of store.games.list(companyId)) {
    if (game.frozenAt || game.archivedAt || game.audience !== 'followers' || !game.publishedAt) continue;
    const status = gameStatus(game, now.getTime());
    if (status === 'live' && now.getTime() - (lastDiscovery.get(game.id) ?? 0) >= PACING.discoverEveryMs) {
      lastDiscovery.set(game.id, now.getTime());
      try { await discoverPosts(store, client, game, now); } catch { /* the next sweep tries again */ }
    }
    if (!fetcher || (status !== 'live' && status !== 'ended')) continue;
    for (const source of store.games.sources(game.id)) await tickLikersSource(store, client, fetcher, game, source, now);
  }
}
