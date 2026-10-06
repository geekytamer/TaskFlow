import type Database from 'better-sqlite3';

export interface AcademyState {
  userId: string;
  practiceCompanyId: string | null;
  /** Objective measures when the practice company was created: `missionId/objectiveId` → number. */
  baseline: Record<string, number>;
  startedAt: string | null;
  /** Until when an existing user keeps every module open. */
  graceUntil: string | null;
}

export interface Exemption { userId: string; module: string; byUserId: string; reason: string | null; createdAt: string }

/** Progress, practice companies and exemptions. Missions themselves are code (missions.ts). */
export class AcademyStore {
  constructor(private readonly db: Database.Database) {}

  /** Rows matching `sql` (which selects `COUNT(*) AS n`). Used by objective measures. */
  count(sql: string, ...params: unknown[]): number {
    const row = this.db.prepare(sql).get(...params) as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  }

  state(userId: string): AcademyState {
    const row = this.db.prepare('SELECT * FROM academy_state WHERE userId = ?').get(userId) as
      | { userId: string; practiceCompanyId: string | null; baseline: string | null; startedAt: string | null; graceUntil: string | null } | undefined;
    return row
      ? { ...row, baseline: row.baseline ? JSON.parse(row.baseline) : {} }
      : { userId, practiceCompanyId: null, baseline: {}, startedAt: null, graceUntil: null };
  }

  setPractice(userId: string, practiceCompanyId: string | null, baseline: Record<string, number>): void {
    this.db.prepare(
      `INSERT INTO academy_state (userId, practiceCompanyId, baseline, startedAt) VALUES (?, ?, ?, ?)
       ON CONFLICT (userId) DO UPDATE SET practiceCompanyId = excluded.practiceCompanyId, baseline = excluded.baseline,
         startedAt = COALESCE(academy_state.startedAt, excluded.startedAt)`,
    ).run(userId, practiceCompanyId, JSON.stringify(baseline), new Date().toISOString());
  }

  completed(userId: string): Map<string, { xp: number; completedAt: string }> {
    return new Map((this.db.prepare('SELECT missionId, xp, completedAt FROM academy_missions WHERE userId = ?').all(userId) as Array<{ missionId: string; xp: number; completedAt: string }>)
      .map((r) => [r.missionId, { xp: r.xp, completedAt: r.completedAt }]));
  }

  /** Records a finished mission once; false if it was already recorded. */
  complete(userId: string, missionId: string, xp: number): boolean {
    return this.db.prepare('INSERT OR IGNORE INTO academy_missions (userId, missionId, xp, completedAt) VALUES (?, ?, ?, ?)')
      .run(userId, missionId, xp, new Date().toISOString()).changes === 1;
  }

  reported(userId: string): Set<string> {
    return new Set((this.db.prepare('SELECT objectiveId FROM academy_reported WHERE userId = ?').all(userId) as Array<{ objectiveId: string }>).map((r) => r.objectiveId));
  }

  report(userId: string, objectiveId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO academy_reported (userId, objectiveId, reportedAt) VALUES (?, ?, ?)').run(userId, objectiveId, new Date().toISOString());
  }

  exemptions(userId: string): Exemption[] {
    return this.db.prepare('SELECT * FROM academy_exemptions WHERE userId = ? ORDER BY createdAt').all(userId) as Exemption[];
  }

  exempt(input: Omit<Exemption, 'createdAt'>): void {
    this.db.prepare(
      `INSERT INTO academy_exemptions (userId, module, byUserId, reason, createdAt) VALUES (@userId, @module, @byUserId, @reason, @createdAt)
       ON CONFLICT (userId, module) DO UPDATE SET byUserId = excluded.byUserId, reason = excluded.reason, createdAt = excluded.createdAt`,
    ).run({ ...input, createdAt: new Date().toISOString() });
  }

  removeExemption(userId: string, module: string): boolean {
    return this.db.prepare('DELETE FROM academy_exemptions WHERE userId = ? AND module = ?').run(userId, module).changes === 1;
  }

  markTraining(companyId: string, ownerUserId: string): void {
    this.db.prepare('UPDATE companies SET isTraining = 1, trainingOwnerUserId = ? WHERE id = ?').run(ownerUserId, companyId);
  }

  /** Mission completion counts per user, for the team board. */
  missionCounts(userIds: string[]): Map<string, number> {
    if (userIds.length === 0) return new Map();
    const rows = this.db.prepare(`SELECT userId, COUNT(*) AS n FROM academy_missions WHERE userId IN (SELECT value FROM json_each(?)) GROUP BY userId`)
      .all(JSON.stringify(userIds)) as Array<{ userId: string; n: number }>;
    return new Map(rows.map((r) => [r.userId, r.n]));
  }
}
