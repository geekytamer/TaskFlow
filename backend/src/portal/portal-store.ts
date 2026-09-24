import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { HttpError } from '../http';
import { hashPassword, isHashed, verifyPassword } from '../password';

export type PortalAudience = 'client' | 'influencer';
export type PortalRole = 'client_admin' | 'client_member' | 'influencer';
export type PortalUserStatus = 'invited' | 'active' | 'disabled';

export const portalAudiences: readonly PortalAudience[] = ['client', 'influencer'];

export const rolesForAudience: Readonly<Record<PortalAudience, readonly PortalRole[]>> = {
  client: ['client_admin', 'client_member'],
  influencer: ['influencer'],
};

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt ignores everything past 72 bytes, so a longer password would silently weaken. */
const MAX_PASSWORD_BYTES = 72;

const INVALID_INVITATION = 'This invitation is no longer valid.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PortalUser {
  id: string;
  companyId: string;
  audience: PortalAudience;
  contactId: string;
  email: string;
  name: string;
  role: PortalRole;
  status: PortalUserStatus;
  lastLoginAt?: string;
  createdAt: string;
}

export interface PortalSession {
  portalUserId: string;
  companyId: string;
  audience: PortalAudience;
  contactId: string;
  role: PortalRole;
  name: string;
  email: string;
}

export interface InviteInput {
  companyId: string;
  audience: PortalAudience;
  contactId: string;
  email: string;
  name: string;
  role: PortalRole;
  createdByUserId?: string;
}

interface UserRow {
  id: string;
  companyId: string;
  audience: PortalAudience;
  contactId: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: PortalRole;
  status: PortalUserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

const toUser = (row: UserRow): PortalUser => ({
  id: row.id,
  companyId: row.companyId,
  audience: row.audience,
  contactId: row.contactId,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  lastLoginAt: row.lastLoginAt ?? undefined,
  createdAt: row.createdAt,
});

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Checking a password against a real hash even when the account does not exist
// keeps sign-in time the same for known and unknown emails.
const TIMING_HASH = hashPassword('portal-timing-equaliser');

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new HttpError(400, 'That password is too long. Use at most 72 bytes.');
  }
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';

export class PortalStore {
  constructor(private readonly db: Database.Database) {}

