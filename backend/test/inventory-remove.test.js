const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-invrm-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  store.createWarehouse({ companyId: '1', name: 'Main' });
  return { app, as, store };
}

async function item(app, as, onHand = 0) {
  const res = await as(request(app).post('/companies/1/inventory-items')).send({
    name: `Widget ${Math.random()}`, category: 'Testing', unit: 'pcs', onHand, reorderPoint: 0, unitCost: 2, location: 'Main',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const listed = async (app, as, query = '') => (await as(request(app).get(`/companies/1/inventory-items${query}`))).body.map((i) => i.id);

test('an item nothing ever touched is deleted outright', async () => {
  const { app, as } = setup();
  const fresh = await item(app, as, 0);
  const res = await as(request(app).delete(`/inventory-items/${fresh.id}`));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.outcome, 'deleted');
  assert.equal((await as(request(app).get(`/companies/1/inventory-items?archived=include`))).body.some((i) => i.id === fresh.id), false);
});

test('an item with stock asks before writing it off, then archives with the history kept', async () => {
  const { app, as, store } = setup();
  const stocked = await item(app, as, 12);
  const blocked = await as(request(app).delete(`/inventory-items/${stocked.id}`));
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'HAS_STOCK');
  assert.match(blocked.body.message, /12/);

  const res = await as(request(app).delete(`/inventory-items/${stocked.id}?writeOff=1`));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.outcome, 'archived');
  const kept = store.getInventoryItemById(stocked.id);
  assert.equal(kept.onHand, 0);
  assert.ok(kept.archivedAt);
  const movements = store.db.prepare('SELECT quantityChange FROM stock_movements WHERE inventoryItemId = ?').all(stocked.id);
  assert.ok(movements.some((m) => m.quantityChange === -12), 'the write-off is on record');

  assert.equal((await listed(app, as)).includes(stocked.id), false, 'hidden from the everyday list');
  assert.equal((await listed(app, as, '?archived=only')).includes(stocked.id), true);
  const restored = await as(request(app).post(`/inventory-items/${stocked.id}/restore`));
  assert.equal(restored.status, 200);
  assert.equal(restored.body.archivedAt, undefined);
  assert.equal((await listed(app, as)).includes(stocked.id), true);
});

test('an item with history but no stock is archived, not refused', async () => {
  const { app, as } = setup();
  const used = await item(app, as, 5);
  const out = await as(request(app).post(`/companies/1/inventory-items/${used.id}/adjustments`)).send({ quantityChange: -5, note: 'used up' });
  assert.ok(out.status < 300, JSON.stringify(out.body));
  const res = await as(request(app).delete(`/inventory-items/${used.id}`));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.outcome, 'archived');
});

test('an archived item cannot go on a new sales order', async () => {
  const { app, as } = setup();
  const used = await item(app, as, 3);
  await as(request(app).delete(`/inventory-items/${used.id}?writeOff=1`));
  const order = await as(request(app).post('/companies/1/sales-orders')).send({
    clientId: 'client-1', orderDate: new Date().toISOString(),
    items: [{ inventoryItemId: used.id, description: 'Widget', quantity: 1, unitPrice: 5 }],
  });
  assert.equal(order.status, 400);
  assert.match(order.body.message, /archived/i);
});
