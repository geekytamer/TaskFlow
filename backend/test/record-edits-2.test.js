const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Second audit pass: journal reversal, server-side invoice lock, and edits for
 * expenses, vendor bills, positions and work orders. Each edit keeps the
 * ledger in step and refuses records that are already history.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-edits2-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const tokenFor = (email) => store.issueToken(store.listUsers().find((u) => u.email === email).id);
  const as = (email) => (req) => req.set('Authorization', `Bearer ${tokenFor(email)}`);
  return { app, store, admin: as('admin@taskflow.com'), manager: as('samantha.b@innovatecorp.com'), other: as('dana.s@synergysolutions.com') };
}

const account = (store, code) => store.listLedgerAccounts('1').find((a) => a.code === code);
const sumBy = (entries, accountId, side) => entries.flatMap((e) => e.lines).filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);

test('a manual journal entry is reversed once, by a mirror entry; document entries and reversals are refused', async () => {
  const { app, store, manager, other } = setup();
  const cash = account(store, '1000');
  const expense = account(store, '5000');
  const entry = store.createJournalEntry({
    companyId: '1', sourceType: 'manual', memo: 'Office rent', entryDate: new Date(),
    lines: [{ accountId: expense.id, debit: 500, credit: 0 }, { accountId: cash.id, debit: 0, credit: 500 }],
  });
  assert.equal((await other(request(app).post(`/journal-entries/${entry.id}/reverse`)).send({})).status, 403, 'another company');
  const res = await manager(request(app).post(`/journal-entries/${entry.id}/reverse`)).send({ reason: 'Posted twice' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.sourceType, 'journal_reversal');
  assert.equal(res.body.sourceId, entry.id);
  assert.match(res.body.memo, /Office rent.*Posted twice/);
  const both = [store.getJournalEntryById(entry.id), store.getJournalEntryById(res.body.id)];
  assert.equal(sumBy(both, cash.id, 'debit') - sumBy(both, cash.id, 'credit'), 0, 'cash nets to zero');
  assert.equal(sumBy(both, expense.id, 'debit') - sumBy(both, expense.id, 'credit'), 0, 'expense nets to zero');

  assert.equal((await manager(request(app).post(`/journal-entries/${entry.id}/reverse`)).send({})).status, 409, 'only once');
  assert.equal((await manager(request(app).post(`/journal-entries/${res.body.id}/reverse`)).send({})).status, 409, 'not a reversal');
  const exp = store.createExpense({ companyId: '1', category: 'Fuel', amount: 40 });
  const posted = store.listJournalEntries('1').find((e) => e.sourceType === 'expense' && e.sourceId === exp.id);
  assert.equal((await manager(request(app).post(`/journal-entries/${posted.id}/reverse`)).send({})).status, 409, 'document entries change through the document');
  assert.equal((await manager(request(app).post('/journal-entries/nope/reverse')).send({})).status, 404);
});

test('a sent invoice keeps its money and parties; notes and due date can still change', async () => {
  const { app, admin } = setup();
  const created = await admin(request(app).post('/invoices')).send({
    invoiceNumber: 'INV-LOCK-1', companyId: '1', clientId: 'client-1', status: 'Sent',
    issueDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-31T00:00:00.000Z',
    lineItems: [{ itemType: 'Manual', description: 'Work', quantity: 1, unitPrice: 100, amount: 100 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  const lines = await admin(request(app).put(`/invoices/${id}`)).send({ lineItems: [{ itemType: 'Manual', description: 'Work', quantity: 2, unitPrice: 100, amount: 200 }] });
  assert.equal(lines.status, 409);
  assert.match(lines.body.message, /credit note/);
  const ok = await admin(request(app).put(`/invoices/${id}`)).send({ notes: 'Paid by transfer, ref 991', dueDate: '2026-11-15T00:00:00.000Z' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.notes, 'Paid by transfer, ref 991');
});

test('editing an expense re-posts its ledger entry; another company cannot edit it', async () => {
  const { app, store, manager, other } = setup();
  const exp = store.createExpense({ companyId: '1', category: 'Fuel', amount: 40, vendor: 'ADNOC' });
  assert.equal((await other(request(app).put(`/expenses/${exp.id}`)).send({ amount: 1 })).status, 403);
  const res = await manager(request(app).put(`/expenses/${exp.id}`)).send({ amount: 55.5, vendor: '', description: 'Two trips' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.amount, res.body.vendor, res.body.category, res.body.description], [55.5, undefined, 'Fuel', 'Two trips']);
  const entries = store.listJournalEntries('1').filter((e) => e.sourceType === 'expense' && e.sourceId === exp.id);
  assert.equal(entries.length, 1, 'one entry, not two');
  assert.equal(sumBy(entries, account(store, '5000').id, 'debit'), 55.5);
  assert.equal((await manager(request(app).put(`/expenses/${exp.id}`)).send({ amount: 0 })).status, 400);
});

test('only a draft vendor bill can be edited, within its purchase order', async () => {
  const { app, store, manager } = setup();
  const bill = store.createVendorBill({ companyId: '1', vendorName: 'Paper Co', issueDate: new Date('2026-10-01'), dueDate: new Date('2026-10-31'), amount: 300, status: 'Draft' });
  const res = await manager(request(app).put(`/vendor-bills/${bill.id}`)).send({ amount: 320, referenceInvoiceNumber: 'PC-77', notes: 'Corrected' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.amount, res.body.referenceInvoiceNumber, res.body.notes, res.body.status], [320, 'PC-77', 'Corrected', 'Draft']);
  assert.equal((await manager(request(app).put(`/vendor-bills/${bill.id}`)).send({ dueDate: '2026-09-01' })).status, 400, 'due before issue');
  store.updateVendorBillStatus(bill.id, 'Approved');
  assert.equal((await manager(request(app).put(`/vendor-bills/${bill.id}`)).send({ amount: 1 })).status, 409);
});

test('positions are renamed only by the super admin; a planned work order changes batches and expected output', async () => {
  const { app, store, manager } = setup();
  const root = store.createUser({ name: 'Root', email: 'root@x.example', role: 'Admin', companyIds: [], companyRoles: [], password: 'Password1!', isSuperAdmin: true });
  const admin = (req) => req.set('Authorization', `Bearer ${store.issueToken(root.id)}`);
  const pos = store.createPosition({ title: 'Driver' });
  assert.equal((await manager(request(app).put(`/positions/${pos.id}`)).send({ title: 'Senior driver' })).status, 403);
  const renamed = await admin(request(app).put(`/positions/${pos.id}`)).send({ title: 'Senior driver' });
  assert.deepEqual([renamed.status, renamed.body.title], [200, 'Senior driver']);

  const item = (name, onHand) => store.createInventoryItem({ companyId: '1', name, category: 'Food', unit: 'pcs', vatApplicable: true, tracksInventory: true, onHand, reorderPoint: 0, unitCost: 2, location: 'Main' });
  const out = item('Date box', 0);
  const part = item('Dates kg', 100);
  const recipe = store.createRecipe('1', { name: 'Box', outputItemId: out.id, outputQuantity: 4, components: [{ componentItemId: part.id, quantity: 1 }] });
  const wo = store.createWorkOrder('1', { recipeId: recipe.id, batches: 2 });
  const edited = await manager(request(app).put(`/work-orders/${wo.id}`)).send({ batches: 5, notes: 'Eid rush' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.deepEqual([edited.body.batches, edited.body.expectedQuantity, edited.body.notes], [5, 20, 'Eid rush']);
  store.cancelWorkOrder(wo.id);
  assert.equal((await manager(request(app).put(`/work-orders/${wo.id}`)).send({ batches: 1 })).status, 409, 'a cancelled order is history');
});
