const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { deviceLabel } = require('../dist/push/device-label');
const { makeTmpDir } = require('./helpers/tmp');

/** People see the devices that get their phone notifications, test one, and remove one, only ever their own. */

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';

test('device labels say which phone or computer and which browser', () => {
  assert.equal(deviceLabel(IPHONE), 'iPhone · Safari');
  assert.equal(deviceLabel(ANDROID), 'Android · Chrome');
  assert.equal(deviceLabel(MAC_CHROME), 'Mac · Chrome');
  assert.equal(deviceLabel(WIN_EDGE), 'Windows · Edge');
  assert.equal(deviceLabel('curl/8.4.0'), 'Browser');
  assert.equal(deviceLabel(null), 'Browser');
  assert.equal(deviceLabel(''), 'Browser');
});

const device = (n) => ({ endpoint: `https://push.example/send/${n}`, keys: { p256dh: 'BKey', auth: 'auth' } });

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-push-devices-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const mk = (name) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const carla = mk('Carla');
  const omar = mk('Omar');
  const sent = [];
  const send = async (s, payload) => { sent.push({ endpoint: s.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), push: { publicKey: 'BKeyForTests', send },
  }).listen(0);
  server.unref();
  const staff = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const portal = async (email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email, name: email, role: 'client_admin' });
    store.portal.acceptInvitation(token, 'correct horse battery');
    return { Authorization: `Bearer ${(await request(server).post('/portal-api/client/auth/login').send({ email, password: 'correct horse battery' })).body.token}` };
  };
  return { store, server, carla, omar, sent, staff, portal };
};

test('staff: the list shows only my devices, labelled, with the current one marked', async () => {
  const ctx = build();
  const carla = ctx.staff(ctx.carla);
  await request(ctx.server).post('/push/subscribe').set(carla).set('User-Agent', IPHONE).send(device('carla-phone')).expect(201);
  await request(ctx.server).post('/push/subscribe').set(carla).set('User-Agent', MAC_CHROME).send(device('carla-mac')).expect(201);
  await request(ctx.server).post('/push/subscribe').set(ctx.staff(ctx.omar)).set('User-Agent', ANDROID).send(device('omar-phone')).expect(201);

  const res = await request(ctx.server).get('/push/devices').query({ endpoint: device('carla-mac').endpoint }).set(carla).expect(200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(res.body.map((d) => d.label).sort(), ['Mac · Chrome', 'iPhone · Safari']);
  assert.deepEqual(res.body.map((d) => d.current).sort(), [false, true]);
  assert.equal(res.body.find((d) => d.current).label, 'Mac · Chrome');
  for (const d of res.body) {
    assert.deepEqual(Object.keys(d).sort(), ['createdAt', 'current', 'id', 'label', 'lastSentAt']);
  }
  const none = await request(ctx.server).get('/push/devices').set(carla).expect(200);
  assert.ok(none.body.every((d) => d.current === false), 'no endpoint, nothing is current');
});

test('staff: test sends exactly one push, to that device only', async () => {
  const ctx = build();
  const carla = ctx.staff(ctx.carla);
  await request(ctx.server).post('/push/subscribe').set(carla).send(device('carla-phone'));
  await request(ctx.server).post('/push/subscribe').set(carla).send(device('carla-mac'));
  const list = (await request(ctx.server).get('/push/devices').set(carla)).body;
  assert.equal(list.length, 2);
  const target = list[1];
  const res = await request(ctx.server).post(`/push/devices/${target.id}/test`).set(carla).expect(200);
  assert.equal(res.body.delivered, true);
  assert.equal(ctx.sent.length, 1);
  const row = ctx.store.push.forPrincipal('staff', ctx.carla.id).find((r) => r.id === target.id);
  assert.equal(ctx.sent[0].endpoint, row.endpoint);
  assert.ok(ctx.sent[0].title && ctx.sent[0].url && ctx.sent[0].tag);
  const after = (await request(ctx.server).get('/push/devices').set(carla)).body.find((d) => d.id === target.id);
  assert.ok(after.lastSentAt, 'marked as sent');
});

test("staff: someone else's device is 404 on test and delete, and stays", async () => {
  const ctx = build();
  await request(ctx.server).post('/push/subscribe').set(ctx.staff(ctx.omar)).send(device('omar-phone'));
  const omarDevice = ctx.store.push.forPrincipal('staff', ctx.omar.id)[0];
  const carla = ctx.staff(ctx.carla);
  await request(ctx.server).post(`/push/devices/${omarDevice.id}/test`).set(carla).expect(404);
  await request(ctx.server).delete(`/push/devices/${omarDevice.id}`).set(carla).expect(404);
  await request(ctx.server).delete('/push/devices/no-such-id').set(carla).expect(404);
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.store.push.forPrincipal('staff', ctx.omar.id).length, 1);
});

