# Peak Portals Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff invite a client contact and an influencer contact to their own portal; each accepts, signs in on its own host and sees a branded, bilingual dashboard, with strict identity separation from the internal app.

**Architecture:** New identity tables and a `PortalStore` owned by `DataStore`. A portal API router (`/portal-api/<audience>/*`) and a staff router live in `backend/src/portal/` and are mounted by `createServer`. A separate Next app in `portal/` is the only public entry: its server calls the API over loopback and keeps the session token in an httpOnly cookie. Staff manage access from the Clients and Influencers pages, gated by a new `contacts:portal.manage` record rule.

**Tech Stack:** Express 4, better-sqlite3, express-rate-limit 8, bcryptjs, supertest and `node --test` (backend); Next 15.3.8, React 18.3, Tailwind 3.4, TypeScript, `node --test` with tsx (portal); the existing Next 15 frontend.

## Execution notes (2026-09-24)

This plan was executed on `feature/peak-portal`. Where it differs from the code, **the repository is authoritative**. What changed, and why:

1. **Migration list test.** `backend/test/api.test.js` pins every migration id, so Tasks 1 and 3 also add `083_portal_identity` and `084_portal_access_permission` there.
2. **Mount position.** `createServer` ends with a `Route not found.` catch-all. The portal and staff routers are mounted **before** it, not just before the final error handler, or every portal route answers 404.
3. **Test corrections.** The per-address throttle test allows ten more attempts after the first ten (not eleven after eight), the isolation test uses the company it created rather than `listCompanies()[0]`, and the staff test builds a second server with a `serve()` helper instead of passing `dbPath: ''`.
4. **Next.js version.** `next` is pinned to `15.5.26`, with a `postcss` devDependency of `^8.5.23` and an `overrides` entry `"postcss": "$postcss"`. The `15.3.8` line the internal frontend uses carries a critical group of advisories (middleware bypass, SSRF, image-optimizer RCE); `npm audit` on the portal reports zero. Upgrading the internal frontend is a separate task.
5. **Dev servers.** `next dev` for both hosts must not share `.next`, so `next.config.mjs` reads `PORTAL_DIST_DIR` and the dev scripts use `.next-client` and `.next-influencer` (git-ignored).
6. **No middleware.** The plan's `src/middleware.ts`, `src/lib/route-audience.ts` and `app/client|influencer` folders were removed. In production (`next start -H 127.0.0.1`) Next treated the middleware's rewrite as an external request to `localhost`, proxied it to itself, and looped into a 500; dev mode hid it. Audience separation is now `requireAudience()` in `src/lib/guard.ts` for audience-only pages (none exist in Phase 1), one `app/(portal)` group serving `/`, and the backend's own audience check on every call. Unknown paths and the old folder names return 404. Portal tests are 7, not 10.
7. **Design changes from the anti-slop review.** Cool neutral canvas (`#f3f4f6`) instead of a warm paper tone; one emerald accent token (`#0b6e52`); a `--field` token (`#7c8490`) so input borders reach 3:1; no decorative accent bars; the account details are divided rows, not a boxed card; `min-h-[100dvh]`; the email is isolated with `<bdi dir="ltr">` so it reads correctly in Arabic; label and value baselines aligned. The portal stays light-only because uploaded company logos are usually drawn for light backgrounds.
8. **i18n.** The unused `pick()` helper was dropped, and the dictionary test also rejects em and en dashes in visible strings.
9. **Frontend.** The permission check is a shared hook, `useCanManagePortal`, used by both pages.
10. **Not verified.** Real email delivery through Resend, nginx and pm2 on a server, and `Secure` cookies over real HTTPS (the `Set-Cookie` flags were checked with curl against `next start`).

## Global Constraints

- Migrations continue after `082_company_disabled_modules`: `083_portal_identity`, `084_portal_access_permission`.
- Portal API prefix is `/portal-api/<audience>/*`, audience is `client` or `influencer`; a session's audience must equal the route's audience, otherwise 401.
- `portal_users.email` is unique per company and audience, stored lowercase.
- Passwords: bcrypt through `backend/src/password.ts`, minimum 10 characters, at most 72 bytes.
- Invitation tokens and session tokens: 32 random bytes, base64url, stored only as SHA-256 hex; invitations expire after 7 days and are single use; sessions last 7 days.
- Login and invitation acceptance are rate limited per address (20 per 15 minutes) and per audience and email (8 per 15 minutes), enforced only when `NODE_ENV=production`, using the existing trusted-proxy handling.
- Sign-in failure text never reveals whether the email exists.
- Portal API responses carry `Cache-Control: no-store` and never include ids other than what the DTO lists.
- The portal app keeps the token in an httpOnly, `SameSite=Lax` cookie (`Secure` in production) and rejects state-changing requests without a same-origin `Origin`.
- One portal deployment serves one company: `PORTAL_COMPANY_ID`. Client host port 9003, influencer host port 9004, chosen by `PORTAL_AUDIENCE`.
- English and Arabic from the first release, Arabic rendered right to left. No dark mode in this phase.
- Only a user holding `contacts:portal.manage` (Admin and Manager by default) may invite, list, re-invite, disable or enable portal users.
- Backend tests: `cd backend && npm test`. Never edit `route-permissions.ts` or `gate-matrix.csv` by hand; the new routes live outside `server.ts` so the gate extractor does not see them.

## File Structure

Backend (create):
- `backend/src/portal/portal-store.ts` — users, invitations, sessions. No HTTP.
- `backend/src/portal/dto.ts` — the only shapes the portal API returns.
- `backend/src/portal/routes.ts` — `createPortalRouter`: public and session routes.
- `backend/src/portal/portal-email.ts` — invitation email rendering and sending.
- `backend/src/portal/staff-routes.ts` — `createPortalStaffRouter`: invite, list, re-invite, disable, enable.
- `backend/test/portal-store.test.js`, `portal-routes.test.js`, `portal-isolation.test.js`, `portal-staff.test.js`, `portal-email.test.js`.

Backend (modify): `backend/src/data/store.ts`, `backend/src/permissions/record-rules.ts`, `backend/src/email.ts`, `backend/src/server.ts`.

Portal app (create, all under `portal/`): `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `.env.example`, `src/middleware.ts`, `src/app/{layout,not-found,globals}`, `src/app/login/page.tsx`, `src/app/accept/[token]/page.tsx`, `src/app/client/{layout,page}.tsx`, `src/app/influencer/{layout,page}.tsx`, `src/app/api/session/{login,accept-invite,logout}/route.ts`, `src/app/api/lang/route.ts`, `src/lib/{audience,route-audience,origin,i18n,session,session-route,backend,portal}.ts`, `src/components/{field,login-form,accept-form,brand-mark,portal-shell,dashboard,language-switch,sign-out-button}.tsx`, and `*.test.ts` beside the pure libs.

Internal frontend: create `frontend/src/services/portalAccessService.ts`, `frontend/src/modules/portal-access/components/portal-access-panel.tsx`; modify `frontend/src/modules/clients/components/clients-page.tsx`, `frontend/src/modules/influencers/components/influencer-edit-sheet.tsx`.

Deploy (create): `deploy/portal/ecosystem.portal.cjs`, `deploy/portal/nginx-portal.conf.template`, `deploy/portal/README.md`.

---

### Task 1: Portal identity storage

**Files:**
- Create: `backend/src/portal/portal-store.ts`
- Modify: `backend/src/data/store.ts` (import, `portal` field, constructor, migration `083`, `reset()`)
- Test: `backend/test/portal-store.test.js`

**Interfaces:**
- Produces (used by Tasks 2 and 3):
  - `type PortalAudience = 'client' | 'influencer'`, `type PortalRole = 'client_admin' | 'client_member' | 'influencer'`, `type PortalUserStatus = 'invited' | 'active' | 'disabled'`
  - `const portalAudiences: readonly PortalAudience[]`, `const rolesForAudience`
  - `interface PortalUser { id; companyId; audience; contactId; email; name; role; status; lastLoginAt?: string; createdAt: string }`
  - `interface PortalSession { portalUserId; companyId; audience; contactId; role; name; email }`
  - `class PortalStore` with `getUser(id)`, `listUsers(companyId, {audience?, contactId?})`, `inviteUser(input): {user, token}`, `reinvite(userId): {user, token}`, `getInvitation(token): PortalUser | undefined`, `acceptInvitation(token, password): PortalUser`, `authenticate(companyId, audience, email, password): PortalUser | undefined`, `createSession(userId): {token, expiresAt: Date}`, `getSession(token): PortalSession | undefined`, `revokeSession(token)`, `revokeAllSessions(userId)`, `disableUser(id)`, `enableUser(id)`
  - `DataStore.portal: PortalStore`

- [ ] **Step 1: Write the failing test**

Create `backend/test/portal-store.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');

const { DataStore } = require('../dist/data/store');
const { INVITATION_TTL_MS, SESSION_TTL_MS } = require('../dist/portal/portal-store');
const { makeTmpDir } = require('./helpers/tmp');

const PASSWORD = 'correct horse battery';

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-store-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  return { store, portal: store.portal, dbPath };
};

const invite = (portal, overrides = {}) =>
  portal.inviteUser({
    companyId: 'c1', audience: 'client', contactId: 'contact-1',
    email: 'Ada@Acme.test', name: 'Ada', role: 'client_admin', ...overrides,
  });

const activeUser = (portal, overrides) => {
  const { token } = invite(portal, overrides);
  return portal.acceptInvitation(token, PASSWORD);
};

const status = (code) => (error) => error.status === code;

test('migration 083 creates the portal identity tables', () => {
  const { store, dbPath } = build();
  assert.ok(store.getAppliedMigrationIds().includes('083_portal_identity'));
  const raw = new Database(dbPath, { readonly: true });
  const tables = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'portal_%' ORDER BY name")
    .all().map((row) => row.name);
  assert.deepEqual(tables, ['portal_invitations', 'portal_sessions', 'portal_users']);
});

test('an invited user is stored lowercase, invited, and holds no password', () => {
  const { portal } = build();
  const { user, token } = invite(portal);
  assert.equal(user.email, 'ada@acme.test');
  assert.equal(user.status, 'invited');
  assert.ok(token.length >= 40, 'a long random token');
  assert.equal(portal.authenticate('c1', 'client', 'ada@acme.test', PASSWORD), undefined, 'cannot sign in before accepting');
});

test('invitations refuse duplicates, bad emails, and roles from the other audience', () => {
  const { portal } = build();
  invite(portal);
  assert.throws(() => invite(portal, { email: 'ADA@acme.test' }), status(409));
  assert.doesNotThrow(() => invite(portal, { audience: 'influencer', role: 'influencer' }), 'same email, other audience');
  assert.doesNotThrow(() => invite(portal, { companyId: 'c2' }), 'same email, other company');
  assert.throws(() => invite(portal, { email: 'not-an-email' }), status(400));
  assert.throws(() => invite(portal, { email: 'x@y.test', role: 'influencer' }), status(400));
  assert.throws(() => invite(portal, { email: 'z@y.test', audience: 'influencer', role: 'client_admin' }), status(400));
});