  getUser(id: string): PortalUser | undefined {
    const row = this.db.prepare('SELECT * FROM portal_users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  }

  listUsers(companyId: string, filter: { audience?: PortalAudience; contactId?: string } = {}): PortalUser[] {
    const clauses = ['companyId = @companyId'];
    const params: Record<string, string> = { companyId };
    if (filter.audience) {
      clauses.push('audience = @audience');
      params.audience = filter.audience;
    }
    if (filter.contactId) {
      clauses.push('contactId = @contactId');
      params.contactId = filter.contactId;
    }
    const rows = this.db
      .prepare(`SELECT * FROM portal_users WHERE ${clauses.join(' AND ')} ORDER BY createdAt ASC, rowid ASC`)
      .all(params) as UserRow[];
    return rows.map(toUser);
  }

  inviteUser(input: InviteInput): { user: PortalUser; token: string } {
    const email = normalizeEmail(input.email);
    if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const name = input.name.trim();
    if (!name) throw new HttpError(400, 'Enter a name.');
    if (!rolesForAudience[input.audience].includes(input.role)) {
      throw new HttpError(400, `The ${input.role} role does not exist in the ${input.audience} portal.`);
    }
    const id = uuid();
    return this.db.transaction(() => {
      try {
        this.db
          .prepare(
            `INSERT INTO portal_users (id, companyId, audience, contactId, email, name, role, status, createdByUserId, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
          )
          .run(id, input.companyId, input.audience, input.contactId, email, name, input.role, input.createdByUserId ?? null, new Date().toISOString());
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpError(409, 'A portal user with this email already exists.');
        throw error;
      }
      return { user: this.getUser(id)!, token: this.issueInvitation(id) };
    })();
  }

  /** A fresh link for a user, replacing any unused one. Accepting it sets a new password. */
  reinvite(userId: string): { user: PortalUser; token: string } {
    const user = this.getUser(userId);
    if (!user) throw new HttpError(404, 'Portal user not found.');
    if (user.status === 'disabled') throw new HttpError(409, 'Enable this user before sending a new invitation.');
    return { user, token: this.issueInvitation(userId) };
  }

  private issueInvitation(userId: string): string {
    const token = newToken();
    const now = Date.now();
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM portal_invitations WHERE portalUserId = ? AND usedAt IS NULL').run(userId);
      this.db
        .prepare('INSERT INTO portal_invitations (id, portalUserId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), userId, hashToken(token), new Date(now + INVITATION_TTL_MS).toISOString(), new Date(now).toISOString());
    })();
    return token;
  }

  getInvitation(token: string): PortalUser | undefined {
    const row = this.db
      .prepare(
        `SELECT u.* FROM portal_invitations i JOIN portal_users u ON u.id = i.portalUserId
          WHERE i.tokenHash = ? AND i.usedAt IS NULL AND i.expiresAt > ? AND u.status != 'disabled'`,
      )
      .get(hashToken(token), new Date().toISOString()) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  }

  acceptInvitation(token: string, password: string): PortalUser {
    assertPasswordPolicy(password);
    const now = new Date().toISOString();
    return this.db.transaction(() => {
      const invitation = this.db
        .prepare(
          `SELECT i.id AS invitationId, i.portalUserId AS userId
             FROM portal_invitations i JOIN portal_users u ON u.id = i.portalUserId
            WHERE i.tokenHash = ? AND i.usedAt IS NULL AND i.expiresAt > ? AND u.status != 'disabled'`,
        )
        .get(hashToken(token), now) as { invitationId: string; userId: string } | undefined;
      if (!invitation) throw new HttpError(400, INVALID_INVITATION);
      this.db
        .prepare("UPDATE portal_users SET passwordHash = ?, status = 'active' WHERE id = ?")
        .run(hashPassword(password), invitation.userId);
      this.db.prepare('UPDATE portal_invitations SET usedAt = ? WHERE id = ?').run(now, invitation.invitationId);
      this.revokeAllSessions(invitation.userId);
      return this.getUser(invitation.userId)!;
    })();
  }

  authenticate(companyId: string, audience: PortalAudience, email: string, password: string): PortalUser | undefined {
    const row = this.db
      .prepare('SELECT * FROM portal_users WHERE companyId = ? AND audience = ? AND email = ?')
      .get(companyId, audience, normalizeEmail(email)) as UserRow | undefined;
    const stored = row?.passwordHash ?? TIMING_HASH;
    const matches = isHashed(stored) && verifyPassword(password, stored);
    if (!row || !matches || row.status !== 'active') return undefined;
    return toUser(row);
  }

  createSession(userId: string): { token: string; expiresAt: Date } {
    const token = newToken();
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_TTL_MS);
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO portal_sessions (id, portalUserId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), userId, hashToken(token), expiresAt.toISOString(), new Date(now).toISOString());
      this.db.prepare('UPDATE portal_users SET lastLoginAt = ? WHERE id = ?').run(new Date(now).toISOString(), userId);
    })();
    return { token, expiresAt };
  }

  getSession(token: string): PortalSession | undefined {
    return this.db
      .prepare(
        `SELECT u.id AS portalUserId, u.companyId, u.audience, u.contactId, u.role, u.name, u.email
           FROM portal_sessions s JOIN portal_users u ON u.id = s.portalUserId
          WHERE s.tokenHash = ? AND s.revokedAt IS NULL AND s.expiresAt > ? AND u.status = 'active'`,
      )
      .get(hashToken(token), new Date().toISOString()) as PortalSession | undefined;
  }

  revokeSession(token: string): void {
    this.db
      .prepare('UPDATE portal_sessions SET revokedAt = ? WHERE tokenHash = ? AND revokedAt IS NULL')
      .run(new Date().toISOString(), hashToken(token));
  }

  revokeAllSessions(userId: string): void {
    this.db
      .prepare('UPDATE portal_sessions SET revokedAt = ? WHERE portalUserId = ? AND revokedAt IS NULL')
      .run(new Date().toISOString(), userId);
  }

  disableUser(id: string): PortalUser | undefined {
    return this.db.transaction(() => {
      this.db.prepare("UPDATE portal_users SET status = 'disabled' WHERE id = ?").run(id);
      this.revokeAllSessions(id);
      return this.getUser(id);
    })();
  }

  /** Back to active if they ever set a password, otherwise back to invited. Old sessions stay ended. */
  enableUser(id: string): PortalUser | undefined {
    this.db
      .prepare("UPDATE portal_users SET status = CASE WHEN passwordHash IS NULL THEN 'invited' ELSE 'active' END WHERE id = ? AND status = 'disabled'")
      .run(id);
    return this.getUser(id);
  }
}
