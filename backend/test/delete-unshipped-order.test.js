const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-del-order-'), 'taskflow.db');
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

/** Peak's case: an accepted quote became a confirmed order with a pending delivery. */
async function quoteToOrderWithDelivery({ app, store, as }) {
  const item = store.createInventoryItem({ companyId: '1', name: 'Gift box', category: 'Dates', unit: 'box', unitCost: 12, onHand: 50 });
  const quote = (await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ inventoryItemId: item.id, description: 'Gift box', quantity: 4, unitPrice: 20 }],
  })).body;
  assert.equal((await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' })).status, 200);
  const order = (await as(request(app).post(`/quotations/${quote.id}/sales-order`)).send({})).body;
  const delivery = (await as(request(app).post(`/sales-orders/${order.id}/deliveries`)).send({ items: [{ salesOrderLineIndex: 0, quantity: 4 }] }));
  assert.equal(delivery.status, 201, JSON.stringify(delivery.body));
  return { item, quote, order, delivery: delivery.body };
}

test('an order whose delivery never shipped is deleted with it, and then its quote can go', async () => {
  const ctx = setup();
  const { app, store, as } = ctx;
  const { item, quote, order, delivery } = await quoteToOrderWithDelivery(ctx);

  const res = await as(request(app).delete(`/sales-orders/${order.id}`));
  assert.ok(res.status === 200 || res.status === 204, JSON.stringify(res.body));
  assert.equal(store.getSalesOrderById(order.id), undefined);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM deliveries WHERE id = ?').get(delivery.id).n, 0);
  assert.equal(store.getInventoryItemById(item.id).onHand, 50, 'a pending delivery never moved stock');
  const events = store.db.prepare("SELECT summary FROM activity_events WHERE entityType = 'delivery' AND entityId = ? AND action = 'deleted'").all(delivery.id);
  assert.equal(events.length, 1);

  // The quote is released and can now be deleted too.
  assert.equal(store.getQuotationById(quote.id).salesOrderId, undefined);
  const gone = await as(request(app).delete(`/quotations/${quote.id}`));
  assert.equal(gone.status, 204, JSON.stringify(gone.body));
});

test('an order whose delivery shipped keeps its history', async () => {
  const ctx = setup();
  const { app, store, as } = ctx;
  const { order, delivery } = await quoteToOrderWithDelivery(ctx);
  assert.equal((await as(request(app).patch(`/deliveries/${delivery.id}/status`)).send({ status: 'Shipped' })).status, 200);
  const refused = await as(request(app).delete(`/sales-orders/${order.id}`));
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.match(refused.body.error ?? refused.body.message ?? JSON.stringify(refused.body), /already shipped/);
  assert.ok(store.getSalesOrderById(order.id));

  // Shipped then cancelled still moved stock once: it keeps the order too.
  assert.equal((await as(request(app).patch(`/deliveries/${delivery.id}/status`)).send({ status: 'Cancelled' })).status, 200);
  assert.equal((await as(request(app).delete(`/sales-orders/${order.id}`))).status, 409);
});
