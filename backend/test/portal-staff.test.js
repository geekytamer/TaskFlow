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
  const serve = (sendPortalInvite) => {
    const server = createServer({
      store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
      portalCompanyId: company.id, sendPortalInvite,
    }).listen(0);
    server.unref();
    return server;
  };
  const server = serve(async (input) => { sent.push(input); return { sent: true }; });
  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  return {
    server, serve, store, dbPath, company, other, acme, creator, lead, foreign, sent,
    admin: auth(admin), manager: auth(manager), employee: auth(employee),
  };
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
  assert.deepEqual(
    [ctx.sent[0].to, ctx.sent[0].name, ctx.sent[0].companyName, ctx.sent[0].audience],
    ['ada@acme.test', 'Ada', 'Peak Media', 'client'],
  );
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
  const failing = ctx.serve(async () => ({ sent: false, error: 'RESEND_API_KEY not set; skipping email.' }));
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
