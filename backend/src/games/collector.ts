import crypto from 'node:crypto';
import type { DataStore } from '../data/store';
import { openToken } from '../social/crypto';
import { MetaAuthError, MetaRateLimitError, type MetaClient } from '../social/meta-client';
import type { ConnectedAccount } from '../social/social-store';
import { collectsFromMeta, gameStatus } from './games';
import type { Game, GameEventRow, GameSource } from './games-store';

/**
 * Games G2: reads what Meta allows per person (comments, replies, tags) and per
 * creator (post totals, follower counts) into the game's tables. Each pass is a
 * full re-read of a source, so a comment that disappeared is flagged removed and
 * stops counting. Webhooks only mark sources dirty; this is the one reader.
 */

type Row = Omit<GameEventRow, 'gameId' | 'sourceId' | 'removedAt'>;

/** Collect a running game at most this often without a webhook nudging it. */
const IDLE_EVERY_MS = 60 * 60 * 1000;

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const hashOf = (text: string) => crypto.createHash('sha256').update(normalise(text)).digest('hex').slice(0, 32);
export const actor = (username: string) => ({ actorKey: `instagram:${username.toLowerCase()}`, actorHandle: username.toLowerCase() });

const tokenOf = (account: ConnectedAccount | undefined) => {
  if (!account || account.status !== 'active' || !account.tokenSealed) throw new Error('The connected account is not active.');
  return openToken(account.tokenSealed);
};

const describe = (error: unknown) =>
  error instanceof MetaAuthError ? 'The account must be reconnected.'
    : error instanceof MetaRateLimitError ? 'Instagram is limiting requests; will retry.'
      : (error as Error).message.slice(0, 300);

async function readSource(store: DataStore, client: MetaClient, source: GameSource): Promise<{ rows: Row[]; complete: boolean }> {
  const account = store.social.getAccount(source.accountId);
  const token = tokenOf(account);
  const own = account!.username.toLowerCase();
  if (source.kind === 'post') {
    const comments = await client.mediaComments(token, source.mediaId);
    return { complete: !comments.truncated, rows: comments
      // The account answering its own post is not a player.
      .filter((c) => c.username && c.username.toLowerCase() !== own)
      .map((c) => ({
        externalId: c.id, ...actor(c.username), action: c.parentId ? 'reply' : 'comment', postRef: source.mediaId,
        occurredAt: c.timestamp.toISOString(), textLength: c.text.trim().length, textHash: hashOf(c.text),
      })) };
  }
  const tagged = await client.taggedMedia(token, account!.externalId);
  return { complete: !tagged.truncated, rows: tagged
    .filter((m) => m.username && m.username.toLowerCase() !== own)
    .map((m) => ({
      externalId: m.id, ...actor(m.username), action: 'mention' as const, postRef: m.id,
      occurredAt: m.timestamp.toISOString(), textLength: m.caption.trim().length, textHash: hashOf(m.caption),
    })) };
}

/** Followers at or before a day, else the first one after it. */
const followersOn = (snapshots: Array<{ takenOn: string; followers: number }>, day: string) =>
  [...snapshots].reverse().find((s) => s.takenOn <= day)?.followers ?? snapshots.find((s) => s.takenOn > day)?.followers;

async function collectCreators(store: DataStore, client: MetaClient, game: Game, now: Date): Promise<string[]> {
  const errors: string[] = [];
  const tag = (game.tag ?? '').toLowerCase();
  const start = new Date(game.startsAt);
  const end = new Date(game.endsAt);
  for (const contactId of store.games.participants(game.id)) {
    const account = store.social.accountsFor(game.companyId, contactId).find((a) => a.status === 'active' && a.tokenSealed);
    if (!account) continue;
    try {
      const token = tokenOf(account);
      const posts = tag
        ? (await client.recentMedia(token, account.externalId, start)).filter((m) => m.timestamp < end && m.caption.toLowerCase().includes(tag))
        : [];
      let views = 0; let shares = 0; let engagement = 0;
      for (const post of posts) {
        const f = await client.mediaInsights(token, post.id);
        views += f.views; shares += f.shares; engagement += f.likes + f.comments + f.saves;
      }
      const snapshots = store.social.snapshots(account.id);
      const endDay = (now < end ? now : end).toISOString().slice(0, 10);
      const before = followersOn(snapshots, game.startsAt.slice(0, 10));
      const after = followersOn(snapshots, endDay);
      store.games.putCreatorStat({
        gameId: game.id, contactId, accountId: account.id, ...actor(account.username),
        posts: posts.length, views, shares, engagement,
        followerGrowth: before !== undefined && after !== undefined ? after - before : 0,
        lastPostAt: posts.length ? new Date(Math.max(...posts.map((p) => +p.timestamp))).toISOString() : null,
        updatedAt: now.toISOString(),
      });
    } catch (error) {
      errors.push(`@${account.username}: ${describe(error)}`);
    }
  }
  return errors;
}

/** One game, every source re-read. Returns the errors, empty when all sources were read. */
export async function collectGame(store: DataStore, client: MetaClient, game: Game, now = new Date()): Promise<string[]> {
  if (game.audience === 'creators') {
    const errors = await collectCreators(store, client, game, now);
    if (errors.length === 0 && now.getTime() >= Date.parse(game.endsAt)) store.games.updateGame(game.id, { reconciledAt: now.toISOString() });
    return errors;
  }
  const errors: string[] = [];
  // Imported likers lists are staff's own record; only Meta-backed sources are re-read.
  for (const source of store.games.sources(game.id).filter((src) => src.kind !== 'import')) {
    // Cleared before reading, so a webhook that arrives mid-read marks it again.
    store.games.updateSource(source.id, { dirty: 0 });
    try {
      const { rows, complete } = await readSource(store, client, source);
      store.games.syncSourceEvents(game.id, source.id, rows, now.toISOString(), complete);
      store.games.updateSource(source.id, { lastCollectedAt: now.toISOString(), lastError: null });
    } catch (error) {
      const message = describe(error);
      store.games.updateSource(source.id, { dirty: 1, lastError: message });
      errors.push(message);
    }
  }
  if (errors.length === 0 && now.getTime() >= Date.parse(game.endsAt)) store.games.updateGame(game.id, { reconciledAt: now.toISOString() });
  return errors;
}

/**
 * The sweep: live games whose sources are dirty or idle for an hour, and ended
 * games still waiting for their final re-read.
 */
export async function sweepGames(store: DataStore, client: MetaClient, companyId: string, now = new Date()): Promise<void> {
  for (const game of store.games.list(companyId)) {
    if (game.frozenAt || game.archivedAt || !collectsFromMeta(store, game)) continue;
    const status = gameStatus(game, now.getTime());
    if (status === 'draft' || status === 'scheduled') continue;
    if (status === 'live') {
      const sources = store.games.sources(game.id);
      const due = game.audience === 'creators'
        ? !store.games.creatorStats(game.id).some((s) => now.getTime() - Date.parse(s.updatedAt) < IDLE_EVERY_MS)
        : sources.filter((s) => s.kind !== 'import').some((s) => s.dirty || !s.lastCollectedAt || now.getTime() - Date.parse(s.lastCollectedAt) >= IDLE_EVERY_MS);
      if (!due) continue;
    } else if (game.reconciledAt) continue;
    await collectGame(store, client, game, now);
  }
}
