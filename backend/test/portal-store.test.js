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
  for (const table of ['portal_invitations', 'portal_sessions', 'portal_users']) {
    assert.ok(tables.includes(table), `${table} exists`);
  }
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
  assert.equal(INVITATION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
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
