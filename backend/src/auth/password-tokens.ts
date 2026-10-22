import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * One-time links for setting a password: the invitation a new account gets,
 * and the reset link an admin or "forgot password" sends. Only a hash of the
 * link's token is stored, so a copy of the database opens nobody's account.
 */
export type PasswordTokenPurpose = 'invite' | 'reset';

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
/** "Forgot password" pressed again within this window sends no second email. */
export const RESEND_GAP_MS = 2 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_TOKEN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS password_tokens (
    id        TEXT PRIMARY KEY,
    userId    TEXT NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    purpose   TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    usedAt    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_password_tokens_user ON password_tokens(userId);
`;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface PasswordTokenRow {
  id: string;
  userId: string;
  purpose: PasswordTokenPurpose;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export class PasswordTokenStore {
  constructor(private readonly db: Database.Database) {}

  /** A new link for this person; earlier unused links stop working. */
  issue(userId: string, purpose: PasswordTokenPurpose, now = Date.now()): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const ttl = purpose === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS;
    this.db.transaction(() => {
      this.db.prepare('UPDATE password_tokens SET usedAt = ? WHERE userId = ? AND usedAt IS NULL').run(new Date(now).toISOString(), userId);
      this.db.prepare(
        'INSERT INTO password_tokens (id, userId, tokenHash, purpose, createdAt, expiresAt, usedAt) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      ).run(uuid(), userId, hash(token), purpose, new Date(now).toISOString(), new Date(now + ttl).toISOString());
    })();
    return token;
  }

  /** The link's record if it can still be used. */
  valid(token: string, now = Date.now()): PasswordTokenRow | undefined {
    if (typeof token !== 'string' || token.length < 20) return undefined;
    const row = this.db.prepare('SELECT * FROM password_tokens WHERE tokenHash = ?').get(hash(token)) as PasswordTokenRow | undefined;
    if (!row || row.usedAt || Date.parse(row.expiresAt) <= now) return undefined;
    return row;
  }

  /** Uses the link up, along with any other open link for the same person. */
  consume(row: PasswordTokenRow, now = Date.now()) {
    this.db.prepare('UPDATE password_tokens SET usedAt = ? WHERE userId = ? AND usedAt IS NULL').run(new Date(now).toISOString(), row.userId);
  }

  /** When this person was last sent a reset link that is still open. */
  lastOpenReset(userId: string, now = Date.now()): string | undefined {
    const row = this.db.prepare(
      "SELECT createdAt FROM password_tokens WHERE userId = ? AND purpose = 'reset' AND usedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC LIMIT 1",
    ).get(userId, new Date(now).toISOString()) as { createdAt: string } | undefined;
    return row?.createdAt;
  }
}

/** A password nobody knows, for an account waiting on its invitation. */
export const unusablePassword = () => crypto.randomBytes(32).toString('hex');
