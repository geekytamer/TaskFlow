const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { sendToPrincipal } = require('../dist/push/push');
const { makeTmpDir } = require('./helpers/tmp');

/** Phone notifications: which devices belong to whom, and what happens when a device is gone. */

const sub = (n) => ({ endpoint: `https://push.example/send/${n}`, keys: { p256dh: `BKey${n}`, auth: `auth${n}` } });

const build = ({ push = true } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-push-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const user = (email) => store.createUser({ name: email, email, password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const carla = user('carla@peak.test');
  const omar = user('omar@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const sent = [];
  const sender = async (subscription, payload) => { sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
    push: push ? { publicKey: 'BPublicVapidKeyForTests', send: sender } : undefined,
  }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const portalSession = async () => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email: 'buyer@alnoor.test', name: 'Buyer', role: 'client_admin' });
    store.portal.acceptInvitation(token, 'correct horse battery');
    const res = await request(server).post('/portal-api/client/auth/login').send({ email: 'buyer@alnoor.test', password: 'correct horse battery' });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { store, server, company, carla, omar, auth, portalSession, sent, sender };
};

test('the public key says whether push is set up', async () => {
  assert.deepEqual((await request(build({ push: false }).server).get('/push/public-key')).body, { enabled: false });
  assert.deepEqual((await request(build().server).get('/push/public-key')).body, { enabled: true, publicKey: 'BPublicVapidKeyForTests' });
});

test('a staff member subscribes a device; the same device subscribed by someone else moves to them', async () => {
  const ctx = build();
  assert.equal((await request(ctx.server).post('/push/subscribe').set(ctx.auth(ctx.carla)).send(sub(1))).status, 201);
  assert.equal(ctx.store.push.forPrincipal('staff', ctx.carla.id).length, 1);
  await request(ctx.server).post('/push/subscribe').set(ctx.auth(ctx.omar)).send(sub(1));
  assert.equal(ctx.store.push.forPrincipal('staff', ctx.carla.id).length, 0, 'a device belongs to the last person who turned it on');
  assert.equal(ctx.store.push.forPrincipal('staff', ctx.omar.id).length, 1);
  assert.equal((await request(ctx.server).post('/push/unsubscribe').set(ctx.auth(ctx.omar)).send({ endpoint: sub(1).endpoint })).status, 204);
  assert.equal(ctx.store.push.forPrincipal('staff', ctx.omar.id).length, 0);
  assert.equal((await request(ctx.server).post('/push/subscribe').send(sub(2))).status, 401);
});

test('a portal user subscribes their device', async () => {
  const ctx = build();
  const s = await ctx.portalSession();
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/push/public-key').set(s)).body, { enabled: true, publicKey: 'BPublicVapidKeyForTests' });
  assert.equal((await request(ctx.server).post('/portal-api/client/push/subscribe').set(s).send(sub(3))).status, 201);
  const user = ctx.store.portal.listUsers(ctx.company.id)[0];
  assert.equal(ctx.store.push.forPrincipal('client', user.id).length, 1);
  assert.equal((await request(ctx.server).post('/portal-api/client/push/unsubscribe').set(s).send({ endpoint: sub(3).endpoint })).status, 204);
  assert.equal(ctx.store.push.forPrincipal('client', user.id).length, 0);
});

test('a subscription must be a real push endpoint with its keys', async () => {
  const ctx = build();
  const as = ctx.auth(ctx.carla);
  for (const bad of [{}, { endpoint: 'http://push.example/x', keys: sub(1).keys }, { endpoint: sub(1).endpoint }, { endpoint: sub(1).endpoint, keys: { p256dh: 'x' } }]) {
    assert.equal((await request(ctx.server).post('/push/subscribe').set(as).send(bad)).status, 400, JSON.stringify(bad));
  }
  const off = build({ push: false });
  assert.equal((await request(off.server).post('/push/subscribe').set(off.auth(off.carla)).send(sub(1))).status, 409, 'not set up: refused plainly');
});

test('sending reaches every device of the person; a device the push service says is gone is removed', async () => {
  const ctx = build();
  await request(ctx.server).post('/push/subscribe').set(ctx.auth(ctx.carla)).send(sub(1));
  await request(ctx.server).post('/push/subscribe').set(ctx.auth(ctx.carla)).send(sub(2));
  const sender = async (s) => ({ statusCode: s.endpoint.endsWith('/2') ? 410 : 201 });
  const delivered = await sendToPrincipal(ctx.store, sender, 'staff', ctx.carla.id, { title: 'Hello', body: 'Task due', url: '/tasks', tag: 't1' });
  assert.equal(delivered, 1);
  assert.deepEqual(ctx.store.push.forPrincipal('staff', ctx.carla.id).map((s) => s.endpoint), [sub(1).endpoint]);
  const failing = async () => { throw new Error('network down'); };
  assert.equal(await sendToPrincipal(ctx.store, failing, 'staff', ctx.carla.id, { title: 'x', body: '', url: '/', tag: 'x' }), 0, 'a network error keeps the device');
  assert.equal(ctx.store.push.forPrincipal('staff', ctx.carla.id).length, 1);
});
