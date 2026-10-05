const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Brand games report: staff link a game to a client; that client's portal users
 * read an allow-listed report of it. Nothing about moderation, data gaps or
 * staff ever reaches them.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-brand-games-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const user = (role, name, email, companyId = company.id) => store.createUser({
    name, email, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }],
  });
  const admin = user('Admin', 'Carla Admin', 'carla@peak.test');
  const manager = user('Manager', 'Mo Manager', 'mo@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'] });
  const foreign = store.createContact({ companyId: other.id, kind: 'Organization', name: 'Elsewhere', roles: ['Client'] });
  const rendered = [];
  const pdf = {
    invoice: async () => Buffer.from('%PDF-invoice'),
    html: async (html) => { rendered.push(html); return Buffer.from('%PDF-html'); },
  };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), portalPdf: pdf,
  }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const session = async (contact, email, audience = 'client') => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, company, admin, manager, client, rival, lina, foreign, session, rendered, adminAuth: auth(admin), managerAuth: auth(manager) };
};

const staff = (ctx, method, p, body, as = ctx.adminAuth) => request(ctx.server)[method](`/companies/${ctx.company.id}/games${p}`).set(as).send(body);

const GAME = (over = {}) => ({
  slug: 'ramadan-challenge', name: 'Ramadan challenge', nameAr: 'تحدي رمضان',
  rules: 'Comment to earn points.', prize: 'Dinner', visibility: 'restricted',
  startsAt: new Date(Date.now() - 3 * DAY).toISOString(), endsAt: new Date(Date.now() + 2 * DAY).toISOString(),
  ...over,
});

const createGame = async (ctx, over) => {
  const created = await staff(ctx, 'post', '', GAME(over));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.id;
};

test('staff link a game to a client, and only to one of this company\'s clients', async () => {
  const ctx = build();
  const id = await createGame(ctx);
  const link = (contactId, as) => staff(ctx, 'put', `/${id}/client`, { contactId }, as);

  assert.equal((await link(ctx.client.id, ctx.managerAuth)).status, 403, 'a manager cannot');
  assert.equal((await link(ctx.lina.id)).status, 400, 'an influencer is not a client');
  assert.equal((await link(ctx.foreign.id)).status, 400, 'another company\'s client');
  assert.equal((await link('nope')).status, 400, 'unknown contact');

  const linked = await link(ctx.client.id);
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  const read = await staff(ctx, 'get', `/${id}`);
  assert.equal(read.body.clientContactId, ctx.client.id);
  assert.equal(read.body.clientName, 'Al Noor Dates');

  assert.equal((await link(null)).status, 200);
  const unlinked = await staff(ctx, 'get', `/${id}`);
  assert.equal(unlinked.body.clientContactId, null);
  assert.equal(unlinked.body.clientName, null);
});

test('a frozen game can still be linked: it changes who reads, not the results', async () => {
  const ctx = build();
  const id = await createGame(ctx, { startsAt: new Date(Date.now() - 3 * DAY).toISOString(), endsAt: new Date(Date.now() - DAY).toISOString() });
  assert.equal((await staff(ctx, 'put', `/${id}/metrics`, [{ metricKey: 'manual_points', weight: 1, params: {} }])).status, 200);
  assert.equal((await staff(ctx, 'post', `/${id}/publish`)).status, 200);
  const read = await staff(ctx, 'get', `/${id}`);
  assert.ok(read.body.frozenAt, 'ended games freeze when read');
  assert.equal((await staff(ctx, 'put', `/${id}/client`, { contactId: ctx.client.id })).status, 200);
});

