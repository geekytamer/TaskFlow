import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/** Devices that receive phone notifications. One device (endpoint) belongs to one person at a time. */

export type PushAudience = 'staff' | 'client' | 'influencer';
export interface PushSubscriptionRow {
  id: string; audience: PushAudience; principalId: string; companyId: string | null;
  endpoint: string; p256dh: string; auth: string; userAgent: string | null; createdAt: string; lastSentAt: string | null;
}

export class PushStore {
  constructor(private readonly db: Database.Database) {}

  /** Adds the device, or moves it to this person when someone else had turned it on. */
  subscribe(input: Omit<PushSubscriptionRow, 'id' | 'createdAt' | 'lastSentAt'>): PushSubscriptionRow {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO push_subscriptions (id, audience, principalId, companyId, endpoint, p256dh, auth, userAgent, createdAt, lastSentAt)
       VALUES (@id, @audience, @principalId, @companyId, @endpoint, @p256dh, @auth, @userAgent, @createdAt, NULL)
       ON CONFLICT (endpoint) DO UPDATE SET audience = excluded.audience, principalId = excluded.principalId, companyId = excluded.companyId,
         p256dh = excluded.p256dh, auth = excluded.auth, userAgent = excluded.userAgent, createdAt = excluded.createdAt, lastSentAt = NULL`,
    ).run({ ...input, id: uuid(), createdAt: now });
    return this.db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(input.endpoint) as PushSubscriptionRow;
  }

  /** Removes the device only if it is this person's. */
  unsubscribe(audience: PushAudience, principalId: string, endpoint: string): boolean {
    return this.db.prepare('DELETE FROM push_subscriptions WHERE audience = ? AND principalId = ? AND endpoint = ?').run(audience, principalId, endpoint).changes > 0;
  }

  forPrincipal(audience: PushAudience, principalId: string): PushSubscriptionRow[] {
    return this.db.prepare('SELECT * FROM push_subscriptions WHERE audience = ? AND principalId = ? ORDER BY createdAt').all(audience, principalId) as PushSubscriptionRow[];
  }

  /** Everyone of an audience with at least one device, with the earliest time they turned one on. */
  principals(audience: PushAudience): Array<{ principalId: string; since: string }> {
    return this.db.prepare('SELECT principalId, MIN(createdAt) AS since FROM push_subscriptions WHERE audience = ? GROUP BY principalId').all(audience) as Array<{ principalId: string; since: string }>;
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(id);
  }

  markSent(id: string): void {
    this.db.prepare('UPDATE push_subscriptions SET lastSentAt = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  /** Portal events already pushed (or skipped) for this person, as `event:refId`. */
  portalLogged(portalUserId: string): Set<string> {
    return new Set((this.db.prepare('SELECT event, refId FROM portal_push_log WHERE portalUserId = ?').all(portalUserId) as Array<{ event: string; refId: string }>)
      .map((r) => `${r.event}:${r.refId}`));
  }

  logPortal(portalUserId: string, items: Array<{ event: string; refId: string }>, status: 'sent' | 'skipped'): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO portal_push_log (portalUserId, event, refId, status, createdAt) VALUES (?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    this.db.transaction(() => items.forEach((i) => insert.run(portalUserId, i.event, i.refId, status, now)))();
  }
}
