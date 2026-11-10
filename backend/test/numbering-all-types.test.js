const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-numbering-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  return { app, store, as };
}

test('every row on the numbering page can be saved', async () => {
  const { app, as } = setup();
  const listed = (await as(request(app).get('/companies/1/numbering-settings'))).body;
  assert.ok(listed.some((s) => s.entityType === 'quotation'));
  for (const setting of listed) {
    const res = await as(request(app).put(`/companies/1/numbering-settings/${setting.entityType}`)).send({ nextNumber: setting.nextNumber + 100 });
    assert.equal(res.status, 200, `${setting.entityType}: ${JSON.stringify(res.body)}`);
  }
});

test('quotes start from the saved number (Peak: start at 500)', async () => {
  const { app, as } = setup();
  const saved = await as(request(app).put('/companies/1/numbering-settings/quotation')).send({ nextNumber: 500 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.sample, 'QT-0500');
  const quote = (await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ description: 'Logo design', quantity: 1, unitPrice: 120 }],
  })).body;
  assert.equal(quote.quoteNumber, 'QT-0500');
});
