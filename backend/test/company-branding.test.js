const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-company-branding-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const authFor = (id) => `Bearer ${store.issueToken(id)}`;
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  return { app, store, admin: authFor(admin.id), manager: authFor('user-2'), employee: authFor('user-3') };
}

const peak = {
  enabled: true,
  displayName: 'Peak',
  primaryColor: '#F26A1B',
  sidebarColor: '#111111',
  font: 'tajawal',
  radius: 'sharp',
  defaultMode: 'dark',
};

test('a company admin saves its brand and every member reads it back', async () => {
  const { app, admin, employee } = setup();
  const saved = await request(app).put('/companies/1').set('Authorization', admin).send({ branding: peak });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.branding, { ...peak, primaryColor: '#f26a1b' });

  const list = await request(app).get('/companies').set('Authorization', employee);
  assert.deepEqual(list.body.find((c) => c.id === '1').branding, { ...peak, primaryColor: '#f26a1b' });
});

test('other company edits leave the brand alone, and null clears it', async () => {
  const { app, admin } = setup();
  await request(app).put('/companies/1').set('Authorization', admin).send({ branding: peak });
  const renamed = await request(app).put('/companies/1').set('Authorization', admin).send({ name: 'Peak Creative' });
  assert.equal(renamed.body.branding.displayName, 'Peak');

  const cleared = await request(app).put('/companies/1').set('Authorization', admin).send({ branding: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.branding, undefined);
});

test('only company admins change the brand', async () => {
  const { app, manager, employee } = setup();
  assert.equal((await request(app).put('/companies/1').set('Authorization', manager).send({ branding: peak })).status, 403);
  assert.equal((await request(app).put('/companies/1').set('Authorization', employee).send({ branding: peak })).status, 403);
  // A manager can still edit the details they always could.
  assert.equal((await request(app).put('/companies/1').set('Authorization', manager).send({ phone: '+968 2' })).status, 200);
});

test('bad brand values are refused, not stored', async () => {
  const { app, admin } = setup();
  for (const bad of [
    { ...peak, primaryColor: 'orange' },
    { ...peak, primaryColor: '#fff' },
    { ...peak, sidebarColor: 'url(javascript:1)' },
    { ...peak, font: 'comic-sans' },
    { ...peak, radius: 'blob' },
    { ...peak, defaultMode: 'neon' },
    { ...peak, displayName: 'x'.repeat(41) },
    'peak',
  ]) {
    const res = await request(app).put('/companies/1').set('Authorization', admin).send({ branding: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const company = await request(app).get('/companies/1').set('Authorization', admin);
  assert.equal(company.body.branding, undefined);
});
