const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** Staff notifications reach the phone too, per category, never from a practice company. */

const tick = () => new Promise((r) => setTimeout(r, 20));
const device = { endpoint: 'https://push.example/send/carla', keys: { p256dh: 'BKey', auth: 'auth' } };

const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-push-staff-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const carla = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const sent = [];
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy',
    push: { publicKey: 'BKeyForTests', send: async (s, payload) => { sent.push(JSON.parse(payload)); return { statusCode: 201 }; } },
  }).listen(0);
  server.unref();
  const auth = { Authorization: `Bearer ${store.issueToken(carla.id)}` };
  await request(server).post('/push/subscribe').set(auth).send(device);
  const notify = () => store.notify({ companyId: company.id, userIds: [carla.id], type: 'task_assigned', title: 'You were assigned "Shoot the reel"', link: '/tasks?task=1', entityType: 'task', entityId: 't1' });
  return { store, server, company, carla, auth, sent, notify };
};

test('a notification goes to the phone with its title and link', async () => {
  const ctx = await build();
  assert.equal(ctx.notify().length, 1);
  await tick();
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].title, 'You were assigned "Shoot the reel"');
  assert.equal(ctx.sent[0].url, '/tasks?task=1');
  assert.ok(ctx.sent[0].tag);
});

test('with push off for a category, nothing goes to the phone but the notification is still there', async () => {
  const ctx = await build();
  const prefs = (await request(ctx.server).get('/notifications/preferences').set(ctx.auth)).body;
  assert.equal(prefs.tasks.push, true, 'on by default');
  const off = await request(ctx.server).put('/notifications/preferences').set(ctx.auth).send({ ...prefs, tasks: { ...prefs.tasks, push: false } });
  assert.equal(off.body.tasks.push, false);
  assert.equal(off.body.tasks.inApp, true);
  assert.equal(ctx.notify().length, 1, 'still created in the app');
  await tick();
  assert.deepEqual(ctx.sent, []);
});

test('a practice company never pushes', async () => {
  const ctx = await build();
  ctx.store.academy.markTraining(ctx.company.id, ctx.carla.id);
  ctx.notify();
  await tick();
  assert.deepEqual(ctx.sent, []);
});
