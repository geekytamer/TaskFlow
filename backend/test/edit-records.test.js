const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-edit-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  store.createWarehouse({ companyId: '1', name: 'Main', isDefault: true });
  return { app, store, as };
}

async function supplier(app, as, name = 'Paper Co') {
  const res = await as(request(app).post('/companies/1/suppliers')).send({ name, email: `${name.replace(/\W/g, '')}@x.example` });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('an inventory item can be edited, but not its stock or cost', async () => {
  const { app, as } = setup();
  const item = (await as(request(app).post('/companies/1/inventory-items')).send({
    name: 'Paper A4', category: 'Office', unit: 'box', onHand: 4, reorderPoint: 1, unitCost: 3, salePrice: 5, location: 'Main',
  })).body;
  const res = await as(request(app).put(`/inventory-items/${item.id}`)).send({
    name: 'Paper A4 80gsm', salePrice: 6.5, reorderPoint: 3, category: 'Stationery', onHand: 999, unitCost: 0.01,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.name, 'Paper A4 80gsm');
  assert.equal(res.body.salePrice, 6.5);
  assert.equal(res.body.reorderPoint, 3);
  assert.equal(res.body.category, 'Stationery');
  assert.equal(res.body.onHand, 4, 'stock changes only through adjustments');
  assert.equal(res.body.unitCost, 3, 'cost changes only through receipts');
  const other = (await as(request(app).post('/companies/1/inventory-items')).send({ name: 'Pens', category: 'Office', unit: 'box' })).body;
  assert.equal((await as(request(app).put(`/inventory-items/${other.id}`)).send({ sku: item.sku })).status, 400, 'SKUs stay unique');
});

test('a draft purchase order can be edited and re-evaluated for approval', async () => {
  const { app, as } = setup();
  const sup = await supplier(app, as);
  const order = (await as(request(app).post('/companies/1/purchase-orders')).send({
    supplierId: sup.id, orderDate: new Date().toISOString(), status: 'Draft',
    items: [{ description: 'Paper', quantity: 2, unitCost: 10 }],
  })).body;
  const res = await as(request(app).put(`/purchase-orders/${order.id}`)).send({
    items: [{ description: 'Paper', quantity: 5, unitCost: 10 }, { description: 'Ink', quantity: 1, unitCost: 7 }], notes: 'More',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.totalAmount, 57);
  assert.equal(res.body.orderNumber, order.orderNumber);
  assert.equal(res.body.notes, 'More');

  await as(request(app).patch(`/purchase-orders/${order.id}/status`)).send({ status: 'Ordered' });
  assert.equal((await as(request(app).put(`/purchase-orders/${order.id}`)).send({ notes: 'late' })).status, 400, 'only drafts change');
});

test('a draft sales order can be edited; a confirmed one cannot', async () => {
  const { app, as } = setup();
  const order = (await as(request(app).post('/companies/1/sales-orders')).send({
    clientId: 'client-1', orderDate: new Date().toISOString(), status: 'Draft',
    items: [{ description: 'Workshop', quantity: 1, unitPrice: 100 }],
  })).body;
  const res = await as(request(app).put(`/sales-orders/${order.id}`)).send({
    items: [{ description: 'Workshop', quantity: 2, unitPrice: 100, discount: 10, discountType: 'percent' }], notes: 'Two days',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.totalAmount, 180);
  assert.equal(res.body.notes, 'Two days');
  await as(request(app).patch(`/sales-orders/${order.id}/status`)).send({ status: 'Confirmed' });
  assert.equal((await as(request(app).put(`/sales-orders/${order.id}`)).send({ notes: 'x' })).status, 400);
});

test('an awarded supplier quote becomes a purchase order linked to its RFQ, once', async () => {
  const { app, as } = setup();
  const sup = await supplier(app, as, 'Best Paper');
  const rfq = (await as(request(app).post('/companies/1/rfqs')).send({
    title: 'Paper for Q4', items: [{ description: 'Paper A4', quantity: 10, unit: 'box' }, { description: 'Toner', quantity: 2 }],
  })).body;
  const quote = (await as(request(app).post(`/rfqs/${rfq.id}/quotes`)).send({ supplierId: sup.id, supplierName: sup.name, totalAmount: 140 })).body.quotes[0];
  assert.equal((await as(request(app).post(`/rfqs/${rfq.id}/purchase-order`)).send({})).status, 400, 'award first');
  await as(request(app).post(`/rfqs/${rfq.id}/award`)).send({ quoteId: quote.id });

  const po = await as(request(app).post(`/rfqs/${rfq.id}/purchase-order`)).send({ unitCosts: [10, 20] });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  assert.equal(po.body.supplierId, sup.id);
  assert.equal(po.body.status, 'Draft');
  assert.equal(po.body.totalAmount, 140);
  assert.equal(po.body.rfqId, rfq.id);
  assert.deepEqual(po.body.items.map((i) => [i.description, i.quantity, i.unitCost]), [['Paper A4', 10, 10], ['Toner', 2, 20]]);

  const again = await as(request(app).post(`/rfqs/${rfq.id}/purchase-order`)).send({ unitCosts: [1, 1] });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, po.body.id);
  const after = (await as(request(app).get(`/rfqs/${rfq.id}`))).body;
  assert.equal(after.purchaseOrderId, po.body.id);
});

test('without unit costs, a quote total is spread by quantity and a missing supplier is refused', async () => {
  const { app, as } = setup();
  const rfq = (await as(request(app).post('/companies/1/rfqs')).send({ title: 'Chairs', items: [{ description: 'Chair', quantity: 4 }] })).body;
  const quote = (await as(request(app).post(`/rfqs/${rfq.id}/quotes`)).send({ supplierName: 'Walk-in', totalAmount: 200 })).body.quotes[0];
  await as(request(app).post(`/rfqs/${rfq.id}/award`)).send({ quoteId: quote.id });
  assert.equal((await as(request(app).post(`/rfqs/${rfq.id}/purchase-order`)).send({})).status, 400, 'needs a supplier record');
  const sup = await supplier(app, as, 'Walk-in');
  const po = await as(request(app).post(`/rfqs/${rfq.id}/purchase-order`)).send({ supplierId: sup.id });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  assert.equal(po.body.items[0].unitCost, 50);
  assert.equal(po.body.totalAmount, 200);
});

test('invoice custom column values are saved on create and edit', async () => {
  const { app, as } = setup();
  const line = { itemType: 'Manual', description: 'Printing', quantity: 1, unitPrice: 10, amount: 10, custom: { colour: 'Blue', size: 'A3' } };
  const created = await as(request(app).post('/invoices')).send({
    companyId: '1', clientId: 'client-1', issueDate: new Date().toISOString(), dueDate: new Date().toISOString(), lineItems: [line], total: 10, status: 'Draft',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual(created.body.lineItems[0].custom, { colour: 'Blue', size: 'A3' });
  const edited = await as(request(app).put(`/invoices/${created.body.id}`)).send({ lineItems: [{ ...line, custom: { colour: 'Red' } }] });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.deepEqual(edited.body.lineItems[0].custom, { colour: 'Red' });
});

test('an approved purchase order goes back for approval when its lines change, even at the same total', async () => {
  const { app, store, as } = setup();
  store.updateCompanyFinanceSettings?.('1', { poApprovalThreshold: 100 });
  const sup = await supplier(app, as, 'Approver Co');
  const order = (await as(request(app).post('/companies/1/purchase-orders')).send({
    supplierId: sup.id, orderDate: new Date().toISOString(), status: 'Draft', items: [{ description: 'Ten of A', quantity: 10, unitCost: 50 }],
  })).body;
  assert.equal(order.approvalStatus, 'pending', JSON.stringify(order));
  assert.equal((await as(request(app).post(`/purchase-orders/${order.id}/approve`)).send({})).status, 200);
  const swapped = await as(request(app).put(`/purchase-orders/${order.id}`)).send({ items: [{ description: 'Totally different', quantity: 1, unitCost: 500 }] });
  assert.equal(swapped.status, 200, JSON.stringify(swapped.body));
  assert.equal(swapped.body.approvalStatus, 'pending');
});

test('an archived item takes no stock and goes on no new purchase order', async () => {
  const { app, as } = setup();
  const item = (await as(request(app).post('/companies/1/inventory-items')).send({ name: 'Old widget', category: 'Parts', unit: 'pcs', onHand: 2, location: 'Main' })).body;
  await as(request(app).delete(`/inventory-items/${item.id}?writeOff=1`));
  const adjust = await as(request(app).post(`/companies/1/inventory-items/${item.id}/adjustments`)).send({ quantityChange: 7, location: 'Main' });
  assert.equal(adjust.status, 400);
  assert.match(adjust.body.message, /archived/i);
  const sup = await supplier(app, as, 'Old Parts Co');
  const po = await as(request(app).post('/companies/1/purchase-orders')).send({
    supplierId: sup.id, orderDate: new Date().toISOString(), items: [{ inventoryItemId: item.id, description: 'Old widget', quantity: 1, unitCost: 1 }],
  });
  assert.equal(po.status, 400);
});
