const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { nextRun } = require('../dist/finance/recurring');
const { runDueRecurring } = require('../dist/finance/recurring-runner');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Recurring invoices and bills: due runs become documents once each, months
 * keep their day, issued invoices respect credit limits, failures are logged
 * and the schedule moves on.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-recurring-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  return { app, store, as, manager, client };
}

/** Saves a schedule as if it had been made back on `startDate` (saving runs whatever is due by today). */
async function backdated(store, as, app, body) {
  const res = await as(request(app).post('/companies/1/recurring-documents')).send({ ...body, startDate: '2099-01-01', endDate: null });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  store.db.prepare('UPDATE recurring_documents SET startDate = ?, nextRunDate = ?, endDate = ? WHERE id = ?').run(body.startDate, body.startDate, body.endDate ?? null, res.body.id);
  return store.recurring.get(res.body.id);
}

const retainer = (clientId, extra = {}) => ({
  kind: 'invoice', name: 'Monthly retainer', partyId: clientId, frequency: 'monthly', startDate: '2026-01-31', mode: 'issue', paymentTermsDays: 14,
  content: { taxRate: 5, lineItems: [{ itemType: 'Manual', description: 'Social media retainer', quantity: 1, unitPrice: 400, amount: 400 }] },
  ...extra,
});