test('an invitation works once, and only until it expires', () => {
  const { portal, dbPath } = build();
  const first = invite(portal);
  assert.equal(portal.getInvitation(first.token).email, 'ada@acme.test');
  const user = portal.acceptInvitation(first.token, PASSWORD);
  assert.equal(user.status, 'active');
  assert.equal(portal.getInvitation(first.token), undefined);
  assert.throws(() => portal.acceptInvitation(first.token, PASSWORD), status(400));

  const second = invite(portal, { email: 'bo@acme.test', name: 'Bo' });
  new Database(dbPath).prepare('UPDATE portal_invitations SET expiresAt = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal(portal.getInvitation(second.token), undefined);
  assert.throws(() => portal.acceptInvitation(second.token, PASSWORD), status(400));
  assert.ok(INVITATION_TTL_MS === 7 * 24 * 60 * 60 * 1000);
});

test('a weak password is refused and does not spend the invitation', () => {
  const { portal } = build();
  const { token } = invite(portal);
  assert.throws(() => portal.acceptInvitation(token, 'short'), status(400));
  assert.throws(() => portal.acceptInvitation(token, 'x'.repeat(73)), status(400));
  assert.equal(portal.acceptInvitation(token, PASSWORD).status, 'active');
});

test('sign in needs the right company, audience, email and password, and an active account', () => {
  const { portal } = build();
  const user = activeUser(portal);
  assert.equal(portal.authenticate('c1', 'client', 'ADA@acme.test', PASSWORD).id, user.id);
  assert.equal(portal.authenticate('c1', 'client', 'ada@acme.test', 'wrong password!!'), undefined);
  assert.equal(portal.authenticate('c1', 'client', 'nobody@acme.test', PASSWORD), undefined);
  assert.equal(portal.authenticate('c1', 'influencer', 'ada@acme.test', PASSWORD), undefined);
  assert.equal(portal.authenticate('c2', 'client', 'ada@acme.test', PASSWORD), undefined);
  portal.disableUser(user.id);
  assert.equal(portal.authenticate('c1', 'client', 'ada@acme.test', PASSWORD), undefined);
});

test('sessions carry the identity, expire, and can be revoked', () => {
  const { portal, dbPath } = build();
  const user = activeUser(portal);
  const { token, expiresAt } = portal.createSession(user.id);
  assert.ok(Math.abs(expiresAt.getTime() - Date.now() - SESSION_TTL_MS) < 5000);
  assert.deepEqual(portal.getSession(token), {
    portalUserId: user.id, companyId: 'c1', audience: 'client', contactId: 'contact-1',
    role: 'client_admin', name: 'Ada', email: 'ada@acme.test',
  });
  assert.ok(portal.getUser(user.id).lastLoginAt, 'sign-in time is recorded');

  portal.revokeSession(token);
  assert.equal(portal.getSession(token), undefined);

  const another = portal.createSession(user.id).token;
  new Database(dbPath).prepare('UPDATE portal_sessions SET expiresAt = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal(portal.getSession(another), undefined);
  assert.equal(portal.getSession('not-a-token'), undefined);
});

test('disabling ends every session at once, and enabling does not bring them back', () => {
  const { portal } = build();
  const user = activeUser(portal);
  const { token } = portal.createSession(user.id);
  assert.equal(portal.disableUser(user.id).status, 'disabled');
  assert.equal(portal.getSession(token), undefined);
  assert.equal(portal.enableUser(user.id).status, 'active');
  assert.equal(portal.getSession(token), undefined);
  assert.ok(portal.authenticate('c1', 'client', 'ada@acme.test', PASSWORD));

  const never = invite(portal, { email: 'new@acme.test' }).user;
  portal.disableUser(never.id);
  assert.equal(portal.enableUser(never.id).status, 'invited', 'a user who never accepted returns to invited');
});

test('a re-invitation replaces the link, and accepting it ends old sessions and the old password', () => {
  const { portal } = build();
  const user = activeUser(portal);
  const { token: oldSession } = portal.createSession(user.id);

  const first = portal.reinvite(user.id);
  const second = portal.reinvite(user.id);
  assert.equal(portal.getInvitation(first.token), undefined, 'the earlier link no longer works');
  assert.ok(portal.getSession(oldSession), 'nothing changes until the link is used');

  portal.acceptInvitation(second.token, 'a brand new password');
  assert.equal(portal.getSession(oldSession), undefined);
  assert.equal(portal.authenticate('c1', 'client', 'ada@acme.test', PASSWORD), undefined);
  assert.ok(portal.authenticate('c1', 'client', 'ada@acme.test', 'a brand new password'));

  const disabled = portal.disableUser(user.id);
  assert.throws(() => portal.reinvite(disabled.id), status(409));
  assert.throws(() => portal.reinvite('missing'), status(404));
});

test('tokens and passwords are never stored in the clear', () => {
  const { portal, dbPath } = build();
  const { token } = invite(portal);
  const user = portal.acceptInvitation(token, PASSWORD);
  const session = portal.createSession(user.id).token;
  const raw = new Database(dbPath, { readonly: true });
  const dump = JSON.stringify(['portal_users', 'portal_invitations', 'portal_sessions'].map((t) => raw.prepare(`SELECT * FROM ${t}`).all()));
  for (const secret of [token, session, PASSWORD]) assert.equal(dump.includes(secret), false);
});

test('listing filters by audience and contact, inside one company', () => {
  const { portal } = build();
  invite(portal);
  invite(portal, { email: 'bo@acme.test', name: 'Bo', role: 'client_member' });
  invite(portal, { email: 'cy@other.test', name: 'Cy', contactId: 'contact-2' });
  invite(portal, { email: 'inf@x.test', name: 'Inf', audience: 'influencer', role: 'influencer', contactId: 'contact-3' });
  invite(portal, { companyId: 'c2', email: 'far@x.test', name: 'Far' });

  assert.equal(portal.listUsers('c1').length, 4);
  assert.deepEqual(portal.listUsers('c1', { audience: 'client', contactId: 'contact-1' }).map((u) => u.name), ['Ada', 'Bo']);
  assert.deepEqual(portal.listUsers('c1', { audience: 'influencer' }).map((u) => u.name), ['Inf']);
  assert.deepEqual(portal.listUsers('c2').map((u) => u.name), ['Far']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-store.test.js 2>&1 | tail -15`
Expected: FAIL — `Cannot find module '../dist/portal/portal-store'`.

- [ ] **Step 3: Write the store**

Create `backend/src/portal/portal-store.ts`:

```ts
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
```

- [ ] **Step 4: Wire it into `DataStore`**

In `backend/src/data/store.ts`:

Add the import after the `company-modules` import line (`import { normalizeDisabledModules, RECORD_ENTITY_MODULES } from '../permissions/company-modules';`):

```ts
import { PortalStore } from '../portal/portal-store';
```

Add the field under `private db: Database.Database;`:

```ts
  /** Identity for the external portals: their own users, invitations and sessions. */
  readonly portal: PortalStore;
```

In the constructor, directly after `this.applyMigrations();`:

```ts
    this.portal = new PortalStore(this.db);
```

Append this migration after the `082_company_disabled_modules` entry (before the closing `];` of the migrations array):

```ts
      {
        // Identity for the external portals. Portal users are a separate
        // identity space from `users`, with their own session table, so a
        // portal token can never authenticate an internal route or the reverse.
        id: '083_portal_identity',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS portal_users (
              id              TEXT PRIMARY KEY,
              companyId       TEXT NOT NULL,
              audience        TEXT NOT NULL,
              contactId       TEXT NOT NULL,
              email           TEXT NOT NULL,
              name            TEXT NOT NULL,
              passwordHash    TEXT,
              role            TEXT NOT NULL,
              status          TEXT NOT NULL,
              lastLoginAt     TEXT,
              createdByUserId TEXT,
              createdAt       TEXT NOT NULL,
              UNIQUE (companyId, audience, email),
              CHECK (audience IN ('client', 'influencer')),
              CHECK (status IN ('invited', 'active', 'disabled')),
              CHECK (
                (audience = 'client' AND role IN ('client_admin', 'client_member'))
                OR (audience = 'influencer' AND role = 'influencer')
              )
            );
            CREATE INDEX IF NOT EXISTS idx_portal_users_contact ON portal_users (companyId, contactId);
            CREATE TABLE IF NOT EXISTS portal_invitations (
              id           TEXT PRIMARY KEY,
              portalUserId TEXT NOT NULL,
              tokenHash    TEXT NOT NULL UNIQUE,
              expiresAt    TEXT NOT NULL,
              usedAt       TEXT,
              createdAt    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_portal_invitations_user ON portal_invitations (portalUserId);
            CREATE TABLE IF NOT EXISTS portal_sessions (
              id           TEXT PRIMARY KEY,
              portalUserId TEXT NOT NULL,
              tokenHash    TEXT NOT NULL UNIQUE,
              expiresAt    TEXT NOT NULL,
              revokedAt    TEXT,
              createdAt    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions (portalUserId);
          `);
        },
      },
```

In `reset()`, add these three lines at the top of the `DELETE` list, right after `DELETE FROM tokens;`:

```sql
        DELETE FROM portal_sessions;
        DELETE FROM portal_invitations;
        DELETE FROM portal_users;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-store.test.js 2>&1 | tail -20`
Expected: `# pass 11`, `# fail 0`.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && npm test 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/portal/portal-store.ts backend/src/data/store.ts backend/test/portal-store.test.js
git commit -m "feat(portal): store portal users, invitations and sessions

Portal identity gets its own tables and a PortalStore, separate from the
internal users and tokens, so a portal token can never open an internal route.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Portal API

**Files:**
- Create: `backend/src/portal/dto.ts`, `backend/src/portal/routes.ts`
- Modify: `backend/src/server.ts` (option, imports, mount)
- Test: `backend/test/portal-routes.test.js`, `backend/test/portal-isolation.test.js`

**Interfaces:**
- Consumes: `PortalStore`, `portalAudiences`, `PortalAudience`, `PortalSession` from Task 1.
- Produces: `createPortalRouter(options: PortalRouterOptions): Router`; `PortalBranding`; routes `GET /:audience/branding`, `GET /:audience/invitations/:token`, `POST /:audience/auth/accept-invite`, `POST /:audience/auth/login`, `POST /:audience/auth/logout`, `GET /:audience/me`; `CreateServerOptions.portalCompanyId?: string`.

- [ ] **Step 1: Write the failing router tests**

Create `backend/test/portal-routes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

const { DataStore } = require('../dist/data/store');
const { createPortalRouter } = require('../dist/portal/routes');
const { makeTmpDir } = require('./helpers/tmp');

const COMPANY = 'c1';
const PASSWORD = 'correct horse battery';
const quiet = { error() {} };

const build = ({ enforceRateLimits = false, getBranding } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-routes-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const app = express();
  app.use(express.json());
  app.use('/portal-api', createPortalRouter({
    portal: store.portal,
    companyId: COMPANY,
    getBranding: getBranding ?? (() => ({ name: 'Peak Media', logoUrl: undefined })),
    getSubjectName: (contactId) => (contactId === 'contact-1' ? 'Acme Foods' : undefined),
    enforceRateLimits,
    logger: quiet,
  }));
  return { app, portal: store.portal };
};

const activeUser = (portal, overrides = {}) => {
  const { token } = portal.inviteUser({
    companyId: COMPANY, audience: 'client', contactId: 'contact-1',
    email: 'ada@acme.test', name: 'Ada', role: 'client_admin', ...overrides,
  });
  return portal.acceptInvitation(token, PASSWORD);
};

const login = (app, audience, body) => request(app).post(`/portal-api/${audience}/auth/login`).send(body);
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

test('branding is public for both audiences and unknown audiences do not exist', async () => {
  const { app } = build();
  const client = await request(app).get('/portal-api/client/branding');
  assert.equal(client.status, 200);
  assert.deepEqual(client.body, { name: 'Peak Media', logoUrl: null, audience: 'client' });
  assert.equal((await request(app).get('/portal-api/influencer/branding')).body.audience, 'influencer');
  assert.equal((await request(app).get('/portal-api/admin/branding')).status, 404);
  assert.equal(client.headers['cache-control'], 'no-store');
});

test('signing in returns a session, and me describes it without leaking ids', async () => {
  const { app, portal } = build();
  activeUser(portal);

  const res = await login(app, 'client', { email: 'ADA@acme.test', password: PASSWORD });
  assert.equal(res.status, 200);
  assert.ok(res.body.token && res.body.expiresAt);

  const me = await request(app).get('/portal-api/client/me').set(bearer(res.body.token));
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, {
    user: { name: 'Ada', email: 'ada@acme.test', audience: 'client', role: 'client_admin' },
    subject: { name: 'Acme Foods' },
    company: { name: 'Peak Media', logoUrl: null },
  });
  assert.doesNotMatch(JSON.stringify(me.body), /contact-1|"id"|companyId|c1/);
});

test('a failed sign-in says the same thing whether or not the email exists', async () => {
  const { app, portal } = build();
  activeUser(portal);
  const wrongPassword = await login(app, 'client', { email: 'ada@acme.test', password: 'not the password' });
  const unknownEmail = await login(app, 'client', { email: 'nobody@acme.test', password: 'not the password' });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.equal((await login(app, 'client', { email: 'ada@acme.test' })).status, 400);
  assert.equal((await login(app, 'client', 'nope')).status, 400);
});

test('a session only opens its own audience', async () => {
  const { app, portal } = build();
  activeUser(portal);
  activeUser(portal, { audience: 'influencer', role: 'influencer', contactId: 'contact-9', email: 'inf@x.test', name: 'Inf' });
  const clientToken = (await login(app, 'client', { email: 'ada@acme.test', password: PASSWORD })).body.token;
  const influencerToken = (await login(app, 'influencer', { email: 'inf@x.test', password: PASSWORD })).body.token;

  assert.equal((await request(app).get('/portal-api/influencer/me').set(bearer(clientToken))).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(influencerToken))).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(clientToken))).status, 200);
  assert.equal((await request(app).get('/portal-api/client/me')).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set({ Authorization: 'Bearer nonsense' })).status, 401);
  assert.equal((await request(app).get('/portal-api/client/me').set({ Authorization: clientToken })).status, 401, 'no Bearer prefix');
});

test('users of another company cannot sign in to this portal', async () => {
  const { app, portal } = build();
  activeUser(portal, { companyId: 'other-company' });
  assert.equal((await login(app, 'client', { email: 'ada@acme.test', password: PASSWORD })).status, 401);
});

test('signing out ends the session', async () => {
  const { app, portal } = build();
  activeUser(portal);
  const { token } = (await login(app, 'client', { email: 'ada@acme.test', password: PASSWORD })).body;
  assert.equal((await request(app).post('/portal-api/client/auth/logout').set(bearer(token))).status, 200);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(token))).status, 401);
  assert.equal((await request(app).post('/portal-api/client/auth/logout')).status, 401);
});

test('an invitation can be looked up, accepted once, and only in its own portal', async () => {
  const { app, portal } = build();
  const { token } = portal.inviteUser({
    companyId: COMPANY, audience: 'client', contactId: 'contact-1', email: 'new@acme.test', name: 'Nia', role: 'client_admin',
  });

  const lookup = await request(app).get(`/portal-api/client/invitations/${token}`);
  assert.equal(lookup.status, 200);
  assert.deepEqual(lookup.body, { name: 'Nia', email: 'new@acme.test' });
  assert.equal((await request(app).get(`/portal-api/influencer/invitations/${token}`)).status, 404, 'wrong audience');
  assert.equal((await request(app).get('/portal-api/client/invitations/not-a-real-token')).status, 404);

  const wrongPortal = await request(app).post('/portal-api/influencer/auth/accept-invite').send({ token, password: PASSWORD });
  assert.equal(wrongPortal.status, 400);

  const weak = await request(app).post('/portal-api/client/auth/accept-invite').send({ token, password: 'short' });
  assert.equal(weak.status, 400);
  assert.match(weak.body.message, /at least 10/);

  const accepted = await request(app).post('/portal-api/client/auth/accept-invite').send({ token, password: PASSWORD });
  assert.equal(accepted.status, 200);
  assert.equal((await request(app).get('/portal-api/client/me').set(bearer(accepted.body.token))).body.user.name, 'Nia');

  const again = await request(app).post('/portal-api/client/auth/accept-invite').send({ token, password: PASSWORD });
  assert.equal(again.status, 400);
  assert.equal((await request(app).get(`/portal-api/client/invitations/${token}`)).status, 404);
});

test('an unexpected failure returns a plain message, never a stack', async () => {
  const { app } = build({ getBranding: () => { throw new Error('secret internals at /srv/app.js:12'); } });
  const res = await request(app).get('/portal-api/client/branding');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { message: 'Something went wrong.' });
});

test('sign-in is throttled per email and per address when enforcement is on', async () => {
  const { app } = build({ enforceRateLimits: true });
  for (let i = 0; i < 8; i += 1) {
    assert.equal((await login(app, 'client', { email: 'ada@acme.test', password: 'wrong wrong wrong' })).status, 401);
  }
  assert.equal((await login(app, 'client', { email: 'ada@acme.test', password: 'wrong wrong wrong' })).status, 429, 'ninth attempt on one email');
  assert.equal((await login(app, 'influencer', { email: 'ada@acme.test', password: 'wrong wrong wrong' })).status, 401, 'other audience has its own budget');

  // Eight of the twenty per-address attempts are already spent above.
  for (let i = 0; i < 11; i += 1) {
    assert.equal((await login(app, 'client', { email: `try${i}@x.test`, password: 'wrong wrong wrong' })).status, 401);
  }
  assert.equal((await login(app, 'client', { email: 'last@x.test', password: 'wrong wrong wrong' })).status, 429, 'twenty-first attempt from one address');
});
```

- [ ] **Step 2: Write the failing isolation test**

Create `backend/test/portal-isolation.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The portal is a second identity space. These tests hold the line between it
 * and the internal app, in both directions, on the real server.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const build = ({ portalCompanyId } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-isolation-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = store.createUser({
    name: 'Sam Staff', email: 'sam@peak.test', password: 'x', role: 'Admin',
    companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Admin' }],
  });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: portalCompanyId === undefined ? company.id : portalCompanyId || undefined,
  }).listen(0);
  server.unref();

  const portalToken = (audience, email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: `contact-${audience}`, email, name: email,
      role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    return request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD }).then((r) => r.body.token);
  };
  return { server, store, company, staffToken: store.issueToken(staff.id), portalToken };
};

test('an internal token cannot open a portal route', async () => {
  const { server, staffToken } = build();
  for (const audience of ['client', 'influencer']) {
    assert.equal((await request(server).get(`/portal-api/${audience}/me`).set('Authorization', `Bearer ${staffToken}`)).status, 401);
  }
});

test('a portal token cannot open any internal route', async () => {
  const { server, store, company, portalToken } = build();
  const token = await portalToken('client', 'ada@acme.test');
  assert.equal(store.getUserByToken(token), undefined, 'the internal store does not know portal tokens');
  const auth = { Authorization: `Bearer ${token}` };
  for (const url of ['/auth/me', `/companies/${company.id}/contacts`, `/companies/${company.id}/invoices`, '/companies']) {
    assert.equal((await request(server).get(url).set(auth)).status, 401, url);
  }
});

test('a client session cannot open the influencer portal and the reverse', async () => {
  const { server, portalToken } = build();
  const client = await portalToken('client', 'ada@acme.test');
  const influencer = await portalToken('influencer', 'inf@x.test');
  assert.equal((await request(server).get('/portal-api/influencer/me').set('Authorization', `Bearer ${client}`)).status, 401);
  assert.equal((await request(server).get('/portal-api/client/me').set('Authorization', `Bearer ${influencer}`)).status, 401);
});

test('disabling a user ends their session on the very next request', async () => {
  const { server, store, portalToken } = build();
  const token = await portalToken('client', 'ada@acme.test');
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await request(server).get('/portal-api/client/me').set(auth)).status, 200);
  store.portal.disableUser(store.portal.listUsers(store.listCompanies()[0].id)[0].id);
  assert.equal((await request(server).get('/portal-api/client/me').set(auth)).status, 401);
});

test('the portal API does not exist unless a company is configured', async () => {
  const { server } = build({ portalCompanyId: '' });
  assert.equal((await request(server).get('/portal-api/client/branding')).status, 404);
});

test('the portal API serves branding from the configured company', async () => {
  const { server } = build();
  const res = await request(server).get('/portal-api/client/branding');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Peak Media');
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-routes.test.js test/portal-isolation.test.js 2>&1 | tail -12`
Expected: FAIL — `Cannot find module '../dist/portal/routes'`.

- [ ] **Step 4: Write the DTOs**

Create `backend/src/portal/dto.ts`:

```ts
import type { PortalAudience, PortalSession } from './portal-store';

export interface PortalBranding {
  name: string;
  logoUrl?: string;
}

/** Everything a portal response may say about the session. No ids leave the server. */
export const toMeDto = (
  session: PortalSession,
  subjectName: string | undefined,
  branding: PortalBranding | undefined,
) => ({
  user: { name: session.name, email: session.email, audience: session.audience, role: session.role },
  subject: { name: subjectName ?? session.name },
  company: branding ? { name: branding.name, logoUrl: branding.logoUrl ?? null } : null,
});

export const toBrandingDto = (branding: PortalBranding, audience: PortalAudience) => ({
  name: branding.name,
  logoUrl: branding.logoUrl ?? null,
  audience,
});
```

- [ ] **Step 5: Write the router**

Create `backend/src/portal/routes.ts`:

```ts
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError } from '../http';
import { asRecord, requiredString } from '../validation';
import { toBrandingDto, toMeDto, type PortalBranding } from './dto';
import { portalAudiences, type PortalAudience, type PortalSession, type PortalStore } from './portal-store';

interface PortalRequest extends Request {
  portal?: PortalSession;
  portalToken?: string;
}

export interface PortalRouterOptions {
  portal: PortalStore;
  /** The one company this portal deployment serves. */
  companyId: string;
  getBranding: () => PortalBranding | undefined;
  /** Display name of the contact a user is bound to: the client organisation or the influencer. */
  getSubjectName: (contactId: string) => string | undefined;
  /** Throttle sign-in and invitation acceptance. */
  enforceRateLimits?: boolean;
  logger?: { error: (...args: unknown[]) => void };
}

const bearerToken = (req: Request) => {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

const audienceOf = (req: Request) => req.params.audience as PortalAudience;

/** A password is not trimmed like other strings, so only reject a missing or empty one. */
const rawPassword = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, 'password is required.');
  return value;
};

export function createPortalRouter(options: PortalRouterOptions): Router {
  const { portal, companyId } = options;
  const router = Router();

  const skip = () => !options.enforceRateLimits;
  const message = { message: 'Too many attempts. Please try again in a few minutes.' };
  const byAddress = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip, message,
  });
  const byEmail = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, skip, message,
    keyGenerator: (req) => `${audienceOf(req)}:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()}`,
  });

  const requireSession = (req: PortalRequest, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const session = token ? portal.getSession(token) : undefined;
    if (!session || session.audience !== audienceOf(req) || session.companyId !== companyId) {
      return next(new HttpError(401, 'Unauthorized'));
    }
    req.portal = session;
    req.portalToken = token;
    return next();
  };

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.param('audience', (_req, _res, next, value: string) => {
    if ((portalAudiences as readonly string[]).includes(value)) return next();
    return next(new HttpError(404, 'Not found.'));
  });

  router.get('/:audience/branding', (req, res) => {
    const branding = options.getBranding();
    if (!branding) throw new HttpError(404, 'Not found.');
    res.json(toBrandingDto(branding, audienceOf(req)));
  });

  router.get('/:audience/invitations/:token', byAddress, (req, res) => {
    const invited = portal.getInvitation(req.params.token);
    if (!invited || invited.audience !== audienceOf(req) || invited.companyId !== companyId) {
      throw new HttpError(404, 'This invitation is no longer valid.');
    }
    res.json({ name: invited.name, email: invited.email });
  });

  router.post('/:audience/auth/accept-invite', byAddress, (req, res) => {
    const body = asRecord(req.body, 'body');
    const token = requiredString(body.token, 'token', { min: 10 });
    const password = rawPassword(body.password);
    const invited = portal.getInvitation(token);
    if (!invited || invited.audience !== audienceOf(req) || invited.companyId !== companyId) {
      throw new HttpError(400, 'This invitation is no longer valid.');
    }
    const user = portal.acceptInvitation(token, password);
    const session = portal.createSession(user.id);
    res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  router.post('/:audience/auth/login', byAddress, byEmail, (req, res) => {
    const body = asRecord(req.body, 'body');
    const email = requiredString(body.email, 'email', { min: 3 });
    const password = rawPassword(body.password);
    const user = portal.authenticate(companyId, audienceOf(req), email, password);
    if (!user) throw new HttpError(401, 'Invalid email or password.');
    const session = portal.createSession(user.id);
    res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  router.post('/:audience/auth/logout', requireSession, (req: PortalRequest, res) => {
    portal.revokeSession(req.portalToken!);
    res.json({ success: true });
  });

  router.get('/:audience/me', requireSession, (req: PortalRequest, res) => {
    const session = req.portal!;
    res.json(toMeDto(session, options.getSubjectName(session.contactId), options.getBranding()));
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    options.logger?.error('[portal] unexpected error', error);
    res.status(500).json({ message: 'Something went wrong.' });
  });

  return router;
}
```


- [ ] **Step 6: Mount it in `createServer`**

In `backend/src/server.ts`, add to the imports near the other `./` imports:

```ts
import { createPortalRouter } from './portal/routes';
```

Add to `CreateServerOptions`, after `permissionReader?: FgaReader;`:

```ts
  /** The company the public portals serve. Unset leaves the portal API off. */
  portalCompanyId?: string;
```

Immediately before the final error handler (`app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {` near the end of `createServer`), add:

```ts
  const portalCompanyId = options.portalCompanyId ?? process.env.PORTAL_COMPANY_ID;
  if (portalCompanyId) {
    if (!store.getCompanyById(portalCompanyId)) {
      logger.warn(`[portal] PORTAL_COMPANY_ID ${portalCompanyId} matches no company yet.`);
    }
    app.use(
      '/portal-api',
      createPortalRouter({
        portal: store.portal,
        companyId: portalCompanyId,
        getBranding: () => {
          const company = store.getCompanyById(portalCompanyId);
          return company ? { name: company.name, logoUrl: company.logoUrl } : undefined;
        },
        getSubjectName: (contactId) => store.getContactById(contactId)?.name,
        enforceRateLimits: process.env.NODE_ENV === 'production',
        logger,
      }),
    );
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-routes.test.js test/portal-isolation.test.js 2>&1 | tail -20`
Expected: `# pass 14`, `# fail 0`.

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && npm test 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/portal/dto.ts backend/src/portal/routes.ts backend/src/server.ts backend/test/portal-routes.test.js backend/test/portal-isolation.test.js
git commit -m "feat(portal): serve the portal API with strict audience separation

Sign-in, invitation acceptance, sign-out and me under /portal-api/<audience>,
throttled per address and per email, returning only allowlisted fields.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Staff access management

**Files:**
- Create: `backend/src/portal/portal-email.ts`, `backend/src/portal/staff-routes.ts`
- Modify: `backend/src/permissions/record-rules.ts`, `backend/src/data/store.ts` (migration `084`), `backend/src/email.ts`, `backend/src/server.ts`
- Test: `backend/test/portal-email.test.js`, `backend/test/portal-staff.test.js`

**Interfaces:**
- Consumes: `PortalStore`, `PortalUser`, `portalAudiences`, `rolesForAudience` (Task 1); `RECORD_RULES`.
- Produces: `RECORD_RULES.PORTAL_ACCESS_MANAGE` (`contacts:portal.manage`); `renderInviteEmail(input): {subject, html}`; `sendPortalInviteEmail(input): Promise<{sent, error?}>`; `type PortalInviteSender`; `createPortalStaffRouter(deps)`; `CreateServerOptions.sendPortalInvite?: PortalInviteSender`; routes `GET /companies/:companyId/portal-users`, `POST /companies/:companyId/portal-users`, `POST /companies/:companyId/portal-users/:id/{reinvite,disable,enable}`; env `PORTAL_CLIENT_URL`, `PORTAL_INFLUENCER_URL`, `PORTAL_FROM_EMAIL`.

- [ ] **Step 1: Write the failing email test**

Create `backend/test/portal-email.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { renderInviteEmail } = require('../dist/portal/portal-email');

const input = {
  name: 'Ada <script>alert(1)</script>', companyName: 'Peak & Co', audience: 'client',
  link: 'https://clients.peak.test/accept/abc123',
};

test('the invitation escapes names and carries the link in both languages', () => {
  const { subject, html } = renderInviteEmail(input);
  assert.match(subject, /Peak &amp; Co|Peak & Co/);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Peak &amp; Co'));
  assert.ok(html.includes('href="https://clients.peak.test/accept/abc123"'));
  assert.match(html, /Set your password/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /[؀-ۿ]/);
});

test('the wording follows the audience', () => {
  assert.match(renderInviteEmail(input).html, /client portal/i);
  assert.match(renderInviteEmail({ ...input, audience: 'influencer' }).html, /influencer portal/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-email.test.js 2>&1 | tail -8`
Expected: FAIL — `Cannot find module '../dist/portal/portal-email'`.

- [ ] **Step 3: Let `email.ts` share its sender**

In `backend/src/email.ts`, change the local helpers so the portal can reuse them. Replace `const escapeHtml = (value: string) =>` with `export const escapeHtml = (value: string) =>`, and replace the `send` function header and its `from`:

```ts
export async function send(to: string, subject: string, html: string, from: string = fromEmail): Promise<EmailResult> {
```

and inside it change `from: fromEmail,` to `from,`. Keep the rest of the function as is. Export the `EmailResult` type: change `type EmailResult =` to `export type EmailResult =`.

- [ ] **Step 4: Write the email module**

Create `backend/src/portal/portal-email.ts`:

```ts
import { escapeHtml, send, type EmailResult } from '../email';
import type { PortalAudience } from './portal-store';

export interface InviteEmailInput {
  name: string;
  companyName: string;
  audience: PortalAudience;
  link: string;
}

export type PortalInviteSender = (input: InviteEmailInput & { to: string }) => Promise<EmailResult>;

export function renderInviteEmail(input: InviteEmailInput): { subject: string; html: string } {
  const name = escapeHtml(input.name);
  const company = escapeHtml(input.companyName);
  const link = escapeHtml(input.link);
  const portalEn = input.audience === 'client' ? 'client portal' : 'influencer portal';
  const portalAr = input.audience === 'client' ? 'بوابة العملاء' : 'بوابة المؤثرين';
  const button = (label: string) =>
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#15171c;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#15171c;line-height:1.5">
      <h2 style="margin:0 0 8px">Hello ${name},</h2>
      <p>${company} has invited you to its ${portalEn}. Set a password to get started.</p>
      ${button('Set your password')}
      <p style="color:#5b6068;font-size:13px">The link works once and expires in 7 days. If you were not expecting this, you can ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e3dfd5;margin:24px 0" />
      <div dir="rtl" style="text-align:right">
        <h2 style="margin:0 0 8px">مرحبًا ${name}،</h2>
        <p>دعتك ${company} إلى ${portalAr}. عيّن كلمة مرور للبدء.</p>
        ${button('عيّن كلمة المرور')}
        <p style="color:#5b6068;font-size:13px">الرابط صالح لاستخدام واحد وينتهي خلال 7 أيام. إن لم تكن تتوقع هذه الرسالة فتجاهلها.</p>
      </div>
    </div>`;

  return { subject: `You are invited to ${input.companyName} | دعوة من ${input.companyName}`, html };
}

export const sendPortalInviteEmail: PortalInviteSender = ({ to, ...input }) => {
  const { subject, html } = renderInviteEmail(input);
  return send(to, subject, html, process.env.PORTAL_FROM_EMAIL || process.env.RESEND_FROM_EMAIL);
};
```

`send`'s `from` parameter defaults to `fromEmail`, so passing `undefined` (both env vars unset) falls back to it.

- [ ] **Step 5: Run the email test to verify it passes**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-email.test.js 2>&1 | tail -8`
Expected: `# pass 2`, `# fail 0`. (`subject` contains the escaped or raw company name; the first assertion accepts either.)

- [ ] **Step 6: Write the failing staff-route test**

Create `backend/test/portal-staff.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const Database = require('better-sqlite3');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-staff-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const staff = (role, email) => store.createUser({
    name: role, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const admin = staff('Admin', 'admin@peak.test');
  const manager = staff('Manager', 'manager@peak.test');
  const employee = staff('Employee', 'employee@peak.test');
  const acme = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Acme Foods', roles: ['Client'] });
  const creator = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Creator', roles: ['Influencer'] });
  const lead = store.createContact({ companyId: company.id, kind: 'Person', name: 'Just A Lead', roles: ['Lead'] });
  const foreign = store.createContact({ companyId: other.id, kind: 'Organization', name: 'Foreign', roles: ['Client'] });

  const sent = [];
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id,
    sendPortalInvite: async (input) => { sent.push(input); return { sent: true }; },
  }).listen(0);
  server.unref();
  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  return { server, store, company, other, acme, creator, lead, foreign, sent, admin: auth(admin), manager: auth(manager), employee: auth(employee) };
};

const usersUrl = (company) => `/companies/${company.id}/portal-users`;

test('an admin invites a client user, gets the link, and the email goes out', async () => {
  const ctx = build();
  const res = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin)
    .send({ audience: 'client', contactId: ctx.acme.id, email: 'Ada@Acme.test', name: 'Ada' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'ada@acme.test');
  assert.equal(res.body.user.status, 'invited');
  assert.equal(res.body.user.role, 'client_admin', 'the first user of a client administers the account');
  assert.equal(res.body.emailSent, true);
  assert.match(res.body.inviteLink, /\/accept\/[\w-]{40,}$/);
  assert.equal(ctx.sent.length, 1);
  assert.deepEqual([ctx.sent[0].to, ctx.sent[0].name, ctx.sent[0].companyName, ctx.sent[0].audience], ['ada@acme.test', 'Ada', 'Peak Media', 'client']);
  assert.equal(ctx.sent[0].link, res.body.inviteLink);

  const second = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.manager)
    .send({ audience: 'client', contactId: ctx.acme.id, email: 'bo@acme.test', name: 'Bo' });
  assert.equal(second.body.user.role, 'client_member');
  const chosen = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin)
    .send({ audience: 'client', contactId: ctx.acme.id, email: 'cy@acme.test', name: 'Cy', role: 'client_admin' });
  assert.equal(chosen.body.user.role, 'client_admin');
});

test('the invitation link works in the portal, and the link uses the configured host', async () => {
  const ctx = build();
  const saved = process.env.PORTAL_CLIENT_URL;
  process.env.PORTAL_CLIENT_URL = 'https://clients.peak.test/';
  try {
    const res = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin)
      .send({ audience: 'client', contactId: ctx.acme.id, email: 'ada@acme.test', name: 'Ada' });
    assert.ok(res.body.inviteLink.startsWith('https://clients.peak.test/accept/'));
    const token = res.body.inviteLink.split('/accept/')[1];
    const accepted = await request(ctx.server).post('/portal-api/client/auth/accept-invite').send({ token, password: PASSWORD });
    assert.equal(accepted.status, 200);
  } finally {
    if (saved === undefined) delete process.env.PORTAL_CLIENT_URL; else process.env.PORTAL_CLIENT_URL = saved;
  }
});

test('influencers are invited into the influencer portal', async () => {
  const ctx = build();
  const res = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin)
    .send({ audience: 'influencer', contactId: ctx.creator.id, email: 'lina@x.test', name: 'Lina', role: 'client_admin' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'influencer', 'the audience decides the role');
  assert.equal(ctx.sent[0].audience, 'influencer');
});

test('the contact must belong to this company and hold the matching role', async () => {
  const ctx = build();
  const post = (body) => request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin).send({ email: 'a@b.test', name: 'A', ...body });
  assert.equal((await post({ audience: 'client', contactId: ctx.lead.id })).status, 400, 'a lead is not a client');
  assert.equal((await post({ audience: 'client', contactId: ctx.creator.id })).status, 400, 'an influencer is not a client');
  assert.equal((await post({ audience: 'influencer', contactId: ctx.acme.id })).status, 400, 'a client is not an influencer');
  assert.equal((await post({ audience: 'client', contactId: ctx.foreign.id })).status, 404, 'another company');
  assert.equal((await post({ audience: 'client', contactId: 'missing' })).status, 404);
  assert.equal((await post({ audience: 'partner', contactId: ctx.acme.id })).status, 400);
  assert.equal((await post({ audience: 'client', contactId: ctx.acme.id, email: 'nope' })).status, 400);
  assert.equal(ctx.sent.length, 0, 'nothing was sent');
});

test('only holders of the portal permission can manage access', async () => {
  const ctx = build();
  const body = { audience: 'client', contactId: ctx.acme.id, email: 'ada@acme.test', name: 'Ada' };
  assert.equal((await request(ctx.server).post(usersUrl(ctx.company)).send(body)).status, 401);
  assert.equal((await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.employee).send(body)).status, 403);
  assert.equal((await request(ctx.server).get(usersUrl(ctx.company)).set(ctx.employee)).status, 403);
  assert.equal((await request(ctx.server).get(usersUrl(ctx.company)).set(ctx.manager)).status, 200);
});

test('listing filters by audience and contact and never crosses companies', async () => {
  const ctx = build();
  const add = (body) => request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin).send(body);
  await add({ audience: 'client', contactId: ctx.acme.id, email: 'ada@acme.test', name: 'Ada' });
  await add({ audience: 'influencer', contactId: ctx.creator.id, email: 'lina@x.test', name: 'Lina' });

  const all = await request(ctx.server).get(usersUrl(ctx.company)).set(ctx.admin);
  assert.deepEqual(all.body.map((u) => u.name), ['Ada', 'Lina']);
  const byContact = await request(ctx.server).get(`${usersUrl(ctx.company)}?audience=client&contactId=${ctx.acme.id}`).set(ctx.admin);
  assert.deepEqual(byContact.body.map((u) => u.name), ['Ada']);
  assert.equal(JSON.stringify(all.body).includes('passwordHash'), false);
  assert.equal((await request(ctx.server).get(`/companies/${ctx.other.id}/portal-users`).set(ctx.admin)).status, 403, 'no access to another company');
});

test('disabling ends the session, enabling restores sign-in, and users of other companies are out of reach', async () => {
  const ctx = build();
  const created = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin)
    .send({ audience: 'client', contactId: ctx.acme.id, email: 'ada@acme.test', name: 'Ada' });
  const id = created.body.user.id;
  const token = created.body.inviteLink.split('/accept/')[1];
  const session = (await request(ctx.server).post('/portal-api/client/auth/accept-invite').send({ token, password: PASSWORD })).body.token;
  const me = () => request(ctx.server).get('/portal-api/client/me').set({ Authorization: `Bearer ${session}` });
  assert.equal((await me()).status, 200);

  const disabled = await request(ctx.server).post(`${usersUrl(ctx.company)}/${id}/disable`).set(ctx.admin);
  assert.equal(disabled.body.status, 'disabled');
  assert.equal((await me()).status, 401);
  assert.equal((await request(ctx.server).post('/portal-api/client/auth/login').send({ email: 'ada@acme.test', password: PASSWORD })).status, 401);

  const enabled = await request(ctx.server).post(`${usersUrl(ctx.company)}/${id}/enable`).set(ctx.admin);
  assert.equal(enabled.body.status, 'active');
  assert.equal((await request(ctx.server).post('/portal-api/client/auth/login').send({ email: 'ada@acme.test', password: PASSWORD })).status, 200);

  const foreignUser = ctx.store.portal.inviteUser({
    companyId: ctx.other.id, audience: 'client', contactId: ctx.foreign.id, email: 'f@o.test', name: 'F', role: 'client_admin',
  }).user;
  assert.equal((await request(ctx.server).post(`${usersUrl(ctx.company)}/${foreignUser.id}/disable`).set(ctx.admin)).status, 404);
  assert.equal((await request(ctx.server).post(`${usersUrl(ctx.company)}/missing/disable`).set(ctx.admin)).status, 404);
});

test('re-inviting issues a new link and refuses a disabled user', async () => {
  const ctx = build();
  const created = await request(ctx.server).post(usersUrl(ctx.company)).set(ctx.admin)
    .send({ audience: 'client', contactId: ctx.acme.id, email: 'ada@acme.test', name: 'Ada' });
  const id = created.body.user.id;

  const again = await request(ctx.server).post(`${usersUrl(ctx.company)}/${id}/reinvite`).set(ctx.admin);
  assert.equal(again.status, 200);
  assert.notEqual(again.body.inviteLink, created.body.inviteLink);
  assert.equal(ctx.sent.length, 2);
  const oldToken = created.body.inviteLink.split('/accept/')[1];
  assert.equal((await request(ctx.server).get(`/portal-api/client/invitations/${oldToken}`)).status, 404);

  await request(ctx.server).post(`${usersUrl(ctx.company)}/${id}/disable`).set(ctx.admin);
  assert.equal((await request(ctx.server).post(`${usersUrl(ctx.company)}/${id}/reinvite`).set(ctx.admin)).status, 409);
});

test('a failed email still returns the link so staff can share it', async () => {
  const ctx = build();
  const failing = createServer({
    store: ctx.store, dbPath: '', seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: ctx.company.id,
    sendPortalInvite: async () => ({ sent: false, error: 'RESEND_API_KEY not set; skipping email.' }),
  }).listen(0);
  failing.unref();
  const res = await request(failing).post(usersUrl(ctx.company)).set(ctx.admin)
    .send({ audience: 'client', contactId: ctx.acme.id, email: 'ada@acme.test', name: 'Ada' });
  assert.equal(res.status, 201);
  assert.equal(res.body.emailSent, false);
  assert.match(res.body.emailError, /RESEND_API_KEY/);
  assert.match(res.body.inviteLink, /\/accept\//);
});

test('managers and admins hold the permission and employees do not', () => {
  const ctx = build();
  const held = (email) => new Set(ctx.store.getEffectivePermissions(ctx.store.listUsers().find((u) => u.email === email).id, ctx.company.id));
  assert.ok(held('admin@peak.test').has('contacts:portal.manage'));
  assert.ok(held('manager@peak.test').has('contacts:portal.manage'));
  assert.equal(held('employee@peak.test').has('contacts:portal.manage'), false);
});

test('migration 084 restores the permission on existing built-in groups', () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-migration-'), 'taskflow.db');
  const first = new DataStore({ dbPath, seedOnEmpty: false });
  const company = first.createCompany({ name: 'Older Co', website: '', address: '' });
  const holders = () => {
    const raw = new Database(dbPath, { readonly: true });
    const count = (key) => raw
      .prepare('SELECT COUNT(*) AS n FROM group_permissions gp JOIN permission_groups g ON g.id = gp.groupId WHERE g.companyId = ? AND g.key = ? AND gp.module = ? AND gp.action = ?')
      .get(company.id, key, 'contacts', 'portal.manage').n;
    const result = Object.fromEntries(['admin', 'manager', 'employee', 'accountant'].map((key) => [key, count(key)]));
    raw.close();
    return result;
  };
  assert.deepEqual(holders(), { admin: 1, manager: 1, employee: 0, accountant: 0 });

  const raw = new Database(dbPath);
  raw.prepare("DELETE FROM group_permissions WHERE module = 'contacts' AND action = 'portal.manage'").run();
  raw.prepare("DELETE FROM schema_migrations WHERE id = '084_portal_access_permission'").run();
  raw.close();
  assert.deepEqual(holders(), { admin: 0, manager: 0, employee: 0, accountant: 0 });

  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  assert.deepEqual(holders(), { admin: 1, manager: 1, employee: 0, accountant: 0 });
  assert.ok(reopened.getAppliedMigrationIds().includes('084_portal_access_permission'));
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd backend && npm run build 2>&1 | tail -3; NODE_ENV=test node --test test/portal-staff.test.js 2>&1 | tail -12`
Expected: FAIL — `sendPortalInvite` is unknown and the routes return 404.

- [ ] **Step 8: Add the record rule and its migration**

In `backend/src/permissions/record-rules.ts`, add after `CONTACTS_ALL_WRITE`:

```ts
  PORTAL_ACCESS_MANAGE: {
    module: 'contacts', action: 'portal.manage', roles: ['Admin', 'Manager'],
    description: 'Invite, re-invite, disable and enable portal users for clients and influencers.',
  },
```

In `backend/src/data/store.ts`, append after the `083_portal_identity` migration:

```ts
      {
        // Portal access became a permission (permissions/record-rules.ts).
        // Existing built-in groups receive it for exactly the roles that hold it.
        id: '084_portal_access_permission',
        run: () => {
          const roleByKey: Record<string, UserRole> = {
            admin: 'Admin', manager: 'Manager', employee: 'Employee', accountant: 'Accountant',
          };
          const rule = RECORD_RULES.PORTAL_ACCESS_MANAGE;
          const insert = this.db.prepare(
            'INSERT OR IGNORE INTO group_permissions (groupId, module, action) VALUES (?, ?, ?)',
          );
          const groups = this.db
            .prepare('SELECT id, key FROM permission_groups WHERE isSystem = 1')
            .all() as Array<{ id: string; key: string }>;
          groups.forEach((group) => {
            const role = roleByKey[group.key];
            if (role && (rule.roles as readonly string[]).includes(role)) insert.run(group.id, rule.module, rule.action);
          });
        },
      },
```

- [ ] **Step 9: Write the staff router**

Create `backend/src/portal/staff-routes.ts`:

```ts
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { asRecord, enumValue, requiredString } from '../validation';
import type { PortalInviteSender } from './portal-email';
import { portalAudiences, rolesForAudience, type PortalAudience, type PortalRole, type PortalUser } from './portal-store';

export type StaffRequest = Request & { user?: SanitizedUser };

export interface PortalStaffDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  requireCompanyAccess(req: StaffRequest, companyId: string): void;
  canManagePortal(req: StaffRequest, companyId: string): boolean;
  inviteLink(audience: PortalAudience, token: string): string;
  sendInvite: PortalInviteSender;
}

const REQUIRED_CONTACT_ROLE: Record<PortalAudience, 'Client' | 'Influencer'> = {
  client: 'Client',
  influencer: 'Influencer',
};

const wrap =
  (fn: (req: StaffRequest, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as StaffRequest, res)).catch(next);

export function createPortalStaffRouter(deps: PortalStaffDeps): Router {
  const { store, authMiddleware } = deps;
  const router = Router();

  const authorize = (req: StaffRequest) => {
    const { companyId } = req.params;
    deps.requireCompanyAccess(req, companyId);
    if (!deps.canManagePortal(req, companyId)) {
      throw new HttpError(403, 'You do not have permission to manage portal access.');
    }
    return companyId;
  };

  const loadUser = (companyId: string, id: string): PortalUser => {
    const user = store.portal.getUser(id);
    if (!user || user.companyId !== companyId) throw new HttpError(404, 'Portal user not found.');
    return user;
  };

  const deliver = async (companyId: string, user: PortalUser, token: string) => {
    const inviteLink = deps.inviteLink(user.audience, token);
    const result = await deps.sendInvite({
      to: user.email,
      name: user.name,
      companyName: store.getCompanyById(companyId)?.name ?? '',
      audience: user.audience,
      link: inviteLink,
    });
    return { user, inviteLink, emailSent: result.sent, emailError: result.error };
  };

  router.get('/companies/:companyId/portal-users', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const audience = typeof req.query.audience === 'string' ? enumValue(req.query.audience, 'audience', portalAudiences) : undefined;
    const contactId = typeof req.query.contactId === 'string' ? req.query.contactId : undefined;
    res.json(store.portal.listUsers(companyId, { audience, contactId }));
  }));

  router.post('/companies/:companyId/portal-users', authMiddleware, wrap(async (req, res) => {
    const companyId = authorize(req);
    const body = asRecord(req.body, 'body');
    const audience = enumValue(body.audience, 'audience', portalAudiences);
    const contactId = requiredString(body.contactId, 'contactId');
    const email = requiredString(body.email, 'email', { min: 3 });
    const name = requiredString(body.name, 'name');

    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    const requiredRole = REQUIRED_CONTACT_ROLE[audience];
    if (!contact.roles?.includes(requiredRole)) {
      throw new HttpError(400, `This contact does not have the ${requiredRole} role.`);
    }

    let role: PortalRole = 'influencer';
    if (audience === 'client') {
      const first = store.portal.listUsers(companyId, { audience, contactId }).length === 0;
      role = body.role === undefined
        ? (first ? 'client_admin' : 'client_member')
        : enumValue(body.role, 'role', rolesForAudience.client);
    }

    const { user, token } = store.portal.inviteUser({
      companyId, audience, contactId, email, name, role, createdByUserId: req.user?.id,
    });
    res.status(201).json(await deliver(companyId, user, token));
  }));

  router.post('/companies/:companyId/portal-users/:id/reinvite', authMiddleware, wrap(async (req, res) => {
    const companyId = authorize(req);
    loadUser(companyId, req.params.id);
    const { user, token } = store.portal.reinvite(req.params.id);
    res.json(await deliver(companyId, user, token));
  }));

  router.post('/companies/:companyId/portal-users/:id/disable', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    loadUser(companyId, req.params.id);
    res.json(store.portal.disableUser(req.params.id));
  }));

  router.post('/companies/:companyId/portal-users/:id/enable', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    loadUser(companyId, req.params.id);
    res.json(store.portal.enableUser(req.params.id));
  }));

  return router;
}
```

- [ ] **Step 10: Wire it in**

In `backend/src/server.ts` add imports:

```ts
import { sendPortalInviteEmail, type PortalInviteSender } from './portal/portal-email';
import { createPortalStaffRouter } from './portal/staff-routes';
```

Add to `CreateServerOptions`, after `portalCompanyId`:

```ts
  /** Sends portal invitation emails. Overridden in tests. */
  sendPortalInvite?: PortalInviteSender;
```

Directly after the `app.use('/portal-api', ...)` block from Task 2 (still before the final error handler), add:

```ts
  const portalHost = (audience: 'client' | 'influencer') =>
    (audience === 'client'
      ? process.env.PORTAL_CLIENT_URL || 'http://localhost:9003'
      : process.env.PORTAL_INFLUENCER_URL || 'http://localhost:9004'
    ).replace(/\/+$/, '');

  app.use(
    createPortalStaffRouter({
      store,
      authMiddleware: authMiddleware as unknown as RequestHandler,
      requireCompanyAccess: (req, companyId) => requireCompanyAccess(req as AuthedRequest, companyId),
      canManagePortal: (req, companyId) => allowsRule(req as AuthedRequest, companyId, 'PORTAL_ACCESS_MANAGE'),
      inviteLink: (audience, token) => `${portalHost(audience)}/accept/${token}`,
      sendInvite: options.sendPortalInvite ?? sendPortalInviteEmail,
    }),
  );
```

If `RequestHandler` is not already imported from `express` in `server.ts`, add it to the existing `import express, {...} from 'express'` list.

- [ ] **Step 11: Run the new tests, then the whole suite**

Run: `cd backend && npm run build 2>&1 | tail -5; NODE_ENV=test node --test test/portal-staff.test.js test/portal-email.test.js 2>&1 | tail -15`
Expected: `# pass 13`, `# fail 0`.

Run: `cd backend && npm test 2>&1 | tail -8`
Expected: `# fail 0`. If `permission-catalogue.test.js` or `record-rules.test.js` fail on the new rule, read the failing assertion and adjust the rule or seed, not the test.

- [ ] **Step 12: Commit**

```bash
git add backend/src backend/test
git commit -m "feat(portal): let staff invite, re-invite, disable and enable portal users

Gated by the new contacts:portal.manage permission. The invite link is always
returned so staff can share it when email is not configured.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The portal app

**Files:** everything under `portal/` listed in File Structure.

**Interfaces:**
- Consumes: the portal API from Tasks 2 and 3 (`/portal-api/<audience>/{branding,invitations/:token,auth/login,auth/accept-invite,auth/logout,me}`).
- Produces: env `PORTAL_AUDIENCE`, `PORTAL_API_URL`; cookies `portal_session` (httpOnly) and `portal_lang`.

Design direction, so the result does not read as a template: a calm, editorial canvas (warm off-white `#F5F3EE`, ink `#15171C`), one vermilion accent (`#C2410C`) used only for focus and a single rule, Manrope for Latin and IBM Plex Sans Arabic for Arabic, generous spacing, 44px controls, labels above fields, no icons-in-circles, no gradients, no fake numbers. The sign-in page is split: the company on an ink panel, the form on the canvas. The dashboard states honestly what will appear and shows only real account details.

- [ ] **Step 1: Scaffold the package**

Run: `npm -v` and note it. If it is not 10.x, use `npx npm@10` in place of `npm` below (the staging server installs with npm 10, and a lock file from another major version breaks `npm ci` there).

Create `portal/package.json`:

```json
{
  "name": "taskflow-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:client": "PORTAL_AUDIENCE=client next dev -p 9003",
    "dev:influencer": "PORTAL_AUDIENCE=influencer next dev -p 9004",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test \"src/**/*.test.ts\""
  },
  "dependencies": {
    "next": "15.3.8",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

Create `portal/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `portal/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Create `portal/postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Create `portal/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        danger: 'var(--danger)',
      },
      fontFamily: { sans: ['var(--font-latin)', 'var(--font-arabic)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
```

Create `portal/.env.example`:

```
# Which portal this process serves: client or influencer. One build, two processes.
PORTAL_AUDIENCE=client
# The TaskFlow backend, reached over loopback. Never expose it publicly.
PORTAL_API_URL=http://127.0.0.1:4005
```

Run: `cd portal && npm install 2>&1 | tail -4`
Expected: installs without errors and creates `package-lock.json`. Confirm `/Users/tamerabbasher/Documents/Projects/TaskFlow/.gitignore` ignores `node_modules` and `.next` at any depth (`grep -n "node_modules\|\.next" .gitignore`); add `portal/.next` and `portal/node_modules` if it does not.

- [ ] **Step 2: Write the failing unit tests for the pure libraries**

> **Superseded during execution (Execution notes, item 6): do not create this file; the route-audience library was removed.**

Create `portal/src/lib/route-audience.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from './route-audience';

test('shared routes pass through untouched', () => {
  for (const path of ['/login', '/accept/abc123', '/api/session/login', '/api/lang']) {
    assert.deepEqual(resolveRoute('client', path), { action: 'pass' }, path);
  }
});

test('everything else is served from the audience folder', () => {
  assert.deepEqual(resolveRoute('client', '/'), { action: 'rewrite', pathname: '/client' });
  assert.deepEqual(resolveRoute('influencer', '/'), { action: 'rewrite', pathname: '/influencer' });
  assert.deepEqual(resolveRoute('client', '/campaigns/7'), { action: 'rewrite', pathname: '/client/campaigns/7' });
});

test('the audience folders cannot be reached by name, on either host', () => {
  for (const audience of ['client', 'influencer'] as const) {
    for (const path of ['/client', '/client/campaigns', '/influencer', '/influencer/assignments']) {
      assert.deepEqual(resolveRoute(audience, path), { action: 'notfound' }, `${audience} host ${path}`);
    }
  }
  assert.deepEqual(resolveRoute('client', '/clients-list'), { action: 'rewrite', pathname: '/client/clients-list' });
});
```

Create `portal/src/lib/origin.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from './origin';

test('a request from the same host is accepted, including a non-default port', () => {
  assert.equal(isSameOrigin({ origin: 'https://clients.peak.test', host: 'clients.peak.test' }), true);
  assert.equal(isSameOrigin({ origin: 'http://localhost:9003', host: 'localhost:9003' }), true);
  assert.equal(isSameOrigin({ origin: 'https://Clients.Peak.test', host: 'clients.peak.test' }), true);
});

test('a missing, foreign, or malformed origin is refused', () => {
  assert.equal(isSameOrigin({ origin: null, host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://evil.test', host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://clients.peak.test.evil.test', host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'null', host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://clients.peak.test', host: null }), false);
});
```

Create `portal/src/lib/audience.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudience } from './audience';

test('only client and influencer are audiences', () => {
  assert.equal(parseAudience('client'), 'client');
  assert.equal(parseAudience('influencer'), 'influencer');
  for (const bad of [undefined, '', 'admin', 'Client']) {
    assert.throws(() => parseAudience(bad), /PORTAL_AUDIENCE/);
  }
});
```

Create `portal/src/lib/i18n.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries, dirFor, parseLang, t } from './i18n';

test('English and Arabic define exactly the same keys', () => {
  assert.deepEqual(Object.keys(dictionaries.ar).sort(), Object.keys(dictionaries.en).sort());
});

test('no string is empty and every Arabic string is written in Arabic', () => {
  for (const [key, value] of Object.entries(dictionaries.en)) assert.ok(value.trim(), `en ${key}`);
  for (const [key, value] of Object.entries(dictionaries.ar)) {
    assert.ok(value.trim(), `ar ${key}`);
    assert.match(value, /[؀-ۿ]/, `ar ${key} has no Arabic letters`);
  }
});

test('language and direction resolve safely', () => {
  assert.equal(parseLang('ar'), 'ar');
  assert.equal(parseLang('fr'), 'en');
  assert.equal(parseLang(undefined), 'en');
  assert.equal(dirFor('ar'), 'rtl');
  assert.equal(dirFor('en'), 'ltr');
  assert.equal(t('ar', 'nav.signOut'), dictionaries.ar['nav.signOut']);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd portal && npm test 2>&1 | tail -12`
Expected: FAIL — `Cannot find module './route-audience'` (and the other three).

- [ ] **Step 4: Write the pure libraries**

Create `portal/src/lib/audience.ts`:

```ts
export type Audience = 'client' | 'influencer';

export function parseAudience(value: string | undefined): Audience {
  if (value === 'client' || value === 'influencer') return value;
  throw new Error(`PORTAL_AUDIENCE must be "client" or "influencer", got ${JSON.stringify(value)}.`);
}

export const getAudience = (): Audience => parseAudience(process.env.PORTAL_AUDIENCE);
```

> **Superseded during execution (Execution notes, item 6): do not create this file.**

Create `portal/src/lib/route-audience.ts`:

```ts
import type { Audience } from './audience';

export type RouteDecision =
  | { action: 'pass' }
  | { action: 'rewrite'; pathname: string }
  | { action: 'notfound' };

const SHARED = [/^\/login$/, /^\/accept\/[^/]+$/, /^\/api(\/|$)/];

/**
 * One build serves both hosts. Each host's pages live in an audience folder,
 * which is an internal detail: reaching a folder by name would let one host
 * serve the other audience's pages, so those paths do not exist.
 */
export function resolveRoute(audience: Audience, pathname: string): RouteDecision {
  if (/^\/(client|influencer)(\/|$)/.test(pathname)) return { action: 'notfound' };
  if (SHARED.some((pattern) => pattern.test(pathname))) return { action: 'pass' };
  return { action: 'rewrite', pathname: pathname === '/' ? `/${audience}` : `/${audience}${pathname}` };
}
```

Create `portal/src/lib/origin.ts`:

```ts
export interface OriginHeaders {
  origin?: string | null;
  host?: string | null;
}

/** State-changing requests must come from this very host. Browsers always send Origin on them. */
export function isSameOrigin({ origin, host }: OriginHeaders): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}
```

Create `portal/src/lib/i18n.ts`:

```ts
export type Lang = 'en' | 'ar';

export const parseLang = (value: string | undefined | null): Lang => (value === 'ar' ? 'ar' : 'en');
export const dirFor = (lang: Lang): 'rtl' | 'ltr' => (lang === 'ar' ? 'rtl' : 'ltr');

const en = {
  'signIn.title': 'Sign in',
  'signIn.client': 'Follow your campaigns, proposals and invoices in one place.',
  'signIn.influencer': 'Your assignments, content and payments in one place.',
  'signIn.help': 'No account yet? Your account manager will send you an invitation.',
  'signIn.submit': 'Sign in',
  'signIn.submitting': 'Signing in…',
  'signIn.failed': 'The email or password is incorrect.',
  'signIn.throttled': 'Too many attempts. Please wait a few minutes and try again.',
  'signIn.unavailable': 'The portal is temporarily unavailable. Please try again shortly.',
  'field.email': 'Email',
  'field.password': 'Password',
  'accept.title': 'Set your password',
  'accept.welcome': 'Welcome,',
  'accept.subtitle': 'Choose a password of at least 10 characters to finish setting up your account.',
  'accept.confirm': 'Confirm password',
  'accept.submit': 'Save and continue',
  'accept.submitting': 'Saving…',
  'accept.mismatch': 'The passwords do not match.',
  'accept.tooShort': 'Use at least 10 characters.',
  'accept.failed': 'We could not save your password. The link may have expired.',
  'invite.invalidTitle': 'This invitation link is no longer valid',
  'invite.invalidBody': 'It may have expired or already been used. Ask your account manager to send a new one.',
  'invite.toSignIn': 'Go to sign in',
  'nav.signOut': 'Sign out',
  'dash.hello': 'Hello,',
  'dash.account': 'Your account',
  'dash.name': 'Name',
  'dash.email': 'Email',
  'dash.organisation': 'Organisation',
  'dash.profile': 'Profile',
  'dash.role': 'Role',
  'role.client_admin': 'Account administrator',
  'role.client_member': 'Team member',
  'role.influencer': 'Influencer',
  'dash.client.title': 'Your campaigns will appear here',
  'dash.client.body': 'When your account manager shares a proposal or starts a campaign with you, you will follow it from this page.',
  'dash.influencer.title': 'Your assignments will appear here',
  'dash.influencer.body': 'When the team offers you a campaign, you will accept it, submit your content and follow your payment from this page.',
  'notFound.title': 'Page not found',
  'notFound.body': 'The page you are looking for does not exist.',
  'notFound.home': 'Back to the start',
} as const;

export type Key = keyof typeof en;

const ar: Record<Key, string> = {
  'signIn.title': 'تسجيل الدخول',
  'signIn.client': 'تابع حملاتك وعروضك وفواتيرك في مكان واحد.',
  'signIn.influencer': 'مهامك ومحتواك ومدفوعاتك في مكان واحد.',
  'signIn.help': 'لا تملك حسابًا؟ سيرسل لك مدير حسابك دعوة.',
  'signIn.submit': 'دخول',
  'signIn.submitting': 'جارٍ الدخول…',
  'signIn.failed': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'signIn.throttled': 'محاولات كثيرة. يرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.',
  'signIn.unavailable': 'البوابة غير متاحة مؤقتًا. يرجى المحاولة بعد قليل.',
  'field.email': 'البريد الإلكتروني',
  'field.password': 'كلمة المرور',
  'accept.title': 'عيّن كلمة المرور',
  'accept.welcome': 'مرحبًا،',
  'accept.subtitle': 'اختر كلمة مرور من 10 أحرف على الأقل لإكمال إعداد حسابك.',
  'accept.confirm': 'تأكيد كلمة المرور',
  'accept.submit': 'حفظ ومتابعة',
  'accept.submitting': 'جارٍ الحفظ…',
  'accept.mismatch': 'كلمتا المرور غير متطابقتين.',
  'accept.tooShort': 'استخدم 10 أحرف على الأقل.',
  'accept.failed': 'تعذّر حفظ كلمة المرور. ربما انتهت صلاحية الرابط.',
  'invite.invalidTitle': 'رابط الدعوة لم يعد صالحًا',
  'invite.invalidBody': 'ربما انتهت صلاحيته أو استُخدم من قبل. اطلب من مدير حسابك إرسال رابط جديد.',
  'invite.toSignIn': 'الذهاب إلى تسجيل الدخول',
  'nav.signOut': 'تسجيل الخروج',
  'dash.hello': 'مرحبًا،',
  'dash.account': 'حسابك',
  'dash.name': 'الاسم',
  'dash.email': 'البريد الإلكتروني',
  'dash.organisation': 'الجهة',
  'dash.profile': 'الملف',
  'dash.role': 'الدور',
  'role.client_admin': 'مسؤول الحساب',
  'role.client_member': 'عضو الفريق',
  'role.influencer': 'مؤثر',
  'dash.client.title': 'ستظهر حملاتك هنا',
  'dash.client.body': 'عندما يشاركك مدير حسابك عرضًا أو يبدأ معك حملة، ستتابعها من هذه الصفحة.',
  'dash.influencer.title': 'ستظهر مهامك هنا',
  'dash.influencer.body': 'عندما يعرض عليك الفريق حملة، ستقبلها وتسلّم محتواك وتتابع دفعتك من هذه الصفحة.',
  'notFound.title': 'الصفحة غير موجودة',
  'notFound.body': 'الصفحة التي تبحث عنها غير موجودة.',
  'notFound.home': 'العودة إلى البداية',
};

export const dictionaries: Record<Lang, Record<Key, string>> = { en, ar };

export const t = (lang: Lang, key: Key): string => dictionaries[lang][key];

/** Picks a set of strings so a client component receives text, not the whole dictionary. */
export function pick<K extends Key>(lang: Lang, keys: readonly K[]): Record<K, string> {
  return Object.fromEntries(keys.map((key) => [key, t(lang, key)])) as Record<K, string>;
}
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `cd portal && npm test 2>&1 | tail -12`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 6: Write the server-side plumbing**

Create `portal/src/lib/session.ts`:

```ts
import { cookies } from 'next/headers';
import { parseLang, type Lang } from './i18n';

export const SESSION_COOKIE = 'portal_session';
export const LANG_COOKIE = 'portal_lang';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

/** httpOnly keeps the token away from page scripts; Lax keeps it off cross-site requests. */
export const sessionCookie = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  expires,
});
```

Create `portal/src/lib/backend.ts`:

```ts
import { headers } from 'next/headers';
import type { Audience } from './audience';

const apiBase = () => (process.env.PORTAL_API_URL ?? 'http://127.0.0.1:4005').replace(/\/+$/, '');

export interface BackendResult<T> {
  status: number;
  data: T;
}

/**
 * The only way the portal reaches the backend. Runs on the server, so the
 * session token never touches browser JavaScript. The visitor's address is
 * passed on so the backend's per-address sign-in limit sees the visitor, not
 * this process.
 */
export async function backendFetch<T = Record<string, unknown>>(
  audience: Audience,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {},
): Promise<BackendResult<T>> {
  const forwardedFor = (await headers()).get('x-forwarded-for');
  try {
    const response = await fetch(`${apiBase()}/portal-api/${audience}${path}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data: data as T };
  } catch {
    return { status: 503, data: { message: 'The portal is temporarily unavailable.' } as T };
  }
}
```

Create `portal/src/lib/portal.ts`:

```ts
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Audience } from './audience';
import { backendFetch } from './backend';
import { readSessionToken } from './session';

export interface Branding {
  name: string;
  logoUrl: string | null;
}

export interface Me {
  user: { name: string; email: string; audience: Audience; role: 'client_admin' | 'client_member' | 'influencer' };
  subject: { name: string };
  company: Branding | null;
}

export const getBranding = cache(async (audience: Audience): Promise<Branding | null> => {
  const res = await backendFetch<Branding>(audience, '/branding');
  return res.status === 200 ? res.data : null;
});

/** The signed-in user, or a redirect to sign in. A stale cookie simply fails here and the sign-in page replaces it. */
export const requireMe = cache(async (audience: Audience): Promise<Me> => {
  const token = await readSessionToken();
  if (!token) redirect('/login');
  const res = await backendFetch<Me>(audience, '/me', { token });
  if (res.status === 401) redirect('/login');
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status}.`);
  return res.data;
});

export const getMeOrNull = cache(async (audience: Audience): Promise<Me | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const res = await backendFetch<Me>(audience, '/me', { token });
  return res.status === 200 ? res.data : null;
});
```

Create `portal/src/lib/session-route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAudience } from './audience';
import { backendFetch } from './backend';
import { isSameOrigin } from './origin';
import { SESSION_COOKIE, sessionCookie } from './session';

export const forbidden = () => NextResponse.json({ message: 'Forbidden' }, { status: 403 });

export const requireSameOrigin = (request: Request) =>
  isSameOrigin({ origin: request.headers.get('origin'), host: request.headers.get('host') });

/** Signs in or accepts an invitation upstream, then keeps the returned token in an httpOnly cookie. */
export async function startSession(request: Request, path: string, body: Record<string, unknown>) {
  if (!requireSameOrigin(request)) return forbidden();
  const result = await backendFetch<{ token?: string; expiresAt?: string; message?: string }>(getAudience(), path, {
    method: 'POST',
    body,
  });
  if (result.status !== 200 || !result.data.token || !result.data.expiresAt) {
    const status = result.status === 200 ? 502 : result.status;
    return NextResponse.json({ message: result.data.message ?? 'Request failed.' }, { status });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, result.data.token, sessionCookie(new Date(result.data.expiresAt)));
  return response;
}
```

- [ ] **Step 7: Write the route handlers and middleware**

Create `portal/src/app/api/session/login/route.ts`:

```ts
import { startSession } from '@/lib/session-route';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  return startSession(request, '/auth/login', { email: body.email, password: body.password });
}
```

Create `portal/src/app/api/session/accept-invite/route.ts`:

```ts
import { startSession } from '@/lib/session-route';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  return startSession(request, '/auth/accept-invite', { token: body.token, password: body.password });
}
```

Create `portal/src/app/api/session/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { readSessionToken, SESSION_COOKIE } from '@/lib/session';
import { forbidden, requireSameOrigin } from '@/lib/session-route';

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return forbidden();
  const token = await readSessionToken();
  if (token) await backendFetch(getAudience(), '/auth/logout', { method: 'POST', token });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
