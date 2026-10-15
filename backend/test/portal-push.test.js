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
  const staffMessage = (body) => store.conversations.addMessage({ threadId: store.conversations.generalThread(company.id, client.id).id, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff', authorUserId: carla.id, authorPortalUserId: null, body });
  const sweep = (nowMs) => sweepPortalPush(store, send, company.id, nowMs);
  return { store, server, company, client, carla, sent, session, staffMessage, sweep };
};

test('each new event is pushed once, as the company name with what happened and where to look', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  ctx.staffMessage('Your draft is ready');
  assert.equal(await ctx.sweep(), 1);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].title, 'Peak Media');
  assert.equal(ctx.sent[0].body, 'New message: Your draft is ready');
  assert.equal(ctx.sent[0].url, `/messages/${ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id).id}`);
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

const MIN = 60_000;
const T0 = Date.UTC(2026, 5, 1, 9, 0, 0);
const prefs = (ctx, s, body) => request(ctx.server).put('/portal-api/client/alerts').set(s).send(body);

test('three messages in a burst make one push on the thread tag, with the count and the latest text', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  const tid = ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id).id;
  ['One', 'Two', 'Three is the latest'].forEach((t) => ctx.staffMessage(t));
  assert.equal(await ctx.sweep(T0), 1);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].tag, `thread:${tid}`);
  assert.equal(ctx.sent[0].url, `/messages/${tid}`);
  assert.equal(ctx.sent[0].body, '3 new messages: Three is the latest');
  assert.equal(await ctx.sweep(T0 + 10 * MIN), 0, 'not again');
});

test('after the first push, later messages wait for the window, then one push carries the running count', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  const tid = ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id).id;
  ctx.staffMessage('First');
  assert.equal(await ctx.sweep(T0), 1);
  assert.equal(ctx.sent[0].body, 'New message: First');
  ctx.staffMessage('Second');
  ctx.staffMessage('Third');
  assert.equal(await ctx.sweep(T0 + 30_000), 0, 'inside the window');
  assert.equal(await ctx.sweep(T0 + 90_000), 0);
  assert.equal(await ctx.sweep(T0 + 2 * MIN + 1000), 1);
  assert.equal(ctx.sent.length, 2);
  assert.equal(ctx.sent[1].tag, `thread:${tid}`);
  assert.equal(ctx.sent[1].body, '3 new messages: Third');
  assert.equal(await ctx.sweep(T0 + 10 * MIN), 0);
  ctx.staffMessage('Much later');
  assert.equal(await ctx.sweep(T0 + 60 * MIN), 1);
  assert.equal(ctx.sent[2].body, 'New message: Much later', 'a new burst starts from one');
});

test('the count is in Arabic for an Arabic reader', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  await prefs(ctx, s, { lang: 'ar', preview: false });
  ctx.staffMessage('a'); ctx.staffMessage('b'); ctx.staffMessage('c');
  await ctx.sweep(T0);
  assert.equal(ctx.sent[0].body, '3 رسائل جديدة');
});

test('with the messages switch off nothing is pushed, and turning it on later does not replay', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  assert.equal((await prefs(ctx, s, { groups: { messages: { push: false } } })).status, 200);
  ctx.staffMessage('Muted');
  assert.equal(await ctx.sweep(T0), 0);
  await prefs(ctx, s, { groups: { messages: { push: true } } });
  assert.equal(await ctx.sweep(T0 + 10 * MIN), 0, 'the muted message stays muted');
  ctx.staffMessage('Audible');
  assert.equal(await ctx.sweep(T0 + 20 * MIN), 1);
  assert.deepEqual(ctx.sent.map((m) => m.body), ['New message: Audible']);
});

test('with preview off the push says a message came, not what it said', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  await prefs(ctx, s, { preview: false });
  ctx.staffMessage('Your price is 1200 OMR');
  await ctx.sweep(T0);
  assert.equal(ctx.sent[0].body, 'New message');
  assert.equal(JSON.stringify(ctx.sent[0]).includes('1200'), false);
});

test('internal notes, private messages and non-portal channels never appear in a portal push', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  const threadId = ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id).id;
  const add = (extra) => ctx.store.conversations.addMessage({ threadId, authorType: 'staff', authorUserId: ctx.carla.id, authorPortalUserId: null, ...extra });
  add({ channel: 'note', direction: 'out', visibility: 'internal', body: 'POISON-internal' });
  add({ channel: 'portal', direction: 'out', visibility: 'owner_private', body: 'POISON-private' });
  assert.equal(await ctx.sweep(T0), 0);
  ctx.staffMessage('Safe text');
  add({ channel: 'note', direction: 'out', visibility: 'internal', body: 'POISON-after' });
  assert.equal(await ctx.sweep(T0 + 5 * MIN), 1);
  assert.equal(ctx.sent[0].body, 'New message: Safe text');
  assert.equal(JSON.stringify(ctx.sent).includes('POISON'), false);
});

test('other groups can be muted for push too', async () => {
  const ctx = build();
  const s = await ctx.session('buyer@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(device(1));
  assert.equal((await prefs(ctx, s, { groups: { messages: { push: false } } })).body.groups.proposals.push, true);
});
