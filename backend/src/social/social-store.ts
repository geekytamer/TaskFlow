import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Demographics } from './meta-client';

export type AccountStatus = 'active' | 'needs_reconnect' | 'revoked';

export interface ConnectedAccount {
  id: string;
  companyId: string;
  contactId: string;
  platform: 'instagram';
  externalId: string;
  username: string;
  accountType: string;
  tokenSealed: string | null;
  expiresAt: string | null;
  status: AccountStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface Snapshot {
  accountId: string;
  takenOn: string;
  followers: number;
  views: number;
  reach: number;
  engagedAccounts: number;
  demographics: Demographics | null;
}

export interface MediaResult {
  deliverableId: string;
  mediaId: string;
  checkpoint: '24h' | '7d' | '30d';
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  fetchedAt: string;
}

const STATE_LIFE_MS = 10 * 60 * 1000;

/** Connected social accounts, their daily snapshots, and post results. Never returns tokens to routes' DTOs. */
export class SocialStore {
  constructor(private readonly db: Database.Database) {}

  newState(input: { companyId: string; contactId: string; portalUserId: string }): string {
    const state = crypto.randomBytes(24).toString('base64url');
    this.db.prepare('INSERT INTO oauth_states (state, companyId, contactId, portalUserId, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(state, input.companyId, input.contactId, input.portalUserId, new Date().toISOString());
    return state;
  }

  /** Single use: the state is deleted whether or not it was still valid. */
  consumeState(state: string): { companyId: string; contactId: string; portalUserId: string } | undefined {
    const row = this.db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as
      | { companyId: string; contactId: string; portalUserId: string; createdAt: string } | undefined;
    this.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    if (!row || Date.now() - Date.parse(row.createdAt) > STATE_LIFE_MS) return undefined;
    return { companyId: row.companyId, contactId: row.contactId, portalUserId: row.portalUserId };
  }

  /** Test helper: make a state older. */
  ageState(state: string, byMs: number): void {
    const row = this.db.prepare('SELECT createdAt FROM oauth_states WHERE state = ?').get(state) as { createdAt: string } | undefined;
    if (row) this.db.prepare('UPDATE oauth_states SET createdAt = ? WHERE state = ?').run(new Date(Date.parse(row.createdAt) - byMs).toISOString(), state);
  }

  /** Connects or reconnects (same external account) for a contact. */
  upsertAccount(input: Pick<ConnectedAccount, 'companyId' | 'contactId' | 'externalId' | 'username' | 'accountType' | 'tokenSealed' | 'expiresAt'>): ConnectedAccount {
    const existing = this.db.prepare("SELECT id FROM connected_accounts WHERE platform = 'instagram' AND externalId = ?").get(input.externalId) as { id: string } | undefined;
    const id = existing?.id ?? uuid();
    this.db.prepare(
      `INSERT INTO connected_accounts (id, companyId, contactId, platform, externalId, username, accountType, tokenSealed, expiresAt, status, createdAt)
       VALUES (@id, @companyId, @contactId, 'instagram', @externalId, @username, @accountType, @tokenSealed, @expiresAt, 'active', @now)
       ON CONFLICT (id) DO UPDATE SET companyId = excluded.companyId, contactId = excluded.contactId, username = excluded.username,
         accountType = excluded.accountType, tokenSealed = excluded.tokenSealed, expiresAt = excluded.expiresAt, status = 'active', lastError = NULL`,
    ).run({ ...input, id, now: new Date().toISOString() });
    return this.getAccount(id)!;
  }

  ownerOfExternal(externalId: string): ConnectedAccount | undefined {
    return this.db.prepare("SELECT * FROM connected_accounts WHERE platform = 'instagram' AND externalId = ?").get(externalId) as ConnectedAccount | undefined;
  }

  /** The influencer disconnects: the token and the daily figures go now; post results stay with the campaign. */
  disconnect(id: string): void {
    this.db.transaction(() => {
      this.db.prepare("UPDATE connected_accounts SET status = 'revoked', tokenSealed = NULL, expiresAt = NULL WHERE id = ?").run(id);
      this.db.prepare('DELETE FROM account_snapshots WHERE accountId = ?').run(id);
    })();
  }

  getAccount(id: string): ConnectedAccount | undefined {
    return this.db.prepare('SELECT * FROM connected_accounts WHERE id = ?').get(id) as ConnectedAccount | undefined;
  }

  accountsFor(companyId: string, contactId: string): ConnectedAccount[] {
    return this.db.prepare('SELECT * FROM connected_accounts WHERE companyId = ? AND contactId = ? ORDER BY createdAt').all(companyId, contactId) as ConnectedAccount[];
  }

  activeAccounts(companyId: string): ConnectedAccount[] {
    return this.db.prepare("SELECT * FROM connected_accounts WHERE companyId = ? AND status = 'active'").all(companyId) as ConnectedAccount[];
  }

  updateAccount(id: string, fields: Partial<Pick<ConnectedAccount, 'tokenSealed' | 'expiresAt' | 'status' | 'lastSyncAt' | 'lastError'>>): void {
    const keys = Object.keys(fields) as Array<keyof typeof fields>;
    if (!keys.length) return;
    this.db.prepare(`UPDATE connected_accounts SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
  }

  /** Meta's data-deletion request: the account and every figure from it go. */
  purgeExternal(externalId: string): number {
    const ids = (this.db.prepare("SELECT id FROM connected_accounts WHERE platform = 'instagram' AND externalId = ?").all(externalId) as Array<{ id: string }>).map((r) => r.id);
    this.db.transaction(() => {
      for (const id of ids) {
        this.db.prepare('DELETE FROM account_snapshots WHERE accountId = ?').run(id);
        this.db.prepare('DELETE FROM media_results WHERE accountId = ?').run(id);
        this.db.prepare('DELETE FROM connected_accounts WHERE id = ?').run(id);
      }
    })();
    return ids.length;
  }

  hasSnapshot(accountId: string, takenOn: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM account_snapshots WHERE accountId = ? AND takenOn = ?').get(accountId, takenOn));
  }

  addSnapshot(s: Snapshot): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO account_snapshots (accountId, takenOn, followers, views, reach, engagedAccounts, demographics)
       VALUES (@accountId, @takenOn, @followers, @views, @reach, @engagedAccounts, @demographics)`,
    ).run({ ...s, demographics: s.demographics ? JSON.stringify(s.demographics) : null });
  }

  snapshots(accountId: string): Snapshot[] {
    return (this.db.prepare('SELECT * FROM account_snapshots WHERE accountId = ? ORDER BY takenOn').all(accountId) as Array<Omit<Snapshot, 'demographics'> & { demographics: string | null }>)
      .map((r) => ({ ...r, demographics: r.demographics ? JSON.parse(r.demographics) : null }));
  }

  latestSnapshot(accountId: string): Snapshot | undefined {
    const all = this.snapshots(accountId);
    return all[all.length - 1];
  }

  /** Verified figures for a contact: active accounts with at least one snapshot. */
  verifiedFor(companyId: string, contactId: string): Array<{ platform: 'instagram'; username: string; followers: number; asOf: string }> {
    return this.accountsFor(companyId, contactId)
      .filter((a) => a.status === 'active')
      .map((a) => ({ a, s: this.latestSnapshot(a.id) }))
      .filter((x): x is { a: ConnectedAccount; s: Snapshot } => Boolean(x.s))
      .map(({ a, s }) => ({ platform: 'instagram' as const, username: a.username, followers: s.followers, asOf: s.takenOn }));
  }

  /** Published deliverables in the window, by id, for the results sweep. */
  publishedDeliverableIds(companyId: string, sinceIso: string): string[] {
    return (this.db.prepare("SELECT id FROM campaign_deliverables WHERE companyId = ? AND status = 'Published' AND publishedAt >= ?").all(companyId, sinceIso) as Array<{ id: string }>).map((r) => r.id);
  }

  mediaResults(deliverableId: string): Array<MediaResult & { accountId: string }> {
    return this.db.prepare("SELECT * FROM media_results WHERE deliverableId = ? ORDER BY CASE checkpoint WHEN '24h' THEN 1 WHEN '7d' THEN 2 ELSE 3 END").all(deliverableId) as Array<MediaResult & { accountId: string }>;
  }

  addMediaResult(r: MediaResult & { accountId: string }): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO media_results (deliverableId, accountId, mediaId, checkpoint, views, likes, comments, saves, shares, fetchedAt)
       VALUES (@deliverableId, @accountId, @mediaId, @checkpoint, @views, @likes, @comments, @saves, @shares, @fetchedAt)`,
    ).run(r);
  }
}
