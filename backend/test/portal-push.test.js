const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { sweepPortalPush } = require('../dist/portal/push-alerts');
const { makeTmpDir } = require('./helpers/tmp');

/** Portal users get each new event on their phone once, starting from when they turned it on. */

const device = (n) => ({ endpoint: `https://push.example/send/${n}`, keys: { p256dh: 'BKey', auth: 'auth' } });

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-push-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const carla = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const sent = [];
  const send = async (s, payload) => { sent.push({ endpoint: s.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), push: { publicKey: 'BKeyForTests', send },
  }).listen(0);
  server.unref();
  const session = async (email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email, name: email, role: 'client_admin' });
    store.portal.acceptInvitation(token, 'correct horse battery');
    return { Authorization: `Bearer ${(await request(server).post('/portal-api/client/auth/login').send({ email, password: 'correct horse battery' })).body.token}` };
  };
  const staffMessage = (body) => store.thread.addMessage({ companyId: company.id, contactId: client.id, authorType: 'staff', authorUserId: carla.id, authorPortalUserId: null, body });
  const sweep = () => sweepPortalPush(store, send, company.id);
  return { store, server, company, sent, session, staffMessage, sweep };
};

test('each new event is pushed once, as the company name with what happened and where to look', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  ctx.staffMessage('Your draft is ready');
  assert.equal(await ctx.sweep(), 1);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].title, 'Peak Media');
  assert.equal(ctx.sent[0].body, 'A new message from the team');
  assert.equal(ctx.sent[0].url, '/messages');
  assert.equal(await ctx.sweep(), 0, 'not twice');
  assert.equal(ctx.sent.length, 1);
});

test('what happened before turning notifications on is not pushed', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  ctx.staffMessage('Old news');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  assert.equal(await ctx.sweep(), 0);
  ctx.staffMessage('New news');
  assert.equal(await ctx.sweep(), 1);
});

test('someone with no device gets nothing, and a removed device stops them', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  ctx.staffMessage('Hello');
  assert.equal(await ctx.sweep(), 0);
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  await request(ctx.server).post('/portal-api/client/push/unsubscribe').set(s).send({ endpoint: device(1).endpoint });
  ctx.staffMessage('Again');
  assert.equal(await ctx.sweep(), 0);
  assert.deepEqual(ctx.sent, []);
});