test('staff: deleting my device removes it', async () => {
  const ctx = build();
  const carla = ctx.staff(ctx.carla);
  await request(ctx.server).post('/push/subscribe').set(carla).send(device('carla-phone'));
  const [d] = (await request(ctx.server).get('/push/devices').set(carla)).body;
  await request(ctx.server).delete(`/push/devices/${d.id}`).set(carla).expect(204);
  assert.deepEqual((await request(ctx.server).get('/push/devices').set(carla)).body, []);
});

test('staff: devices need a sign-in', async () => {
  const ctx = build();
  await request(ctx.server).get('/push/devices').expect(401);
});

test('portal: the list shows only my devices; another person\'s is 404 on test and delete; test sends one push', async () => {
  const ctx = build();
  const a = await ctx.portal('buyer@alnoor.test');
  const b = await ctx.portal('owner@alnoor.test');
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(a).set('User-Agent', IPHONE).send(device('a-phone')).expect(201);
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(a).set('User-Agent', WIN_EDGE).send(device('a-pc')).expect(201);
  await request(ctx.server).post('/portal-api/client/push/subscribe').set(b).send(device('b-phone')).expect(201);
  // Staff devices never show in the portal list.
  await request(ctx.server).post('/push/subscribe').set(ctx.staff(ctx.carla)).send(device('carla-phone'));

  const list = (await request(ctx.server).get('/portal-api/client/push/devices').query({ endpoint: device('a-phone').endpoint }).set(a).expect(200)).body;
  assert.deepEqual(list.map((d) => d.label).sort(), ['Windows · Edge', 'iPhone · Safari']);
  assert.equal(list.find((d) => d.current).label, 'iPhone · Safari');

  const bList = (await request(ctx.server).get('/portal-api/client/push/devices').set(b)).body;
  assert.equal(bList.length, 1);
  await request(ctx.server).post(`/portal-api/client/push/devices/${bList[0].id}/test`).set(a).expect(404);
  await request(ctx.server).delete(`/portal-api/client/push/devices/${bList[0].id}`).set(a).expect(404);
  const carlaDevice = ctx.store.push.forPrincipal('staff', ctx.carla.id)[0];
  await request(ctx.server).post(`/portal-api/client/push/devices/${carlaDevice.id}/test`).set(a).expect(404);
  assert.equal(ctx.sent.length, 0);

  const pc = list.find((d) => d.label === 'Windows · Edge');
  const res = await request(ctx.server).post(`/portal-api/client/push/devices/${pc.id}/test`).set(a).expect(200);
  assert.equal(res.body.delivered, true);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].endpoint, device('a-pc').endpoint);
  assert.equal(ctx.sent[0].title, 'Peak Media');

  await request(ctx.server).delete(`/portal-api/client/push/devices/${pc.id}`).set(a).expect(204);
  assert.equal((await request(ctx.server).get('/portal-api/client/push/devices').set(a)).body.length, 1);
  assert.equal((await request(ctx.server).get('/portal-api/client/push/devices').set(b)).body.length, 1);
});

test('a device the push service reports gone is removed when tested', async () => {
  const dbPath = path.join(makeTmpDir('taskflow-push-devices-gone-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const u = store.createUser({ name: 'Carla', email: 'c@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy',
    push: { publicKey: 'BKeyForTests', send: async () => ({ statusCode: 410 }) },
  }).listen(0);
  server.unref();
  const auth = { Authorization: `Bearer ${store.issueToken(u.id)}` };
  await request(server).post('/push/subscribe').set(auth).send(device('old'));
  const [d] = (await request(server).get('/push/devices').set(auth)).body;
  const res = await request(server).post(`/push/devices/${d.id}/test`).set(auth).expect(200);
  assert.equal(res.body.delivered, false);
  assert.equal(res.body.removed, true);
  assert.deepEqual((await request(server).get('/push/devices').set(auth)).body, []);
});
