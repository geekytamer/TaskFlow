import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { isUniqueViolation } from '../portal/common';

export type GameVisibility = 'public' | 'restricted';
export type GameAudience = 'followers' | 'creators';

export interface Game {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  nameAr: string | null;
  rules: string | null;
  rulesAr: string | null;
  prize: string | null;
  prizeAr: string | null;
  visibility: GameVisibility;
  startsAt: string;
  endsAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  frozenAt: string | null;
  /** followers: the public plays on a connected account's posts; creators: participating influencers compete. */
  audience: GameAudience;
  /** Creators games: a caption must contain this (@handle or #hashtag) for a post to count. */
  tag: string | null;
  /** Set when sources were fully re-read after the end, so removed comments no longer count. */
  reconciledAt: string | null;
  /** The brand (a client contact) this game was run for; its portal users read the report. */
  clientContactId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameMetricRow { gameId: string; metricKey: string; weight: number; params: Record<string, number | boolean> }
export interface GameAward { id: string; gameId: string; actorKey: string; actorHandle: string; points: number; reason: string; byUserId: string; createdAt: string }
export interface ActorRule { gameId: string; actorKey: string; actorHandle: string; kind: 'exclude' | 'disqualify'; reason: string; byUserId: string; createdAt: string }
export interface GameResult { gameId: string; actorKey: string; actorHandle: string; rank: number; points: number; breakdown: Record<string, number>; frozenAt: string }
export interface GameViewer { subjectType: 'user' | 'portal_user'; subjectId: string }
export interface GameSource {
  id: string; gameId: string; kind: 'post' | 'tags' | 'import'; accountId: string; mediaId: string; permalink: string | null;
  dirty: number; lastCollectedAt: string | null; lastError: string | null; createdAt: string;
  /** Likers sources: the Instagram media id, when the post is on a connected account (enables pacing). */
  metaMediaId: string | null;
  postedAt: string | null;
  autoAdded: number;
  /** The like count at the last check, and when. */
  likeCount: number | null;
  likesCheckedAt: string | null;
  likersFetchedAt: string | null;
  nextLikersAt: string | null;
  /** The largest number of likers one fetch has returned: the window pacing aims to stay inside. */
  likersWindow: number;
  /** Likes that arrived faster than fetches could see them: their likers may be missing. */
  likersMissed: number;
}
export interface GameEventRow { gameId: string; externalId: string; sourceId: string; actorKey: string; actorHandle: string; action: 'comment' | 'reply' | 'mention' | 'like'; postRef: string; occurredAt: string; textLength: number; textHash: string | null; removedAt: string | null }
export interface CreatorStat { gameId: string; contactId: string; accountId: string; actorKey: string; actorHandle: string; posts: number; views: number; shares: number; engagement: number; followerGrowth: number; lastPostAt: string | null; updatedAt: string }


/** Storage for games. Scores are never stored while a game runs; only frozen results are. */
export class GamesStore {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<Game, 'id' | 'publishedAt' | 'archivedAt' | 'frozenAt' | 'reconciledAt' | 'audience' | 'tag' | 'clientContactId' | 'createdAt' | 'updatedAt'> & Partial<Pick<Game, 'audience' | 'tag'>>): Game | undefined {
    const now = new Date().toISOString();
    const id = uuid();
    try {
      this.db.prepare(
        `INSERT INTO games (id, companyId, slug, name, nameAr, rules, rulesAr, prize, prizeAr, visibility, audience, tag, startsAt, endsAt, createdByUserId, createdAt, updatedAt)
         VALUES (@id, @companyId, @slug, @name, @nameAr, @rules, @rulesAr, @prize, @prizeAr, @visibility, @audience, @tag, @startsAt, @endsAt, @createdByUserId, @now, @now)`,
      ).run({ ...input, audience: input.audience ?? 'followers', tag: input.tag ?? null, id, now });
    } catch (e) {
      if (isUniqueViolation(e)) return undefined;
      throw e;
    }
    return this.get(id);
  }