test('monthly runs keep their day of month; weekly, quarterly and yearly step as expected', () => {
  assert.equal(nextRun('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
  assert.equal(nextRun('2026-02-28', 'monthly', '2026-01-31'), '2026-03-31', 'back to the 31st');
  assert.equal(nextRun('2028-01-31', 'monthly', '2028-01-31'), '2028-02-29', 'leap year');
  assert.equal(nextRun('2026-12-15', 'monthly', '2026-12-15'), '2027-01-15');
  assert.equal(nextRun('2026-03-30', 'weekly', '2026-03-30'), '2026-04-06');
  assert.equal(nextRun('2026-11-30', 'quarterly', '2026-08-30'), '2027-02-28');
  assert.equal(nextRun('2026-05-01', 'yearly', '2026-05-01'), '2027-05-01');
});

test('a schedule starting today creates its first document as soon as it is saved', async () => {
  const { app, store, as, client } = setup();
  const today = new Date().toISOString().slice(0, 10);
  const res = await as(request(app).post('/companies/1/recurring-documents')).send(retainer(client.id, { startDate: today, mode: 'draft' }));
  assert.equal(res.status, 201);
  assert.notEqual(res.body.nextRunDate, today, 'already moved on');
  assert.equal(store.listInvoices('1').filter((i) => i.clientId === client.id && i.status === 'Draft').length, 1);
});

test('due runs become invoices once each, issued with the schedule’s terms; reruns create nothing', async () => {
  const { app, store, as, manager, client } = setup();
  // Saved with a start in the future, so nothing runs until the clock gets there.
  const created = await as(request(app).post('/companies/1/recurring-documents')).send(retainer(client.id, { startDate: '2099-01-31' }));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  store.db.prepare("UPDATE recurring_documents SET startDate = '2026-01-31', nextRunDate = '2026-01-31' WHERE id = ?").run(created.body.id);

  const first = runDueRecurring(store, new Date('2026-03-05T08:00:00Z'));
  assert.deepEqual(first, { created: 2, held: 0, failed: 0 }, 'Jan 31 and Feb 28');
  const invoices = store.listInvoices('1').filter((i) => i.clientId === client.id).sort((a, b) => a.issueDate - b.issueDate);
  assert.equal(invoices.length, 2);
  assert.deepEqual(invoices.map((i) => i.issueDate.toISOString().slice(0, 10)), ['2026-01-31', '2026-02-28']);
  assert.equal(invoices[0].status, 'Sent');
  assert.equal(invoices[0].dueDate.toISOString().slice(0, 10), '2026-02-14');
  assert.equal(invoices[0].total, 420, '400 plus 5% VAT');

  assert.deepEqual(runDueRecurring(store, new Date('2026-03-05T08:00:00Z')), { created: 0, held: 0, failed: 0 }, 'rerun');
  assert.equal(store.recurring.get(created.body.id).nextRunDate, '2026-03-31');
  // A process that stopped after creating but before moving the schedule on (or a second server) repeats nothing.
  store.recurring.advance(created.body.id, '2026-01-31', true);
  assert.deepEqual(runDueRecurring(store, new Date('2026-03-05T08:00:00Z')), { created: 0, held: 0, failed: 0 });
  assert.equal(store.listInvoices('1').filter((i) => i.clientId === client.id).length, 2);
  assert.ok(store.listNotifications(manager.id).some((n) => n.type === 'recurring_document'), 'the owner hears about it');
});

test('an issued invoice past the credit limit is kept as a draft; a failed run is logged and the schedule moves on', async () => {
  const { app, store, as, client } = setup();
  store.updateClient(client.id, { creditLimit: 500 });
  const res = { body: await backdated(store, as, app, retainer(client.id, { startDate: '2026-01-10' })) };
  runDueRecurring(store, new Date('2026-02-20T08:00:00Z'));
  const statuses = store.listInvoices('1').filter((i) => i.clientId === client.id).sort((a, b) => a.issueDate - b.issueDate).map((i) => i.status);
  assert.deepEqual(statuses, ['Sent', 'Draft'], 'the second would owe 840 against a 500 limit');
  assert.deepEqual(store.recurring.runs(res.body.id).map((r) => r.status), ['held', 'created']);

  // February is locked: the run cannot post into it, is logged, and the next date still comes.
  const supplier = store.createSupplier({ companyId: '1', name: 'Muscat Power', email: 'p@x.example' });
  const bill = await backdated(store, as, app, {
    kind: 'bill', name: 'Electricity', partyId: supplier.id, frequency: 'monthly', startDate: '2026-02-01', mode: 'draft', content: { amount: 85 },
  });
  assert.ok(bill.id, JSON.stringify(bill));
  store.updateCompanyFinanceSettings('1', { lockedThroughDate: new Date('2026-02-10T00:00:00Z') });
  const out = runDueRecurring(store, new Date('2026-02-20T08:00:00Z'));
  assert.equal(out.failed, 1);
  assert.equal(store.recurring.runs(bill.id)[0].status, 'failed');
  assert.match(store.recurring.runs(bill.id)[0].message, /lock|closed|period/i);
  assert.equal(store.recurring.get(bill.id).nextRunDate, '2026-03-01');
});

test('bills are created approved in issue mode; an end date stops the schedule; validation and company checks hold', async () => {
  const { app, store, as, client } = setup();
  const supplier = store.createSupplier({ companyId: '1', name: 'Office Landlord', email: 'l@x.example' });
  const rent = await backdated(store, as, app, {
    kind: 'bill', name: 'Office rent', partyId: supplier.id, frequency: 'monthly', startDate: '2026-01-01', endDate: '2026-02-15', mode: 'issue', content: { amount: 600, taxRate: 0 },
  });
  runDueRecurring(store, new Date('2026-06-01T08:00:00Z'));
  const bills = store.listVendorBills('1').filter((b) => b.supplierId === supplier.id);
  assert.equal(bills.length, 2, 'Jan and Feb only');
  assert.ok(bills.every((b) => b.status === 'Approved' && b.amount === 600));
  assert.equal(store.recurring.get(rent.id).active, false, 'ended');

  const bad = (body) => as(request(app).post('/companies/1/recurring-documents')).send(body);
  assert.equal((await bad(retainer(client.id, { content: { lineItems: [] } }))).status, 400);
  assert.equal((await bad(retainer(client.id, { endDate: '2025-12-31' }))).status, 400);
  assert.equal((await bad(retainer(supplier.id))).status, 400, 'an invoice needs a client');
  const other = store.listUsers().find((u) => u.email === 'dana.s@synergysolutions.com');
  const foreign = await request(app).put(`/recurring-documents/${rent.id}`).set('Authorization', `Bearer ${store.issueToken(other.id)}`).send({ name: 'Mine now' });
  assert.equal(foreign.status, 403);

  const paused = await as(request(app).put(`/recurring-documents/${rent.id}`)).send({ active: false, name: 'Office rent (old lease)' });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.name, 'Office rent (old lease)');
  assert.equal((await as(request(app).delete(`/recurring-documents/${rent.id}`))).status, 204);
  assert.equal(store.recurring.runs(rent.id).length, 0, 'its run log goes with it');
});
