const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Group sign-off: a group's step marked "also for every company below" runs
 * after a company's own steps, decided by the group's people with their
 * roles in the group (no place in the child needed).
 */

let seq = 0;
const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-gso-'), 'taskflow.db'), seedOnEmpty: false });
  const group = store.createCompany({ name: 'Group' });
  const child = store.createCompany({ name: 'Child' });
  store.setCompanyParent(child.id, group.id, null);
  const mk = (companyId, role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@gso.test`, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }] });
  const as = (u) => ({ id: u.id, name: u.name });
  return { store, group, child, mk, as };
};

test('the company decides first, then the group signs off; group people need no place in the child', () => {
  const { store, group, child, mk, as } = setup();
  const childManager = mk(child.id, 'Manager');
  const cfo = mk(group.id, 'Accountant');
  store.approvals.setPolicy(child.id, 'vendor_bill', { steps: [{ approvers: [{ kind: 'role', id: 'Manager' }], need: 'any' }] });
  store.approvals.setPolicy(group.id, 'vendor_bill', { steps: [{ approvers: [{ kind: 'role', id: 'Accountant' }], need: 'any', minAmount: 1000, alsoBelow: true }] });

  assert.equal(store.startApproval(child.id, 'vendor_bill', 'small', { amount: 500, requesterId: null }), 'pending');
  assert.equal(store.approvalView('vendor_bill', 'small').steps.length, 1, 'under the group band: the company alone');

  store.startApproval(child.id, 'vendor_bill', 'big', { amount: 5000, requesterId: null });
  const steps = store.approvalView('vendor_bill', 'big').steps;
  assert.equal(steps.length, 2);
  assert.equal(steps[1].ownerCompanyId, group.id);
  assert.throws(() => store.decideApproval('vendor_bill', 'big', as(cfo), 'approve'), /Manager/, 'in order');
  assert.equal(store.decideApproval('vendor_bill', 'big', as(childManager), 'approve'), 'pending');
  assert.deepEqual(store.approvalsWaitingFor(group.id, cfo.id).map((w) => w.docId), ['big'], 'in the group\'s inbox');
  assert.equal(store.decideApproval('vendor_bill', 'big', as(cfo), 'approve'), 'approved');
});

test('a company with no policy of its own still gets the group sign-off, once', () => {
  const { store, group, child, mk, as } = setup();
  const cfo = mk(group.id, 'Accountant');
  store.approvals.setPolicy(group.id, 'invoice', { steps: [{ approvers: [{ kind: 'role', id: 'Accountant' }], need: 'any', alsoBelow: true }] });
  assert.equal(store.approvalApplies(child.id, 'invoice'), true);
  store.startApproval(child.id, 'invoice', 'i1', { amount: 10, requesterId: null });
  assert.equal(store.approvalView('invoice', 'i1').steps.length, 1);
  assert.equal(store.decideApproval('invoice', 'i1', as(cfo), 'approve'), 'approved');
  // The group's own invoices get the step once as well.
  store.startApproval(group.id, 'invoice', 'i2', { amount: 10, requesterId: null });
  assert.equal(store.approvalView('invoice', 'i2').steps.length, 1);
});

test('a group step not marked for below stays the group\'s own (and a fallback for companies without one)', () => {
  const { store, group, child } = setup();
  store.approvals.setPolicy(child.id, 'quotation', { steps: [{ approvers: [{ kind: 'role', id: 'Manager' }], need: 'any' }] });
  store.approvals.setPolicy(group.id, 'quotation', { steps: [{ approvers: [{ kind: 'role', id: 'Admin' }], need: 'any' }] });
  store.startApproval(child.id, 'quotation', 'q1', { amount: 10, requesterId: null });
  assert.equal(store.approvalView('quotation', 'q1').steps.length, 1, 'the child\'s own only');
});

test('in another currency the group band cannot be compared, so the group step applies and says why', () => {
  const { store, group, child, mk } = setup();
  mk(group.id, 'Accountant');
  store.db.prepare("UPDATE company_finance_settings SET currencyCode = 'OMR' WHERE companyId = ?").run(group.id);
  store.db.prepare("UPDATE company_finance_settings SET currencyCode = 'USD' WHERE companyId = ?").run(child.id);
  store.approvals.setPolicy(group.id, 'vendor_bill', { steps: [{ approvers: [{ kind: 'role', id: 'Accountant' }], need: 'any', minAmount: 100000, alsoBelow: true }] });
  store.startApproval(child.id, 'vendor_bill', 'fx', { amount: 10, requesterId: null });
  assert.equal(store.approvalView('vendor_bill', 'fx').steps.length, 1);
  assert.match(store.approvalView('vendor_bill', 'fx').trail.map((t) => t.note).join(' '), /currency/i);
});

test('each group up the tree adds its sign-off, nearest first', () => {
  const { store, group, child, mk, as } = setup();
  const sub = store.createCompany({ name: 'Sub' });
  store.setCompanyParent(sub.id, child.id, null);
  const childAcc = mk(child.id, 'Accountant');
  const groupAdmin = mk(group.id, 'Admin');
  store.approvals.setPolicy(child.id, 'document', { steps: [{ approvers: [{ kind: 'role', id: 'Accountant' }], need: 'any', alsoBelow: true }] });
  store.approvals.setPolicy(group.id, 'document', { steps: [{ approvers: [{ kind: 'role', id: 'Admin' }], need: 'any', alsoBelow: true }] });
  store.startApproval(sub.id, 'document', 'd1', { amount: 0, requesterId: null });
  assert.deepEqual(store.approvalView('document', 'd1').steps.map((s) => s.ownerCompanyId), [child.id, group.id]);
  store.decideApproval('document', 'd1', as(childAcc), 'approve');
  assert.equal(store.decideApproval('document', 'd1', as(groupAdmin), 'approve'), 'approved');
});

test('routes: a group approver decides a child\'s document without a place in the child', async () => {
  const { store, group, child, mk } = setup();
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: 'legacy', logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const cfo = mk(group.id, 'Employee');
  const finance = store.approvals.saveTeam(group.id, { name: 'Group finance', members: [{ kind: 'user', value: cfo.id }] });
  store.approvals.setPolicy(group.id, 'vendor_bill', { steps: [{ approvers: [{ kind: 'team', id: finance.id }], need: 'any', alsoBelow: true }] });
  const bill = store.createVendorBill({ companyId: child.id, vendorName: 'V', amount: 50, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
  const auth = (r) => r.set('Authorization', `Bearer ${store.issueToken(cfo.id)}`);
  const inbox = await auth(request(server).get(`/companies/${group.id}/approvals`));
  assert.equal(inbox.status, 200);
  assert.deepEqual(inbox.body.map((w) => w.docId), [bill.id]);
  const decided = await auth(request(server).post(`/approvals/vendor_bill/${bill.id}/decision`)).send({ decision: 'approve' });
  assert.equal(decided.status, 200, JSON.stringify(decided.body));
  const outsider = mk(store.createCompany({ name: 'Out' }).id, 'Admin');
  const refused = await request(server).post(`/approvals/vendor_bill/${bill.id}/decision`).set('Authorization', `Bearer ${store.issueToken(outsider.id)}`).send({ decision: 'approve' });
  assert.equal(refused.status, 403);
  server.close();
});
