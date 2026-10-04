import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { isUniqueViolation } from '../portal/common';

export type GameVisibility = 'public' | 'restricted';

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
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameMetricRow { gameId: string; metricKey: string; weight: number; params: Record<string, number | boolean> }
export interface GameAward { id: string; gameId: string; actorKey: string; actorHandle: string; points: number; reason: string; byUserId: string; createdAt: string }
export interface ActorRule { gameId: string; actorKey: string; actorHandle: string; kind: 'exclude' | 'disqualify'; reason: string; byUserId: string; createdAt: string }
export interface GameResult { gameId: string; actorKey: string; actorHandle: string; rank: number; points: number; breakdown: Record<string, number>; frozenAt: string }
export interface GameViewer { subjectType: 'user' | 'portal_user'; subjectId: string }


/** Storage for games. Scores are never stored while a game runs; only frozen results are. */
export class GamesStore {
  constructor(private readonly db: Database.Database) {}

  create(input: Omit<Game, 'id' | 'publishedAt' | 'archivedAt' | 'frozenAt' | 'createdAt' | 'updatedAt'>): Game | undefined {
    const now = new Date().toISOString();
    const id = uuid();
    try {
      this.db.prepare(
        `INSERT INTO games (id, companyId, slug, name, nameAr, rules, rulesAr, prize, prizeAr, visibility, startsAt, endsAt, createdByUserId, createdAt, updatedAt)
         VALUES (@id, @companyId, @slug, @name, @nameAr, @rules, @rulesAr, @prize, @prizeAr, @visibility, @startsAt, @endsAt, @createdByUserId, @now, @now)`,
      ).run({ ...input, id, now });
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

  list(companyId: string): Game[] {
    return this.db.prepare('SELECT * FROM games WHERE companyId = ? ORDER BY startsAt DESC, rowid DESC').all(companyId) as Game[];
  }

  updateGame(id: string, fields: Partial<Pick<Game, 'name' | 'nameAr' | 'rules' | 'rulesAr' | 'prize' | 'prizeAr' | 'visibility' | 'startsAt' | 'endsAt' | 'publishedAt' | 'archivedAt' | 'frozenAt'>>): Game | undefined {
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
      this.db.prepare('UPDATE games SET frozenAt = NULL, endsAt = ?, updatedAt = ? WHERE id = ?').run(endsAt, new Date().toISOString(), gameId);
    })();
  }
}