```

Create `portal/src/app/api/lang/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { parseLang } from '@/lib/i18n';
import { LANG_COOKIE } from '@/lib/session';
import { forbidden, requireSameOrigin } from '@/lib/session-route';

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return forbidden();
  const body = (await request.json().catch(() => ({}))) as { lang?: string };
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LANG_COOKIE, parseLang(body.lang), {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
```

> **Superseded during execution (Execution notes, item 6): do not create this file. It works in dev and fails in production.**

Create `portal/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { parseAudience } from '@/lib/audience';
import { resolveRoute } from '@/lib/route-audience';

export function middleware(request: NextRequest) {
  const decision = resolveRoute(parseAudience(process.env.PORTAL_AUDIENCE), request.nextUrl.pathname);
  if (decision.action === 'notfound') {
    const url = request.nextUrl.clone();
    url.pathname = '/_not-found-portal';
    return NextResponse.rewrite(url);
  }
  if (decision.action === 'rewrite') {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 8: Write the styles, layout and shared components**

Create `portal/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --canvas: #f5f3ee;
  --surface: #ffffff;
  --ink: #15171c;
  --ink-soft: #5b6068;
  --line: #e3dfd5;
  --accent: #c2410c;
  --danger: #b42318;
  color-scheme: light;
}

html { background: var(--canvas); }

body {
  margin: 0;
  color: var(--ink);
  background: var(--canvas);
  font-family: var(--font-latin), var(--font-arabic), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

[dir='rtl'] body { font-family: var(--font-arabic), var(--font-latin), system-ui, sans-serif; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

::selection { background: color-mix(in srgb, var(--accent) 22%, transparent); }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

Create `portal/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Manrope } from 'next/font/google';
import './globals.css';
import { getAudience } from '@/lib/audience';
import { dirFor } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

const latin = Manrope({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-arabic',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding(getAudience());
  return { title: branding?.name ?? 'Portal', robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang} dir={dirFor(lang)} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
```

Create `portal/src/components/field.tsx`:

```tsx
import type { InputHTMLAttributes } from 'react';

export function Field({ label, id, ...input }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        name={id}
        className="h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-soft/60 transition-colors hover:border-ink/30 focus-visible:border-ink"
        {...input}
      />
    </div>
  );
}

export const primaryButton =
  'inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-ink/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';
```

Create `portal/src/components/brand-mark.tsx`:

```tsx
import type { Branding } from '@/lib/portal';

export function BrandMark({ branding, tone = 'ink' }: { branding: Branding | null; tone?: 'ink' | 'light' }) {
  const name = branding?.name ?? 'Portal';
  if (branding?.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={branding.logoUrl} alt={name} className="h-8 w-auto max-w-[180px] object-contain" />;
  }
  return (
    <span className={`text-lg font-semibold tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink'}`}>{name}</span>
  );
}
```

Create `portal/src/components/language-switch.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function LanguageSwitch({ lang, tone = 'ink' }: { lang: 'en' | 'ar'; tone?: 'ink' | 'light' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const target = lang === 'ar' ? 'en' : 'ar';

  async function switchTo() {
    await fetch('/api/lang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: target }),
    });
    start(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={pending}
      lang={target}
      className={`rounded-md px-2 py-1 text-sm font-medium transition-colors ${
        tone === 'light' ? 'text-white/80 hover:text-white' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {target === 'ar' ? 'العربية' : 'English'}
    </button>
  );
}
```

Create `portal/src/components/sign-out-button.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/session/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded-md px-2 py-1 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 9: Write the sign-in and invitation pages**

Create `portal/src/components/login-form.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, primaryButton } from './field';

export interface LoginStrings {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  failed: string;
  throttled: string;
  unavailable: string;
}

export function LoginForm({ strings }: { strings: LoginStrings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(response.status === 401 ? strings.failed : response.status === 429 ? strings.throttled : strings.unavailable);
    } catch {
      setError(strings.unavailable);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field id="email" type="email" label={strings.email} autoComplete="username" required dir="ltr" />
      <Field id="password" type="password" label={strings.password} autoComplete="current-password" required />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
```

Create `portal/src/components/accept-form.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, primaryButton } from './field';

export interface AcceptStrings {
  password: string;
  confirm: string;
  submit: string;
  submitting: string;
  mismatch: string;
  tooShort: string;
  failed: string;
}

export function AcceptForm({ token, strings }: { token: string; strings: AcceptStrings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 10) return setError(strings.tooShort);
    if (password !== form.get('confirm')) return setError(strings.mismatch);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(strings.failed);
    } catch {
      setError(strings.failed);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field id="password" type="password" label={strings.password} autoComplete="new-password" required />
      <Field id="confirm" type="password" label={strings.confirm} autoComplete="new-password" required />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
```

Create `portal/src/components/auth-frame.tsx` (the split layout shared by sign-in, invitation and not-found):

```tsx
import type { ReactNode } from 'react';
import type { Branding } from '@/lib/portal';
import type { Lang } from '@/lib/i18n';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';

export function AuthFrame({
  branding,
  lang,
  tagline,
  children,
}: {
  branding: Branding | null;
  lang: Lang;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen md:grid-cols-[minmax(320px,5fr)_7fr]">
      <aside className="flex flex-col justify-between bg-ink px-8 py-10 text-white md:px-12 md:py-14">
        <BrandMark branding={branding} tone="light" />
        <div className="mt-16 max-w-sm md:mt-0">
          <div aria-hidden className="mb-6 h-0.5 w-10 bg-accent" />
          <p className="text-2xl font-semibold leading-snug tracking-tight md:text-[28px]">{tagline}</p>
        </div>
      </aside>
      <section className="flex flex-col px-6 py-8 md:px-16 md:py-14">
        <div className="flex justify-end"><LanguageSwitch lang={lang} /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </section>
    </main>
  );
}
```

Create `portal/src/app/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { LoginForm } from '@/components/login-form';
import { getAudience } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getBranding, getMeOrNull } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function LoginPage() {
  const audience = getAudience();
  if (await getMeOrNull(audience)) redirect('/');
  const [lang, branding] = [await currentLang(), await getBranding(audience)];

  return (
    <AuthFrame branding={branding} lang={lang} tagline={t(lang, audience === 'client' ? 'signIn.client' : 'signIn.influencer')}>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">{t(lang, 'signIn.title')}</h1>
      <LoginForm
        strings={{
          email: t(lang, 'field.email'),
          password: t(lang, 'field.password'),
          submit: t(lang, 'signIn.submit'),
          submitting: t(lang, 'signIn.submitting'),
          failed: t(lang, 'signIn.failed'),
          throttled: t(lang, 'signIn.throttled'),
          unavailable: t(lang, 'signIn.unavailable'),
        }}
      />
      <p className="mt-8 text-sm text-ink-soft">{t(lang, 'signIn.help')}</p>
    </AuthFrame>
  );
}
```

Create `portal/src/app/accept/[token]/page.tsx`:

```tsx
import Link from 'next/link';
import { AcceptForm } from '@/components/accept-form';
import { AuthFrame } from '@/components/auth-frame';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { t } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const audience = getAudience();
  const lang = await currentLang();
  const [branding, invitation] = await Promise.all([
    getBranding(audience),
    backendFetch<{ name: string; email: string }>(audience, `/invitations/${encodeURIComponent(token)}`),
  ]);
  const tagline = t(lang, audience === 'client' ? 'signIn.client' : 'signIn.influencer');

  if (invitation.status !== 200) {
    return (
      <AuthFrame branding={branding} lang={lang} tagline={tagline}>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t(lang, 'invite.invalidTitle')}</h1>
        <p className="mb-8 text-ink-soft">{t(lang, 'invite.invalidBody')}</p>
        <Link href="/login" className="text-sm font-semibold text-ink underline underline-offset-4">
          {t(lang, 'invite.toSignIn')}
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame branding={branding} lang={lang} tagline={tagline}>
      <p className="mb-1 text-sm text-ink-soft">{t(lang, 'accept.welcome')}</p>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">{invitation.data.name}</h1>
      <p className="mb-8 text-ink-soft">{t(lang, 'accept.subtitle')}</p>
      <AcceptForm
        token={token}
        strings={{
          password: t(lang, 'field.password'),
          confirm: t(lang, 'accept.confirm'),
          submit: t(lang, 'accept.submit'),
          submitting: t(lang, 'accept.submitting'),
          mismatch: t(lang, 'accept.mismatch'),
          tooShort: t(lang, 'accept.tooShort'),
          failed: t(lang, 'accept.failed'),
        }}
      />
    </AuthFrame>
  );
}
```

Create `portal/src/app/not-found.tsx`:

```tsx
import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { getAudience } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function NotFound() {
  const audience = getAudience();
  const lang = await currentLang();
  return (
    <AuthFrame branding={await getBranding(audience)} lang={lang} tagline={t(lang, audience === 'client' ? 'signIn.client' : 'signIn.influencer')}>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t(lang, 'notFound.title')}</h1>
      <p className="mb-8 text-ink-soft">{t(lang, 'notFound.body')}</p>
      <Link href="/" className="text-sm font-semibold text-ink underline underline-offset-4">{t(lang, 'notFound.home')}</Link>
    </AuthFrame>
  );
}
```

- [ ] **Step 10: Write the signed-in shell and dashboards**

Create `portal/src/components/portal-shell.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import type { Me } from '@/lib/portal';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';
import { SignOutButton } from './sign-out-button';

export function PortalShell({ me, lang, children }: { me: Me; lang: Lang; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
          <BrandMark branding={me.company} />
          <div className="flex items-center gap-1">
            <LanguageSwitch lang={lang} />
            <span aria-hidden className="mx-1 h-4 w-px bg-line" />
            <SignOutButton label={t(lang, 'nav.signOut')} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">{children}</main>
    </div>
  );
}
```

Create `portal/src/components/dashboard.tsx`:

```tsx
import type { Audience } from '@/lib/audience';
import { t, type Lang } from '@/lib/i18n';
import type { Me } from '@/lib/portal';

export function Dashboard({ me, lang, audience }: { me: Me; lang: Lang; audience: Audience }) {
  const rows: Array<[string, string]> = [
    [t(lang, 'dash.name'), me.user.name],
    [t(lang, 'dash.email'), me.user.email],
    [t(lang, audience === 'client' ? 'dash.organisation' : 'dash.profile'), me.subject.name],
    [t(lang, 'dash.role'), t(lang, `role.${me.user.role}`)],
  ];

  return (
    <div className="space-y-12">
      <header>
        <p className="text-sm text-ink-soft">{t(lang, 'dash.hello')}</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{me.user.name}</h1>
      </header>

      <section aria-labelledby="empty-title" className="border-y border-line py-12">
        <div aria-hidden className="mb-5 h-0.5 w-10 bg-accent" />
        <h2 id="empty-title" className="text-xl font-semibold tracking-tight">
          {t(lang, audience === 'client' ? 'dash.client.title' : 'dash.influencer.title')}
        </h2>
        <p className="mt-2 max-w-xl leading-relaxed text-ink-soft">
          {t(lang, audience === 'client' ? 'dash.client.body' : 'dash.influencer.body')}
        </p>
      </section>

      <section aria-labelledby="account-title">
        <h2 id="account-title" className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          {t(lang, 'dash.account')}
        </h2>
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-sm text-ink-soft">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
```

> **Superseded during execution (Execution notes, item 6): the code below was replaced by `app/(portal)/layout.tsx` and `app/(portal)/page.tsx`, which read the audience from `getAudience()`.**

Create the two audience layouts and pages. `portal/src/app/client/layout.tsx`:

```tsx
import { PortalShell } from '@/components/portal-shell';
import { requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe('client');
  return <PortalShell me={me} lang={await currentLang()}>{children}</PortalShell>;
}
```

`portal/src/app/client/page.tsx`:

```tsx
import { Dashboard } from '@/components/dashboard';
import { requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function ClientHome() {
  return <Dashboard me={await requireMe('client')} lang={await currentLang()} audience="client" />;
}
```

`portal/src/app/influencer/layout.tsx` and `portal/src/app/influencer/page.tsx` are identical with `'influencer'` in place of `'client'` and the components named `InfluencerLayout` and `InfluencerHome`.

- [ ] **Step 11: Typecheck, test, build**

Run: `cd portal && npm run typecheck 2>&1 | tail -10`
Expected: no output. Fix any type errors it reports before going on.

Run: `cd portal && npm test 2>&1 | tail -5`
Expected: `# fail 0`.

Run: `cd portal && PORTAL_AUDIENCE=client PORTAL_API_URL=http://127.0.0.1:4005 npm run build 2>&1 | tail -20`
Expected: the build completes and lists `/login`, `/accept/[token]`, `/client`, `/influencer`, `/api/*`. If it cannot download Google fonts (offline), note it and rerun with network; do not swap fonts to make the build pass.

- [ ] **Step 12: Run both portals against a real backend and drive them in a browser**

Start the backend on a scratch database (keep this terminal):

```bash
cd backend && npm run build && \
TASKFLOW_DB_PATH=/tmp/peak-portal-dev.db SEED_ON_EMPTY=true PORT=4005 HOST=127.0.0.1 \
PORTAL_COMPANY_ID=1 PORTAL_CLIENT_URL=http://localhost:9003 PORTAL_INFLUENCER_URL=http://localhost:9004 \
node dist/index.js
```

Find the demo admin's credentials in `backend/src/data/seed-data.ts` (search `admin@taskflow.com`), sign in with `curl -s -X POST localhost:4005/auth/login -H 'content-type: application/json' -d '{"email":"admin@taskflow.com","password":"<from seed>"}'`, then with that token create two contacts through `POST /companies/1/contacts` (one `{"kind":"Organization","name":"Acme Foods","roles":["Client"]}`, one `{"kind":"Person","name":"Lina Creator","roles":["Influencer"]}`) and two invitations through `POST /companies/1/portal-users`. Note each `inviteLink` from the responses.

Start both portals:

```bash
cd portal && npm run dev:client      # http://localhost:9003
cd portal && npm run dev:influencer  # http://localhost:9004
```

Then, using the browser tools, check each of these and record what you saw:
1. Open the client invite link on :9003, set a password, land on the dashboard showing "Acme Foods" and the account rows.
2. Sign out, sign in again with the same credentials; a wrong password shows the inline error.
3. Open `http://localhost:9003/influencer` and `/client` directly: both show the not-found page. Open the influencer host's `/client`: not-found.
4. Switch to Arabic: the page flips to right to left, fonts change, nothing overflows. Reload: the language sticks.
5. Resize to 390px wide: single column, no horizontal scroll, form usable.
6. In the network panel, confirm no response body or JavaScript-visible cookie contains the session token (`document.cookie` does not list `portal_session`).
7. Open the influencer invite link on :9004 and repeat 1 and 2.
8. `curl -s localhost:9003/api/session/login -X POST -H 'content-type: application/json' -d '{}'` returns 403 (no `Origin`).

Fix anything that looks wrong before committing; for visual polish problems, use the `impeccable` skill's critique and polish guidance rather than ad hoc tweaks.

- [ ] **Step 13: Commit**

```bash
git add portal .gitignore
git commit -m "feat(portal): add the portal app with sign-in, invitations and dashboards

One Next build serves the client and influencer hosts, chosen by
PORTAL_AUDIENCE. The server proxies the backend and keeps the session in an
httpOnly cookie. English and Arabic, right to left.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Portal access in TaskFlow

**Files:**
- Create: `frontend/src/services/portalAccessService.ts`, `frontend/src/modules/portal-access/components/portal-access-panel.tsx`
- Modify: `frontend/src/modules/clients/components/clients-page.tsx`, `frontend/src/modules/influencers/components/influencer-edit-sheet.tsx`

**Interfaces:**
- Consumes: staff routes from Task 3.
- Produces: `PortalAccessPanel({ contact, audience })`.

- [ ] **Step 1: Write the service**

Create `frontend/src/services/portalAccessService.ts`:

```ts
import { apiFetch } from '@/lib/api-client';

export type PortalAudience = 'client' | 'influencer';
export type PortalRole = 'client_admin' | 'client_member' | 'influencer';
export type PortalUserStatus = 'invited' | 'active' | 'disabled';

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

export interface PortalInviteResult {
  user: PortalUser;
  inviteLink: string;
  emailSent: boolean;
  emailError?: string;
}

const base = (companyId: string) => `/companies/${companyId}/portal-users`;

export const listPortalUsers = (companyId: string, params: { audience: PortalAudience; contactId: string }) =>
  apiFetch<PortalUser[]>(`${base(companyId)}?${new URLSearchParams(params)}`);

export const invitePortalUser = (
  companyId: string,
  body: { audience: PortalAudience; contactId: string; email: string; name: string; role?: PortalRole },
) => apiFetch<PortalInviteResult>(base(companyId), { method: 'POST', body: JSON.stringify(body) });

export const reinvitePortalUser = (companyId: string, id: string) =>
  apiFetch<PortalInviteResult>(`${base(companyId)}/${id}/reinvite`, { method: 'POST' });

export const setPortalUserDisabled = (companyId: string, id: string, disabled: boolean) =>
  apiFetch<PortalUser>(`${base(companyId)}/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' });
```

- [ ] **Step 2: Write the panel**

Look at how other components pass the legacy fallback to `usePermissionOr` (`grep -rn "usePermissionOr(" frontend/src | head -3`) and how they read the signed-in role, and use the same pattern for the gate below.

Create `frontend/src/modules/portal-access/components/portal-access-panel.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { Contact } from '@/services/contactService';
import {
  invitePortalUser,
  listPortalUsers,
  reinvitePortalUser,
  setPortalUserDisabled,
  type PortalAudience,
  type PortalInviteResult,
  type PortalRole,
  type PortalUser,
} from '@/services/portalAccessService';
import { Copy, RefreshCw, UserPlus } from 'lucide-react';

export function PortalAccessPanel({ contact, audience }: { contact: Contact; audience: PortalAudience }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [users, setUsers] = React.useState<PortalUser[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<PortalRole>('client_admin');
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<PortalInviteResult | null>(null);

  const load = React.useCallback(async () => {
    try {
      setUsers(await listPortalUsers(contact.companyId, { audience, contactId: contact.id }));
    } catch {
      setUsers([]);
    }
  }, [audience, contact.companyId, contact.id]);

  React.useEffect(() => {
    setUsers(null);
    setIssued(null);
    setOpen(false);
    void load();
  }, [load]);

  const startInvite = () => {
    setName(audience === 'client' ? contact.contactPerson ?? '' : contact.name);
    setEmail(contact.email ?? '');
    setRole(users && users.length > 0 ? 'client_member' : 'client_admin');
    setOpen(true);
  };

  const report = (result: PortalInviteResult) => {
    setIssued(result);
    toast({
      title: result.emailSent ? tr('Invitation emailed', 'تم إرسال الدعوة بالبريد') : tr('Email not sent', 'لم يُرسل البريد'),
      description: result.emailSent ? result.user.email : tr('Share the link below yourself.', 'شارك الرابط أدناه بنفسك.'),
    });
  };

  const invite = async () => {
    setBusy(true);
    try {
      const result = await invitePortalUser(contact.companyId, {
        audience, contactId: contact.id, email, name, role: audience === 'client' ? role : undefined,
      });
      report(result);
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not invite', 'تعذّرت الدعوة'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'inviteLink' in result) report(result as PortalInviteResult);
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Something went wrong', 'حدث خطأ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: tr('Link copied', 'تم نسخ الرابط') });
    } catch {
      toast({ title: tr('Copy failed. Select the link and copy it by hand.', 'تعذّر النسخ. حدّد الرابط وانسخه يدويًا.'), variant: 'destructive' });
    }
  };

  const statusLabel = (status: PortalUser['status']) =>
    ({ invited: tr('Invited', 'مدعو'), active: tr('Active', 'نشط'), disabled: tr('Disabled', 'معطّل') })[status];
  const roleLabel = (r: PortalRole) =>
    ({ client_admin: tr('Administrator', 'مسؤول'), client_member: tr('Member', 'عضو'), influencer: tr('Influencer', 'مؤثر') })[r];

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{tr('Portal access', 'الوصول إلى البوابة')}</h3>
          <p className="text-xs text-muted-foreground">
            {audience === 'client'
              ? tr('People at this client who can sign in to the client portal.', 'أشخاص من هذا العميل يمكنهم الدخول إلى بوابة العملاء.')
              : tr('Lets this influencer sign in to the influencer portal.', 'يتيح لهذا المؤثر الدخول إلى بوابة المؤثرين.')}
          </p>
        </div>
        {!open && (
          <Button type="button" size="sm" variant="outline" onClick={startInvite} disabled={busy}>
            <UserPlus className="me-1 h-4 w-4" />
            {tr('Invite', 'دعوة')}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{tr('Name', 'الاسم')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{tr('Email', 'البريد الإلكتروني')}</Label>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {audience === 'client' && (
            <div className="max-w-xs">
              <Label className="text-xs">{tr('Role', 'الدور')}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PortalRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_admin">{roleLabel('client_admin')}</SelectItem>
                  <SelectItem value="client_member">{roleLabel('client_member')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button type="button" size="sm" onClick={invite} disabled={busy || !name.trim() || !email.trim()}>
              {tr('Send invitation', 'إرسال الدعوة')}
            </Button>
          </div>
        </div>
      )}

      {issued && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            {issued.emailSent
              ? tr('The invitation was emailed. The link also works if you send it yourself:', 'أُرسلت الدعوة بالبريد. الرابط يعمل أيضًا إن أرسلته بنفسك:')
              : tr('Email is not configured, so nothing was sent. Share this link with the person:', 'لم يُضبط البريد، لذلك لم يُرسل شيء. شارك هذا الرابط مع الشخص:')}
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly dir="ltr" value={issued.inviteLink} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
            <Button type="button" size="sm" variant="outline" onClick={() => copy(issued.inviteLink)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{tr('Single use. Expires in 7 days.', 'يُستخدم مرة واحدة وينتهي خلال 7 أيام.')}</p>
        </div>
      )}

      {users === null ? (
        <p className="text-xs text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : users.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tr('No one has portal access yet.', 'لا أحد لديه وصول إلى البوابة بعد.')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {audience === 'client' && <Badge variant="outline">{roleLabel(user.role)}</Badge>}
                <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{statusLabel(user.status)}</Badge>
                {user.status !== 'disabled' && (
                  <Button type="button" size="sm" variant="ghost" disabled={busy}
                    title={tr('Send a new link, also used to reset a password', 'إرسال رابط جديد، ويُستخدم أيضًا لإعادة تعيين كلمة المرور')}
                    onClick={() => act(() => reinvitePortalUser(contact.companyId, user.id))}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={busy}
                  onClick={() => act(() => setPortalUserDisabled(contact.companyId, user.id, user.status !== 'disabled'))}>
                  {user.status === 'disabled' ? tr('Enable', 'تفعيل') : tr('Disable', 'تعطيل')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Add the panel to the influencer sheet**

In `frontend/src/modules/influencers/components/influencer-edit-sheet.tsx`, import the panel and the permission hook the file's neighbours use (see Step 2), then render the panel at the end of the scrolling area, just before the footer. The scrolling area closes with `</div>` immediately above `<div className="flex justify-end gap-2 border-t p-4">`; insert between them:

```tsx
          {contact && canManagePortal && <PortalAccessPanel contact={contact} audience="influencer" />}
```

where `canManagePortal` comes from `usePermissionOr('contacts', 'portal.manage', <legacy role check for Admin or Manager, in the form the neighbouring components use>)`.

- [ ] **Step 4: Add access to the clients table**

In `frontend/src/modules/clients/components/clients-page.tsx`:

1. Import `Sheet, SheetContent, SheetHeader, SheetTitle` from `@/components/ui/sheet`, `PortalAccessPanel`, and the same permission hook.
2. Add state `const [portalFor, setPortalFor] = React.useState<Contact | null>(null);` and `const canManagePortal = usePermissionOr('contacts', 'portal.manage', <same legacy check>);` near the other state.
3. Add a header cell after the outstanding column: `{canManagePortal && <TableHead className="text-end">{t('clients.colPortal', 'Portal')}</TableHead>}`.
4. Add a cell at the end of each row:

```tsx
                  {canManagePortal && (
                    <TableCell className="text-end">
                      <Button size="sm" variant="ghost" onClick={() => setPortalFor(c)}>
                        {language === 'ar' ? 'الوصول' : 'Access'}
                      </Button>
                    </TableCell>
                  )}
```

(read `language` from the existing `useI18n()` call by adding it to the destructuring.)
5. Before the closing `</SectionPageShell>`, add:

```tsx
      <Sheet open={!!portalFor} onOpenChange={(open) => !open && setPortalFor(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{portalFor?.name}</SheetTitle>
          </SheetHeader>
          {portalFor && <PortalAccessPanel contact={portalFor} audience="client" />}
        </SheetContent>
      </Sheet>
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && npm run typecheck 2>&1 | tail -10; npm run lint 2>&1 | tail -10`
Expected: no new errors. The repo may already report existing lint warnings; only fix ones in the files touched here.

- [ ] **Step 6: Check it in the browser**

With the backend from Task 4 running and the demo data, start the internal app (`cd frontend && npm run dev`, port 9002, with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4005`), sign in as the demo admin, and check:
1. Clients page: an "Access" button per client opens a sheet with the panel; inviting shows the link and the "email not configured" wording; the new user appears as Invited; disabling and enabling work; re-inviting shows a new link.
2. Influencers page: the influencer edit sheet shows the panel and works the same.
3. Sign in as a demo user with the Employee role: neither the button nor the panel appears.
4. Switch to Arabic: the panel reads right to left with no clipped text.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(portal): manage portal access from the Clients and Influencers pages

Staff with the portal permission invite people, copy the invitation link when
email is off, send a fresh link, and disable or re-enable access.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Deployment artifacts and end-to-end check

**Files:**
- Create: `deploy/portal/ecosystem.portal.cjs`, `deploy/portal/nginx-portal.conf.template`, `deploy/portal/README.md`
- Modify: `docs/superpowers/plans/2026-09-24-peak-portals-roadmap.md` (mark Phase 1 verified only if it is)

**Interfaces:**
- Consumes: the portal app and backend env from Tasks 1 to 4.

- [ ] **Step 1: Write the pm2 entries**

Create `deploy/portal/ecosystem.portal.cjs`:

```js
/**
 * pm2 processes for the Peak portals. One build of portal/, two processes,
 * chosen by PORTAL_AUDIENCE. Both bind loopback: nginx is the only way in, and
 * the backend's /portal-api is never routed by nginx.
 *
 *   pm2 startOrReload deploy/portal/ecosystem.portal.cjs --update-env
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const API_URL = process.env.PORTAL_API_URL || 'http://127.0.0.1:4005';

const portal = (name, audience, port) => ({
  name,
  cwd: path.join(ROOT, 'portal'),
  script: 'node_modules/next/dist/bin/next',
  args: `start -p ${port} -H 127.0.0.1`,
  env: { NODE_ENV: 'production', PORTAL_AUDIENCE: audience, PORTAL_API_URL: API_URL },
});

module.exports = {
  apps: [
    portal('peak-portal-client', 'client', 9003),
    portal('peak-portal-influencer', 'influencer', 9004),
  ],
};
```

- [ ] **Step 2: Write the nginx template**

Create `deploy/portal/nginx-portal.conf.template`:

```nginx
# One server block per portal host. Render twice:
#   __PORTAL_DOMAIN__ = the client host,     __PORTAL_PORT__ = 9003
#   __PORTAL_DOMAIN__ = the influencer host, __PORTAL_PORT__ = 9004
#
# Only the portal app is proxied. The backend's /portal-api is reached by the
# portal's own server over loopback and is never routed here.

server {
    listen 80;
    server_name __PORTAL_DOMAIN__;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name __PORTAL_DOMAIN__;

    ssl_certificate     /etc/letsencrypt/live/__PORTAL_DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__PORTAL_DOMAIN__/privkey.pem;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:__PORTAL_PORT__;
        # $http_host keeps a non-default port, which the same-origin check compares.
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        # The portal forwards this to the backend so its per-address sign-in
        # limit sees the visitor rather than the portal process.
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
    }
}
```

- [ ] **Step 3: Write the runbook**

Create `deploy/portal/README.md`:

```markdown
# Peak portals: deployment

Status: these templates are written and the app is verified locally. They have not
been run on a server yet.

## What runs

| Process | Port | Serves |
| --- | --- | --- |
| taskflow backend | 4005, loopback | the portal API at `/portal-api/*`, called only by the portals |
| peak-portal-client | 9003, loopback | the client host |
| peak-portal-influencer | 9004, loopback | the influencer host |

## Backend environment

```
PORTAL_COMPANY_ID=<id of the Peak Media company>
PORTAL_CLIENT_URL=https://<client host>
PORTAL_INFLUENCER_URL=https://<influencer host>
PORTAL_FROM_EMAIL=Peak Media <no-reply@<peak domain>>   # optional; falls back to RESEND_FROM_EMAIL
RESEND_API_KEY=...                                       # without it, staff share the invite link by hand
```

The backend must bind loopback (`HOST=127.0.0.1`) and sit behind nginx with
`TRUST_PROXY` at its default, so the sign-in limit keys on the real visitor.

## One-time setup

1. In TaskFlow as the platform super admin, create the Peak Media company and switch
   off the modules an agency does not use (inventory, manufacturing, purchasing, ...).
   Note its id for `PORTAL_COMPANY_ID`.
2. Set the company logo and name; the portal reads both.
3. Point two DNS names at the server and issue certificates for them.
4. Build and start the portals:

```bash
cd portal && npm ci && npm run build
pm2 startOrReload deploy/portal/ecosystem.portal.cjs --update-env
```

5. Render `nginx-portal.conf.template` once per host (see its header), enable both,
   and reload nginx.
6. Restart the backend so it reads the new environment.

## Giving someone access

In TaskFlow open Clients (or Influencers), choose Access, and invite the person. If
email is not configured the panel shows the link to send yourself. A re-invitation
also serves as a password reset.

## Checks after deploying

- `https://<client host>/login` shows the Peak Media name and logo.
- `https://<client host>/influencer` and `https://<influencer host>/client` both 404.
- `https://<host>/portal-api/client/me` is not reachable from the internet.
```

- [ ] **Step 2b: Run the whole verification**

Run each and record the tail of the output:
- `cd backend && npm test 2>&1 | tail -8` — expected `# fail 0`.
- `cd portal && npm test 2>&1 | tail -5 && npm run typecheck 2>&1 | tail -3` — expected no failures.
- `cd frontend && npm run typecheck 2>&1 | tail -3` — expected no output.
- `cd portal && PORTAL_AUDIENCE=client npm run build 2>&1 | tail -6` — expected a successful build.
- `cd frontend && npm run build 2>&1 | tail -6` — expected a successful build.

Then repeat the browser walk-through from Task 4 Step 12 and Task 5 Step 6 once more on a fresh scratch database, in this order: staff invites a client and an influencer from TaskFlow; both accept and sign in; a disabled user is signed out on the next click; the client session cookie replayed against the influencer host is rejected. Record what was seen.

- [ ] **Step 3: Sync the docs with what was built**

If anything in the code differs from this plan or the designs (a renamed helper, a changed route), update the plan and the affected design text in the same commit. Then update the Phase 1 line of the roadmap with the date and what was verified.

- [ ] **Step 4: Commit**

```bash
git add deploy/portal docs
git commit -m "feat(portal): add deployment templates and a runbook for the portals

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-review against the designs

- **Identity and isolation (client design §4, §6):** Tasks 1 and 2 cover separate tables, hashed tokens, audience matching, 404 for unknown audiences, generic sign-in failure, throttling, no-store, and DTO allowlisting. Task 2's isolation tests cover both directions between portal and internal tokens.
- **Staff invitation (client design Phase 0):** Task 3 covers invite, list, re-invite, disable, enable, the permission, and the email. Task 5 covers the UI.
- **Portal app (client design Phase 0, §8):** Task 4 covers the shell, both audiences, en/ar with RTL, branding from the company, and the httpOnly cookie proxy. Task 6 covers pm2 and nginx templates.
- **Deferred on purpose:** self-service password reset, dark mode, the `portalVisible` flag, pricing profiles, everything data-bearing. All belong to later phases in the roadmap.
- **Gaps found and fixed while writing:** the `ClientId` scoping in the designs was wrong (contacts, not `Client`), so `portal_users.contactId` serves both audiences; recorded in the roadmap and the design.
