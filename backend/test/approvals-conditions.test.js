const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { levelsFor } = require('../dist/approvals/approvals');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Conditions other than amount (spec 2026-11-04-approvals-wave-2-design,
 * "Conditions other than amount"): a step applies only when its band and
 * every condition hold.
 */

let seq = 0;
const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-apcond-'), 'taskflow.db'), seedOnEmpty: true });
  const co = '1';
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@apcond.test`, password: 'x', role, companyIds: [co], companyRoles: [{ companyId: co, role }] });
  const legal = mk('Employee');
  const step = (conditions, extra = {}) => ({ approvers: [{ kind: 'user', id: legal.id }], need: 'any', conditions, ...extra });
  return { store, co, mk, legal, step };
};
const rule = (conditions, minAmount = 0) => ({ minAmount, maxAmount: null, approverRole: 'Admin', approvers: [{ kind: 'role', id: 'Admin' }], need: 'any', position: 0, alsoBelow: false, conditions });

test('levelsFor: "is" needs the value, "is not" passes a missing one; text matches ignore case and spaces', () => {
  const is = rule([{ field: 'category', op: 'is', values: ['Travel'] }]);
  const not = rule([{ field: 'supplier', op: 'is_not', values: ['s1'] }]);
  assert.equal(levelsFor([is], 10, { category: '  travel ' }).length, 1);
  assert.equal(levelsFor([is], 10, { category: 'Meals' }).length, 0);
  assert.equal(levelsFor([is], 10, {}).length, 0, 'no value fails "is"');
  assert.equal(levelsFor([not], 10, {}).length, 1, 'no value passes "is not"');
  assert.equal(levelsFor([not], 10, { supplier: 's1' }).length, 0);
  assert.equal(levelsFor([rule([{ field: 'category', op: 'is', values: ['Travel'] }], 100)], 10, { category: 'Travel' }).length, 0, 'the band still counts');
  assert.equal(levelsFor([rule([])], 10, {}).length, 1, 'no conditions: as before');
});

test('a vendor bill from one supplier goes to Legal; others need none', () => {
  const { store, co, step } = setup();
  const globex = store.createSupplier({ companyId: co, name: 'Globex', email: 'g@x.example' });
  const initech = store.createSupplier({ companyId: co, name: 'Initech', email: 'i@x.example' });
  store.approvals.setPolicy(co, 'vendor_bill', { steps: [step([{ field: 'supplier', op: 'is', values: [globex.id] }])] });
  const bill = (s) => store.createVendorBill({ companyId: co, vendorName: s.name, supplierId: s.id, amount: 100, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
  assert.equal(store.approvals.outcome('vendor_bill', bill(globex).id), 'pending');
  assert.equal(store.approvals.outcome('vendor_bill', bill(initech).id), 'not_required');
});

test('an expense category routes it; changing the category asks again', () => {
  const { store, co, step, mk } = setup();
  store.approvals.setPolicy(co, 'expense', { steps: [step([{ field: 'category', op: 'is', values: ['Travel'] }])] });
  const asker = mk('Employee');
  const meals = store.runAsActor({ userId: asker.id, name: asker.name }, () => store.createExpense({ companyId: co, category: 'Meals', amount: 40, expenseDate: new Date() }));
  assert.equal(store.getExpenseById(meals.id).approvalStatus, 'not_required');
  const travel = store.runAsActor({ userId: asker.id, name: asker.name }, () => store.createExpense({ companyId: co, category: 'travel', amount: 40, expenseDate: new Date() }));
  assert.equal(store.getExpenseById(travel.id).approvalStatus, 'pending');
  store.updateExpense(meals.id, { category: 'Travel' });
  assert.equal(store.getExpenseById(meals.id).approvalStatus, 'pending', 'now it is travel: asks');
});

test('a purchase order to a named supplier asks even below the old threshold', () => {
  const { store, co, step } = setup();
  const globex = store.createSupplier({ companyId: co, name: 'Globex', email: 'g2@x.example' });
  const item = store.createInventoryItem({ companyId: co, name: 'I', category: 'C', unit: 'u', unitCost: 1 });
  store.approvals.setPolicy(co, 'purchase_order', { steps: [step([{ field: 'supplier', op: 'is', values: [globex.id] }])] });
  const po = store.createPurchaseOrder({ companyId: co, supplierId: globex.id, supplierName: 'Globex', orderDate: new Date(), status: 'Draft', items: [{ inventoryItemId: item.id, description: 'I', quantity: 1, unitCost: 1 }] });
  assert.equal(po.approvalStatus, 'pending');
});

test('leave of one type goes to HR; held credit notes route by client', () => {
  const { store, co, step, mk } = setup();
  const sick = store.createLeaveType({ companyId: co, name: 'Sick', paid: true });
  const annual = store.createLeaveType({ companyId: co, name: 'Annual', paid: true });
  store.approvals.setPolicy(co, 'leave_request', { steps: [step([{ field: 'leaveType', op: 'is', values: [annual.id] }])] });
  const emp = store.createEmployee({ companyId: co, name: 'W', status: 'Active' });
  const a = store.createLeaveRequest({ companyId: co, employeeId: emp.id, leaveTypeId: annual.id, startDate: new Date('2026-12-01'), endDate: new Date('2026-12-02') });
  const s = store.createLeaveRequest({ companyId: co, employeeId: emp.id, leaveTypeId: sick.id, startDate: new Date('2026-12-03'), endDate: new Date('2026-12-03') });
  assert.equal(store.approvals.outcome('leave_request', a.id), 'pending');
  assert.equal(store.approvals.outcome('leave_request', s.id), 'not_required');

  const first = store.listClients(co)[0];
  const second = store.createClient({ companyId: co, name: 'Second client', email: 'second@apcond.test', address: 'Muscat' });
  store.approvals.setPolicy(co, 'credit_note', { steps: [step([{ field: 'client', op: 'is', values: [first.id] }])] });
  const asker = mk('Accountant');
  const credit = (client) => store.runAsActor({ userId: asker.id, name: asker.name }, () => store.requestCreditNote({ companyId: co, clientId: client.id, lineItems: [{ description: 'Goodwill', amount: 5 }] }));
  assert.ok(credit(first).hold, 'that client: held');
  assert.ok(credit(second).creditNote, 'any other client: recorded at once');
});

// ── Saving conditions ────────────────────────────────────────────────

const api = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-apcond-api-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const co = store.createCompany({ name: 'Co' });
  const other = store.createCompany({ name: 'Other' });
  const admin = store.createUser({ name: 'A', email: `a${++seq}@apcond.test`, password: 'x', role: 'Admin', companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Admin' }] });
  const put = (companyId, docType, steps) => request(server).put(`/companies/${companyId}/approvals/policies/${docType}`)
    .set('Authorization', `Bearer ${store.issueToken(admin.id)}`).send({ steps });
  return { store, server, co, other, admin, put };
};
const roleStep = (conditions, extra = {}) => ({ approvers: [{ kind: 'role', id: 'Manager' }], need: 'any', conditions, ...extra });

test('saving: fields must suit the document, ids must be this company\'s, and policies read back with conditions', async () => {
  const { store, server, co, other, put, admin } = api();
  const mine = store.createSupplier({ companyId: co.id, name: 'Mine', email: 'm@x.example' });
  const theirs = store.createSupplier({ companyId: other.id, name: 'Theirs', email: 't@x.example' });
  assert.equal((await put(co.id, 'vendor_bill', [roleStep([{ field: 'category', op: 'is', values: ['x'] }])])).status, 400, 'bills have no category');
  assert.equal((await put(co.id, 'vendor_bill', [roleStep([{ field: 'supplier', op: 'is', values: [theirs.id] }])])).status, 400, 'another company\'s supplier');
  assert.equal((await put(co.id, 'vendor_bill', [roleStep([{ field: 'supplier', op: 'is', values: [] }])])).status, 400, 'a condition needs values');
  const ok = await put(co.id, 'vendor_bill', [roleStep([{ field: 'supplier', op: 'is_not', values: [mine.id] }])]);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const read = await request(server).get(`/companies/${co.id}/approvals/policies`).set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  assert.deepEqual(read.body.vendor_bill.steps[0].conditions, [{ field: 'supplier', op: 'is_not', values: [mine.id] }]);
  server.close();
});

test('a group sign-off step takes only text conditions', async () => {
  const { store, server, co, put } = api();
  const child = store.createCompany({ name: 'Child' });
  store.setCompanyParent(child.id, co.id, null);
  const s = store.createSupplier({ companyId: co.id, name: 'S', email: 's@x.example' });
  assert.equal((await put(co.id, 'purchase_requisition', [roleStep([{ field: 'supplier', op: 'is', values: [s.id] }], { alsoBelow: true })])).status, 400);
  const ok = await put(co.id, 'purchase_requisition', [roleStep([{ field: 'department', op: 'is', values: ['IT'] }], { alsoBelow: true })]);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  server.close();
});

// ── Review fixes: a narrow policy doesn't slow down what it doesn't cover ──

test('a policy for one client: other clients\' invoices are created Sent; that client\'s must start as drafts', () => {
  const { store, co, step } = setup();
  const acme = store.listClients(co)[0];
  const other = store.createClient({ companyId: co, name: 'Other', email: 'other@apcond.test', address: 'Muscat' });
  store.approvals.setPolicy(co, 'invoice', { steps: [step([{ field: 'client', op: 'is', values: [acme.id] }])] });
  const lines = [{ description: 'W', quantity: 1, unitPrice: 10, amount: 10, itemType: 'Manual' }];
  const make = (client) => store.createInvoice({ companyId: co, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Sent', lineItems: lines });
  assert.equal(make(other).status, 'Sent');
  assert.throws(() => make(acme), (e) => e.status === 409 && e.details?.code === 'APPROVAL_REQUIRED');
});

test('a payment policy for one supplier: other suppliers\' bills are paid and marked Paid as before', () => {
  const { store, co, step } = setup();
  const globex = store.createSupplier({ companyId: co, name: 'Globex', email: 'g3@x.example' });
  const initech = store.createSupplier({ companyId: co, name: 'Initech', email: 'i3@x.example' });
  store.approvals.setPolicy(co, 'vendor_payment', { steps: [step([{ field: 'supplier', op: 'is', values: [globex.id] }])] });
  const bill = (s, status = 'Approved') => store.createVendorBill({ companyId: co, vendorName: s.name, supplierId: s.id, amount: 100, issueDate: new Date(), dueDate: new Date(), status });
  assert.equal(bill(initech, 'Paid').status, 'Paid', 'created Paid');
  assert.equal(store.updateVendorBillStatus(bill(initech).id, 'Paid').status, 'Paid', 'marked Paid');
  assert.ok(store.requestVendorPayment({ billId: bill(initech).id, amount: 10, paidAt: new Date() }).payment, 'paid at once');
  assert.ok(store.requestVendorPayment({ billId: bill(globex).id, amount: 10, paidAt: new Date() }).hold, 'Globex: held');
});