  get(id: string): Game | undefined {
    return this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) as Game | undefined;
  }

  bySlug(companyId: string, slug: string): Game | undefined {
    return this.db.prepare('SELECT * FROM games WHERE companyId = ? AND slug = ?').get(companyId, slug) as Game | undefined;
  }

  /** Games run for this brand, newest first. Callers decide which states a reader may see. */
  forClient(companyId: string, contactId: string): Game[] {
    return this.db.prepare('SELECT * FROM games WHERE companyId = ? AND clientContactId = ? ORDER BY startsAt DESC, rowid DESC').all(companyId, contactId) as Game[];
  }

  setClient(id: string, contactId: string | null): Game | undefined {
    this.db.prepare('UPDATE games SET clientContactId = ?, updatedAt = ? WHERE id = ?').run(contactId, new Date().toISOString(), id);
    return this.get(id);
  }

  list(companyId: string): Game[] {
    return this.db.prepare('SELECT * FROM games WHERE companyId = ? ORDER BY startsAt DESC, rowid DESC').all(companyId) as Game[];
  }

  updateGame(id: string, fields: Partial<Pick<Game, 'name' | 'nameAr' | 'rules' | 'rulesAr' | 'prize' | 'prizeAr' | 'visibility' | 'startsAt' | 'endsAt' | 'publishedAt' | 'archivedAt' | 'frozenAt' | 'audience' | 'tag' | 'reconciledAt'>>): Game | undefined {
    const keys = Object.keys(fields) as Array<keyof typeof fields>;
    if (keys.length) {
      this.db.prepare(`UPDATE games SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...fields, id, updatedAt: new Date().toISOString() });
    }
    return this.get(id);
  }

  metrics(gameId: string): GameMetricRow[] {
    return (this.db.prepare('SELECT * FROM game_metrics WHERE gameId = ? ORDER BY metricKey').all(gameId) as Array<Omit<GameMetricRow, 'params'> & { params: string }>)
      .map((r) => ({ ...r, params: JSON.parse(r.params) }));
  }

  setMetrics(gameId: string, rows: Array<Omit<GameMetricRow, 'gameId'>>): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_metrics WHERE gameId = ?').run(gameId);
      const insert = this.db.prepare('INSERT INTO game_metrics (gameId, metricKey, weight, params) VALUES (?, ?, ?, ?)');
      rows.forEach((r) => insert.run(gameId, r.metricKey, r.weight, JSON.stringify(r.params)));
    })();
  }

  awards(gameId: string): GameAward[] {
    return this.db.prepare('SELECT * FROM game_awards WHERE gameId = ? ORDER BY createdAt, rowid').all(gameId) as GameAward[];
  }

  addAward(input: Omit<GameAward, 'id' | 'createdAt'>): GameAward {
    const award = { ...input, id: uuid(), createdAt: new Date().toISOString() };
    this.db.prepare(
      `INSERT INTO game_awards (id, gameId, actorKey, actorHandle, points, reason, byUserId, createdAt)
       VALUES (@id, @gameId, @actorKey, @actorHandle, @points, @reason, @byUserId, @createdAt)`,
    ).run(award);
    return award;
  }

  actorRules(gameId: string): ActorRule[] {
    return this.db.prepare('SELECT * FROM game_actor_rules WHERE gameId = ? ORDER BY createdAt').all(gameId) as ActorRule[];
  }

  setActorRule(rule: Omit<ActorRule, 'createdAt'>): void {
    this.db.prepare(
      `INSERT INTO game_actor_rules (gameId, actorKey, actorHandle, kind, reason, byUserId, createdAt)
       VALUES (@gameId, @actorKey, @actorHandle, @kind, @reason, @byUserId, @createdAt)
       ON CONFLICT (gameId, actorKey) DO UPDATE SET kind = excluded.kind, reason = excluded.reason, byUserId = excluded.byUserId, createdAt = excluded.createdAt`,
    ).run({ ...rule, createdAt: new Date().toISOString() });
  }

  removeActorRule(gameId: string, actorKey: string): boolean {
    return this.db.prepare('DELETE FROM game_actor_rules WHERE gameId = ? AND actorKey = ?').run(gameId, actorKey).changes === 1;
  }

  viewers(gameId: string): GameViewer[] {
    return this.db.prepare('SELECT subjectType, subjectId FROM game_viewers WHERE gameId = ? ORDER BY subjectType, subjectId').all(gameId) as GameViewer[];
  }

  setViewers(gameId: string, viewers: GameViewer[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_viewers WHERE gameId = ?').run(gameId);
      const insert = this.db.prepare('INSERT OR IGNORE INTO game_viewers (gameId, subjectType, subjectId) VALUES (?, ?, ?)');
      viewers.forEach((v) => insert.run(gameId, v.subjectType, v.subjectId));
    })();
  }

  isViewer(gameId: string, viewer: GameViewer): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM game_viewers WHERE gameId = ? AND subjectType = ? AND subjectId = ?').get(gameId, viewer.subjectType, viewer.subjectId));
  }

  results(gameId: string): GameResult[] {
    return (this.db.prepare('SELECT * FROM game_results WHERE gameId = ? ORDER BY rank').all(gameId) as Array<Omit<GameResult, 'breakdown'> & { breakdown: string }>)
      .map((r) => ({ ...r, breakdown: JSON.parse(r.breakdown) }));
  }

  /** Writes results once. False if the game was already frozen. */
  freeze(gameId: string, rows: Array<Omit<GameResult, 'gameId' | 'frozenAt'>>): boolean {
    const frozenAt = new Date().toISOString();
    return this.db.transaction(() => {
      const claimed = this.db.prepare('UPDATE games SET frozenAt = ?, updatedAt = ? WHERE id = ? AND frozenAt IS NULL').run(frozenAt, frozenAt, gameId).changes === 1;
      if (!claimed) return false;
      const insert = this.db.prepare(
        'INSERT INTO game_results (gameId, actorKey, actorHandle, rank, points, breakdown, frozenAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      rows.forEach((r) => insert.run(gameId, r.actorKey, r.actorHandle, r.rank, r.points, JSON.stringify(r.breakdown), frozenAt));
      return true;
    })();
  }

  unfreeze(gameId: string, endsAt: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_results WHERE gameId = ?').run(gameId);
      this.db.prepare('UPDATE games SET frozenAt = NULL, reconciledAt = NULL, endsAt = ?, updatedAt = ? WHERE id = ?').run(endsAt, new Date().toISOString(), gameId);
    })();
  }

  sources(gameId: string): GameSource[] {
    return this.db.prepare('SELECT * FROM game_sources WHERE gameId = ? ORDER BY createdAt, rowid').all(gameId) as GameSource[];
  }

  /** Undefined when the same source is already on the game. */
  addSource(input: Pick<GameSource, 'gameId' | 'kind' | 'accountId' | 'mediaId' | 'permalink'> & Partial<Pick<GameSource, 'metaMediaId' | 'postedAt' | 'autoAdded'>>): GameSource | undefined {
    const row = { metaMediaId: null, postedAt: null, autoAdded: 0, ...input, id: uuid(), createdAt: new Date().toISOString() };
    try {
      this.db.prepare(
        `INSERT INTO game_sources (id, gameId, kind, accountId, mediaId, permalink, metaMediaId, postedAt, autoAdded, createdAt)
         VALUES (@id, @gameId, @kind, @accountId, @mediaId, @permalink, @metaMediaId, @postedAt, @autoAdded, @createdAt)`,
      ).run(row);
    } catch (e) {
      if (isUniqueViolation(e)) return undefined;
      throw e;
    }
    return this.db.prepare('SELECT * FROM game_sources WHERE id = ?').get(row.id) as GameSource;
  }

  /** Removes a source and the events it brought in. */
  removeSource(gameId: string, sourceId: string): boolean {
    return this.db.transaction(() => {
      const gone = this.db.prepare('DELETE FROM game_sources WHERE gameId = ? AND id = ?').run(gameId, sourceId).changes === 1;
      if (gone) this.db.prepare('DELETE FROM game_events WHERE gameId = ? AND sourceId = ?').run(gameId, sourceId);
      return gone;
    })();
  }

  updateSource(id: string, fields: Partial<Pick<GameSource, 'dirty' | 'lastCollectedAt' | 'lastError' | 'likeCount' | 'likesCheckedAt' | 'likersFetchedAt' | 'nextLikersAt' | 'likersWindow' | 'likersMissed' | 'metaMediaId'>>): void {
    const keys = Object.keys(fields) as Array<keyof typeof fields>;
    if (keys.length) this.db.prepare(`UPDATE game_sources SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
  }

  /** A webhook for this account arrived: its sources get collected on the next pass. */
  markAccountDirty(accountId: string): number {
    return this.db.prepare('UPDATE game_sources SET dirty = 1 WHERE accountId = ?').run(accountId).changes;
  }

  /**
   * Records what one full read of a source returned: new ids are added, ids no
   * longer returned are flagged removed, ids that came back are restored.
   */
  syncSourceEvents(gameId: string, sourceId: string, events: Array<Omit<GameEventRow, 'gameId' | 'sourceId' | 'removedAt'>>, now: string, complete = true): { added: number; removed: number } {
    return this.db.transaction(() => {
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO game_events (gameId, externalId, sourceId, actorKey, actorHandle, action, postRef, occurredAt, textLength, textHash)
         VALUES (@gameId, @externalId, @sourceId, @actorKey, @actorHandle, @action, @postRef, @occurredAt, @textLength, @textHash)`,
      );
      let added = 0;
      for (const e of events) added += insert.run({ ...e, gameId, sourceId }).changes;
      const ids = JSON.stringify(events.map((e) => e.externalId));
      this.db.prepare(`UPDATE game_events SET removedAt = NULL WHERE gameId = ? AND sourceId = ? AND removedAt IS NOT NULL AND externalId IN (SELECT value FROM json_each(?))`).run(gameId, sourceId, ids);
      // A partial read cannot tell removed from not-reached, so it removes nothing.
      if (!complete) return { added, removed: 0 };
      const removed = this.db.prepare(`UPDATE game_events SET removedAt = ? WHERE gameId = ? AND sourceId = ? AND removedAt IS NULL AND externalId NOT IN (SELECT value FROM json_each(?))`).run(now, gameId, sourceId, ids).changes;
      return { added, removed };
    })();
  }

  /** Events that still count (removed ones are kept for the record but not scored). */
  events(gameId: string, includeRemoved = false): GameEventRow[] {
    return this.db.prepare(`SELECT * FROM game_events WHERE gameId = ? ${includeRemoved ? '' : 'AND removedAt IS NULL'} ORDER BY occurredAt, externalId`).all(gameId) as GameEventRow[];
  }

  /** Ties a hand-started likers list to the connected post it belongs to, so it can be paced. */
  linkLikersSource(id: string, accountId: string, metaMediaId: string, postedAt: string): void {
    this.db.prepare("UPDATE game_sources SET accountId = ?, metaMediaId = ?, postedAt = ?, nextLikersAt = COALESCE(nextLikersAt, ?) WHERE id = ? AND kind = 'import'")
      .run(accountId, metaMediaId, postedAt, new Date().toISOString(), id);
  }

  trackedAccounts(gameId: string): string[] {
    return (this.db.prepare('SELECT accountId FROM game_tracked_accounts WHERE gameId = ? ORDER BY rowid').all(gameId) as Array<{ accountId: string }>).map((r) => r.accountId);
  }

  setTrackedAccounts(gameId: string, accountIds: string[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_tracked_accounts WHERE gameId = ?').run(gameId);
      const insert = this.db.prepare('INSERT OR IGNORE INTO game_tracked_accounts (gameId, accountId) VALUES (?, ?)');
      accountIds.forEach((a) => insert.run(gameId, a));
    })();
  }

  participants(gameId: string): string[] {
    return (this.db.prepare('SELECT contactId FROM game_participants WHERE gameId = ? ORDER BY rowid').all(gameId) as Array<{ contactId: string }>).map((r) => r.contactId);
  }

  setParticipants(gameId: string, contactIds: string[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_participants WHERE gameId = ?').run(gameId);
      const keep = JSON.stringify(contactIds);
      this.db.prepare('DELETE FROM game_creator_stats WHERE gameId = ? AND contactId NOT IN (SELECT value FROM json_each(?))').run(gameId, keep);
      const insert = this.db.prepare('INSERT OR IGNORE INTO game_participants (gameId, contactId) VALUES (?, ?)');
      contactIds.forEach((c) => insert.run(gameId, c));
    })();
  }

  creatorStats(gameId: string): CreatorStat[] {
    return this.db.prepare('SELECT * FROM game_creator_stats WHERE gameId = ? ORDER BY rowid').all(gameId) as CreatorStat[];
  }

  putCreatorStat(stat: CreatorStat): void {
    this.db.prepare(
      `INSERT INTO game_creator_stats (gameId, contactId, accountId, actorKey, actorHandle, posts, views, shares, engagement, followerGrowth, lastPostAt, updatedAt)
       VALUES (@gameId, @contactId, @accountId, @actorKey, @actorHandle, @posts, @views, @shares, @engagement, @followerGrowth, @lastPostAt, @updatedAt)
       ON CONFLICT (gameId, contactId) DO UPDATE SET accountId = excluded.accountId, actorKey = excluded.actorKey, actorHandle = excluded.actorHandle,
         posts = excluded.posts, views = excluded.views, shares = excluded.shares, engagement = excluded.engagement,
         followerGrowth = excluded.followerGrowth, lastPostAt = excluded.lastPostAt, updatedAt = excluded.updatedAt`,
    ).run(stat);
  }
}
