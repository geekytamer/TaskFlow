const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { excursionOf, sweepOverdueReadings } = require('../dist/inventory/cold-chain');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Cold-chain monitoring: a reading outside a store's range is an excursion
 * that alerts inventory managers with the batches at risk; a monitored store
 * without a recent reading is flagged once per interval.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-cold-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  const freezer = store.createWarehouse({ companyId: '1', name: 'Freezer 1' });
  return { app, store, as, manager, freezer };
}

test('readings outside the range are excursions', () => {
  const c = { tempMin: -25, tempMax: -18, humidityMax: 90 };
  assert.equal(excursionOf(c, -20, null), null);
  assert.match(excursionOf(c, -12, null), /above the maximum of -18/);
  assert.match(excursionOf(c, -30, null), /below the minimum/);
  assert.match(excursionOf(c, -20, 95), /humidity 95% is above 90%/);
});

test('an excursion is recorded and alerts managers with the batches stored there', async () => {
  const { app, store, as, manager, freezer } = setup();
  assert.equal((await as(request(app).post(`/warehouses/${freezer.id}/readings`)).send({ temperature: -20 })).status, 409, 'set the conditions first');
  const set = await as(request(app).put(`/warehouses/${freezer.id}/storage`)).send({ tempMin: -25, tempMax: -18, readingIntervalHours: 6 });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal((await as(request(app).put(`/warehouses/${freezer.id}/storage`)).send({ tempMin: -10, tempMax: -20 })).status, 400);

  const item = store.createInventoryItem({ companyId: '1', name: 'Frozen fries 2.5kg', category: 'Frozen', unit: 'bag', unitCost: 2 });
  store.createInventoryLot({ companyId: '1', inventoryItemId: item.id, lotNumber: 'FF-77', quantity: 40, location: 'Freezer 1' });

  const ok = await as(request(app).post(`/warehouses/${freezer.id}/readings`)).send({ temperature: -21.5 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.excursion, false);
  const before = store.listNotifications(manager.id).filter((n) => n.type === 'storage_excursion').length;
  const warm = await as(request(app).post(`/warehouses/${freezer.id}/readings`)).send({ temperature: -9, note: 'Door left open' });
  assert.equal(warm.body.excursion, true);
  const alerts = store.listNotifications(manager.id).filter((n) => n.type === 'storage_excursion');
  assert.equal(alerts.length, before + 1);
  assert.match(alerts[0].title, /Freezer 1: -9 °C is above the maximum of -18 °C/);
  assert.match(alerts[0].body, /FF-77/);

  const view = (await as(request(app).get(`/warehouses/${freezer.id}/storage`))).body;
  assert.equal(view.readings.length, 2);
  assert.equal(view.readings[0].note, 'Door left open');
  assert.equal((await as(request(app).post(`/warehouses/${freezer.id}/readings`)).send({ temperature: -20, recordedAt: '2099-01-01T00:00:00Z' })).status, 400, 'not in the future');

  const other = store.listUsers().find((u) => u.email === 'dana.s@synergysolutions.com');
  assert.equal((await request(app).get(`/warehouses/${freezer.id}/storage`).set('Authorization', `Bearer ${store.issueToken(other.id)}`)).status, 403);
});

test('a monitored store without a recent reading is flagged once per interval; unmonitored stores never', async () => {
  const { app, store, as, manager, freezer } = setup();
  store.createWarehouse({ companyId: '1', name: 'Dry store' });
  await as(request(app).put(`/warehouses/${freezer.id}/storage`)).send({ tempMin: -25, tempMax: -18, readingIntervalHours: 6 });
  const reminders = () => store.listNotifications(manager.id).filter((n) => n.type === 'storage_reading_due').length;
  const start = reminders();
  sweepOverdueReadings(store);
  assert.equal(reminders(), start + 1, 'no reading yet');
  sweepOverdueReadings(store);
  assert.equal(reminders(), start + 1, 'not twice within the interval');

  // A store read an hour ago is not overdue.
  const chiller = store.createWarehouse({ companyId: '1', name: 'Chiller' });
  await as(request(app).put(`/warehouses/${chiller.id}/storage`)).send({ tempMin: 0, tempMax: 4, readingIntervalHours: 6 });
  await as(request(app).post(`/warehouses/${chiller.id}/readings`)).send({ temperature: 2, recordedAt: new Date(Date.now() - 3600_000).toISOString() });
  sweepOverdueReadings(store);
  assert.ok(!store.listNotifications(manager.id).some((n) => n.type === 'storage_reading_due' && n.entityId === chiller.id), 'a fresh reading');

  await as(request(app).put(`/warehouses/${freezer.id}/storage`)).send({ monitored: false });
  await as(request(app).put(`/warehouses/${chiller.id}/storage`)).send({ monitored: false });
  assert.equal(sweepOverdueReadings(store, new Date(Date.now() + 30 * 3600_000)), 0, 'no longer monitored');
});
