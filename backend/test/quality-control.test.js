const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Quality control: batches of an item that needs QC arrive in quarantine and
 * cannot ship until an inspection passes them; a failed one rejects the batch.
 * Shipping takes stock from batches earliest-expiry first and records which,
 * so a batch can be traced to its customers; cancelling gives units back.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-qc-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  store.createWarehouse({ companyId: '1', name: 'Cold store' });
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  const supplier = store.createSupplier({ companyId: '1', name: 'Nakheel Farms', email: 'n@x.example' });
  return { app, store, as, client, supplier };
}

async function orderAndDeliver(app, as, clientId, itemId, qty) {
  const order = (await as(request(app).post('/companies/1/sales-orders')).send({ clientId, orderDate: new Date().toISOString(), status: 'Confirmed', items: [{ inventoryItemId: itemId, description: 'Frozen fries 2.5kg', quantity: qty, unitPrice: 4 }] })).body;
  const delivery = (await as(request(app).post(`/sales-orders/${order.id}/deliveries`)).send({ items: [{ salesOrderLineIndex: 0, quantity: qty, location: 'Cold store' }] })).body;
  assert.ok(delivery.id, JSON.stringify(delivery));
  return { order, delivery, ship: () => as(request(app).patch(`/deliveries/${delivery.id}/status`)).send({ status: 'Shipped' }) };
}

test('a quarantined batch cannot ship until it passes inspection; shipping draws earliest expiry first and is traceable', async () => {
  const { app, store, as, client, supplier } = setup();
  const item = (await as(request(app).post('/companies/1/inventory-items')).send({ name: 'Frozen fries 2.5kg', category: 'Frozen', unit: 'bag', unitCost: 2, requiresQc: true })).body;
  assert.equal(item.requiresQc, true, JSON.stringify(item));
  const receive = (lotNumber, quantity, expiryDate) => store.createInventoryLot({ companyId: '1', inventoryItemId: item.id, lotNumber, quantity, location: 'Cold store', expiryDate, supplierId: supplier.id });
  const late = receive('FF-LATE', 30, '2027-06-30');
  const early = receive('FF-EARLY', 20, '2027-01-31');
  assert.equal(store.getInventoryLotById(early.id).status, 'Quarantine');

  const first = await orderAndDeliver(app, as, client.id, item.id, 25);
  const blocked = await first.ship();
  assert.equal(blocked.status, 400, JSON.stringify(blocked.body));
  assert.match(blocked.body.message, /passed QC/);
  assert.equal(store.getInventoryItemById(item.id).onHand, 50, 'nothing moved');

  const inspect = (lotId, pass) => as(request(app).post(`/inventory-lots/${lotId}/inspections`)).send({
    stage: 'incoming', notes: 'Core temperature', checks: [{ name: 'Core temperature', expected: '≤ -18 °C', actual: pass ? '-21 °C' : '-9 °C', pass }, { name: 'Packaging intact', pass: true }],
  });
  const passed = await inspect(early.id, true);
  assert.equal(passed.status, 201, JSON.stringify(passed.body));
  assert.equal(passed.body.inspection.result, 'pass');
  assert.equal(passed.body.lot.status, 'Active');
  assert.equal((await first.ship()).status, 400, 'only 20 released, 25 on the delivery');
  await inspect(late.id, true);
  const shipped = await first.ship();
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body));
  assert.equal(store.getInventoryLotById(early.id).quantity, 0, 'the earlier expiry went first');
  assert.equal(store.getInventoryLotById(early.id).status, 'Depleted');
  assert.equal(store.getInventoryLotById(late.id).quantity, 25);

  const trace = (await as(request(app).get(`/inventory-lots/${late.id}/trace`))).body;
  assert.equal(trace.supplier.name, 'Nakheel Farms');
  assert.equal(trace.inspections.length, 1);
  assert.deepEqual(trace.shipments.map((s) => [s.deliveryNumber, s.quantity, s.clientName]), [[first.delivery.deliveryNumber, 5, 'Al Noor Hotel']]);
  assert.ok(trace.movements.some((m) => m.type === 'Receipt' && m.quantity === 30));

  // Cancelling the shipment gives the batches their units back.
  assert.equal((await as(request(app).post(`/deliveries/${first.delivery.id}/cancel`)).send({ reason: 'Truck broke down' })).status, 200);
  assert.equal(store.getInventoryLotById(early.id).quantity, 20);
  assert.equal(store.getInventoryLotById(early.id).status, 'Active');
  assert.equal(store.getInventoryLotById(late.id).quantity, 30);
  assert.equal((await as(request(app).get(`/inventory-lots/${late.id}/trace`))).body.shipments.length, 0);
});

test('a failed inspection rejects the batch for good; items without QC ship as before', async () => {
  const { app, store, as, client } = setup();
  const qcItem = (await as(request(app).post('/companies/1/inventory-items')).send({ name: 'Frozen okra 1kg', category: 'Frozen', unit: 'bag', unitCost: 1, requiresQc: true })).body;
  const lot = store.createInventoryLot({ companyId: '1', inventoryItemId: qcItem.id, lotNumber: 'OK-1', quantity: 10, location: 'Cold store' });
  const failed = await as(request(app).post(`/inventory-lots/${lot.id}/inspections`)).send({ checks: [{ name: 'Thawed and refrozen', pass: false }] });
  assert.equal(failed.body.lot.status, 'Rejected');
  assert.equal((await as(request(app).post(`/inventory-lots/${lot.id}/inspections`)).send({ checks: [{ name: 'Second look', pass: true }] })).status, 409, 'no second chance');
  assert.equal((await as(request(app).post(`/inventory-lots/${lot.id}/inspections`)).send({ checks: [] })).status, 400);
  const { ship } = await orderAndDeliver(app, as, client.id, qcItem.id, 2);
  assert.equal((await ship()).status, 400, 'rejected stock never ships');

  const plain = (await as(request(app).post('/companies/1/inventory-items')).send({ name: 'Dates 1kg', category: 'Dates', unit: 'box', unitCost: 1 })).body;
  store.createInventoryLot({ companyId: '1', inventoryItemId: plain.id, lotNumber: 'D-1', quantity: 10, location: 'Cold store' });
  assert.equal(store.listInventoryLots('1', plain.id)[0].status, 'Active', 'no quarantine without QC');
  const plainDelivery = await orderAndDeliver(app, as, client.id, plain.id, 4);
  assert.equal((await plainDelivery.ship()).status, 200);
  assert.equal(store.listInventoryLots('1', plain.id)[0].quantity, 6, 'batch balances follow shipments now');
});
