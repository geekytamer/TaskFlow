const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { sweepShipments } = require('../dist/logistics/shipments');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Shipments: a document checklist by direction and mode, statuses that only
 * move forward, clearing only with every document in, and reminders for
 * overdue arrivals and missing paperwork.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-ship-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  return { app, store, as, manager };
}

test('an import by sea gets the usual papers; it clears only when they are all in; statuses only move forward', async () => {
  const { app, as } = setup();
  const created = await as(request(app).post('/companies/1/shipments')).send({
    direction: 'import', mode: 'sea', carrier: 'Maersk', containers: 'mscu1234567, MSCU7654321', origin: 'Rotterdam', destination: 'Sohar', etd: '2026-09-01', eta: '2026-09-25',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const s = created.body;
  assert.equal(s.reference, 'SHP-0001');
  assert.deepEqual(s.containers, ['MSCU1234567', 'MSCU7654321']);
  assert.deepEqual(s.documents.map((d) => d.name), ['Bill of lading', 'Commercial invoice', 'Packing list', 'Certificate of origin', 'Health certificate', 'Customs declaration']);
  assert.equal((await as(request(app).post('/companies/1/shipments')).send({ direction: 'export', mode: 'air', etd: '2026-09-10', eta: '2026-09-09' })).status, 400, 'arrival before departure');

  const move = (status) => as(request(app).post(`/shipments/${s.id}/status`)).send({ status });
  assert.equal((await move('arrived')).status, 200, 'logged on arrival: steps may be skipped forward');
  const blocked = await move('cleared');
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /Still missing: Bill of lading, .*Customs declaration/);
  assert.equal((await move('in_transit')).status, 409, 'never backward');

  // The health certificate does not apply (no food); the rest arrive.
  const docs = s.documents.filter((d) => d.name !== 'Health certificate').map((d) => ({ name: d.name, received: true }));
  const edited = await as(request(app).put(`/shipments/${s.id}`)).send({ documents: docs });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.ok(edited.body.documents.every((d) => d.received && d.receivedAt));
  assert.equal((await move('cleared')).status, 200);
  assert.equal((await move('cancelled')).status, 409, 'a cleared shipment is not cancelled');
  assert.equal((await move('delivered')).body.status, 'delivered');
  assert.equal((await as(request(app).put(`/shipments/${s.id}`)).send({ notes: 'late edit' })).status, 409);
  assert.equal((await as(request(app).delete(`/shipments/${s.id}`))).status, 409);
});

test('overdue arrivals and missing papers near arrival are flagged once a day', async () => {
  const { app, store, as, manager } = setup();
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const inTwoDays = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  const late = (await as(request(app).post('/companies/1/shipments')).send({ direction: 'import', mode: 'air', etd: yesterday, eta: yesterday })).body;
  await as(request(app).post(`/shipments/${late.id}/status`)).send({ status: 'in_transit' });
  const soon = (await as(request(app).post('/companies/1/shipments')).send({ direction: 'export', mode: 'land', eta: inTwoDays })).body;
  assert.ok(soon.documents.some((d) => d.name === 'Road consignment note (CMR)'));
  const far = (await as(request(app).post('/companies/1/shipments')).send({ direction: 'import', mode: 'sea', eta: '2099-01-01' })).body;

  const due = () => store.listNotifications(manager.id).filter((n) => n.type === 'shipment_due');
  sweepShipments(store);
  const titles = due().map((n) => n.title);
  assert.ok(titles.some((t) => t.startsWith(`${late.reference} was due`)), titles.join(' | '));
  assert.ok(titles.some((t) => t.startsWith(`${soon.reference}: 6 document(s) still missing`)), titles.join(' | '));
  assert.ok(!titles.some((t) => t.startsWith(far.reference)), 'far away: nothing yet');
  const count = due().length;
  sweepShipments(store);
  assert.equal(due().length, count, 'not twice in a day');

  const other = store.listUsers().find((u) => u.email === 'dana.s@synergysolutions.com');
  assert.equal((await request(app).put(`/shipments/${far.id}`).set('Authorization', `Bearer ${store.issueToken(other.id)}`).send({ notes: 'x' })).status, 403);
});
