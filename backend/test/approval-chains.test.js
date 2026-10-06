const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Approval chains: levels by amount and role, approved in order, by different
 * people; a rejection stops the document; expenses above a level post only
 * once approved; no rules means no change.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-approvals-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const mk = (role, email) => store.createUser({ name: `${role} ${email}`, email, password: 'Password1!', role, companyIds: ['1'], companyRoles: [{ companyId: '1', role }] });
  const as = (u) => (req) => req.set('Authorization', `Bearer ${store.issueToken(u.id)}`);
  const admin = mk('Admin', 'boss@x.example');
  const manager = mk('Manager', 'mgr@x.example');
  const manager2 = mk('Manager', 'mgr2@x.example');
  const accountant = mk('Accountant', 'acc@x.example');
  const supplier = store.createSupplier({ companyId: '1', name: 'Nakheel Farms', email: 'n@x.example' });
  const item = store.createInventoryItem({ companyId: '1', name: 'Dates 1kg', category: 'Dates', unit: 'box', unitCost: 1 });
  return { app, store, as, admin, manager, manager2, accountant, supplier, item };
}

const po = (supplierId, itemId, qty) => ({ supplierId, orderDate: new Date().toISOString(), status: 'Draft', items: [{ inventoryItemId: itemId, description: 'Dates 1kg', quantity: qty, unitCost: 100 }] });

test('a large purchase order needs every level its amount reaches, in order, by different people', async () => {
  const { app, store, as, admin, manager, manager2, accountant, supplier, item } = setup();
  assert.equal((await as(manager)(request(app).put('/companies/1/approvals/rules')).send({ docType: 'purchase_order', rules: [] })).status, 403, 'only an administrator sets rules');
  const set = await as(admin)(request(app).put('/companies/1/approvals/rules')).send({ docType: 'purchase_order', rules: [{ minAmount: 1000, approverRole: 'Manager' }, { minAmount: 10000, approverRole: 'Admin' }] });
  assert.equal(set.status, 200, JSON.stringify(set.body));

  const small = (await as(manager)(request(app).post('/companies/1/purchase-orders')).send(po(supplier.id, item.id, 5))).body;
  assert.equal(small.approvalStatus, 'not_required', '500 is under every level');
  const big = (await as(manager)(request(app).post('/companies/1/purchase-orders')).send(po(supplier.id, item.id, 150))).body;
  assert.equal(big.approvalStatus, 'pending');
  assert.deepEqual(store.approvals.steps('purchase_order', big.id).map((s) => s.approverRole), ['Manager', 'Admin']);

  const decide = (u, decision) => as(u)(request(app).post(`/approvals/purchase_order/${big.id}/decision`)).send({ decision });
  assert.equal((await decide(accountant, 'approve')).status, 409, 'level 1 needs a manager');
  assert.equal((await as(manager2)(request(app).get('/companies/1/approvals'))).body.length, 1, "it is in a manager's inbox");
  const first = await decide(manager2, 'approve');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.approvalStatus, 'pending', 'one level to go');
  assert.equal((await as(manager2)(request(app).get('/companies/1/approvals'))).body.length, 0, 'the next level is not for managers');
  assert.equal((await decide(manager, 'approve')).status, 409, 'level 2 needs an admin');
  assert.equal((await as(admin)(request(app).get('/companies/1/approvals'))).body.length, 1);
  const done = await decide(admin, 'approve');
  assert.equal(done.body.approvalStatus, 'approved');
  assert.equal(done.body.approvedBy, admin.name);
  assert.equal((await decide(admin, 'approve')).status, 409, 'nothing left');
});

test('one person cannot approve two levels; a rejection stops the document; editing restarts the chain', async () => {
  const { app, store, as, admin, manager, supplier, item } = setup();
  await as(admin)(request(app).put('/companies/1/approvals/rules')).send({ docType: 'purchase_order', rules: [{ minAmount: 1000, approverRole: 'Manager' }, { minAmount: 5000, approverRole: 'Admin' }] });
  const order = (await as(manager)(request(app).post('/companies/1/purchase-orders')).send(po(supplier.id, item.id, 60))).body;
  assert.equal((await as(admin)(request(app).post(`/approvals/purchase_order/${order.id}/decision`)).send({ decision: 'approve' })).status, 200, 'an admin may act for the manager level');
  const twice = await as(admin)(request(app).post(`/approvals/purchase_order/${order.id}/decision`)).send({ decision: 'approve' });
  assert.equal(twice.status, 409);
  assert.match(twice.body.message, /someone else/);

  // The legacy approve button routes through the chain too.
  const other = (await as(manager)(request(app).post('/companies/1/purchase-orders')).send(po(supplier.id, item.id, 20))).body;
  const rejected = await as(manager)(request(app).post(`/purchase-orders/${other.id}/reject`)).send({ reason: 'Wrong supplier' });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.approvalStatus, 'rejected');
  assert.equal(rejected.body.rejectionReason, 'Wrong supplier');

  // Changing the lines starts again from level 1.
  const edited = await as(manager)(request(app).put(`/purchase-orders/${order.id}`)).send({ items: po(supplier.id, item.id, 70).items });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const restarted = store.approvals.steps('purchase_order', order.id);
  assert.deepEqual(restarted.map((s) => s.status), ['pending', 'pending'], 'earlier sign-offs were for something else');
  assert.equal(edited.body.approvalStatus, 'pending');
});

test('an expense above a level waits unposted until approved; without rules nothing changes', async () => {
  const { app, store, as, admin, manager, accountant } = setup();
  const posted = (id) => store.listJournalEntries('1', 10000).some((e) => e.sourceType === 'expense' && e.sourceId === id);
  const before = (await as(accountant)(request(app).post('/companies/1/expenses')).send({ category: 'Fuel', amount: 900 })).body;
  assert.equal(before.approvalStatus, 'not_required');
  assert.ok(posted(before.id), 'no rules: posted at once, as before');

  await as(admin)(request(app).put('/companies/1/approvals/rules')).send({ docType: 'expense', rules: [{ minAmount: 500, approverRole: 'Manager' }] });
  const small = (await as(accountant)(request(app).post('/companies/1/expenses')).send({ category: 'Stationery', amount: 40 })).body;
  assert.ok(posted(small.id), 'under the level');
  const big = (await as(accountant)(request(app).post('/companies/1/expenses')).send({ category: 'Generator repair', amount: 750 })).body;
  assert.equal(big.approvalStatus, 'pending');
  assert.ok(!posted(big.id), 'not in the books yet');
  const ok = await as(manager)(request(app).post(`/approvals/expense/${big.id}/decision`)).send({ decision: 'approve' });
  assert.equal(ok.body.approvalStatus, 'approved', JSON.stringify(ok.body));
  assert.ok(posted(big.id), 'posted once approved');

  const refused = (await as(accountant)(request(app).post('/companies/1/expenses')).send({ category: 'Team dinner', amount: 600 })).body;
  await as(manager)(request(app).post(`/approvals/expense/${refused.id}/decision`)).send({ decision: 'reject', note: 'Not budgeted' });
  assert.equal(store.getExpenseById(refused.id).approvalStatus, 'rejected');
  assert.ok(!posted(refused.id), 'a rejected expense never posts');
});
