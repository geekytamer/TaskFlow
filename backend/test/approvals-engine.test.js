const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Approvals by teams, roles, people and the requester's manager: ordered
 * steps, any or all, amount bands, delegation, self-approval, group policies.
 * Exercised on a generic document type with made-up document ids, so the
 * engine is proven before any document is wired to it.
 */

let seq = 0;
const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-appr-'), 'taskflow.db'), seedOnEmpty: false });
  const co = store.createCompany({ name: 'Co' });
  const mk = (role, companyId = co.id) => store.createUser({
    name: `${role}${++seq}`, email: `${role}${seq}@ap.test`, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }],
  });
  const as = (u) => ({ id: u.id, name: u.name });
  return { store, co, mk, as };
};

test('a Legal team step: only its members decide; the requester never approves their own', () => {
  const { store, co, mk, as } = setup();
  const lawyer = mk('Employee');
  const lawyer2 = mk('Employee');
  const requester = mk('Manager');
  const admin = mk('Admin');
  const legal = store.approvals.saveTeam(co.id, { name: 'Legal', members: [{ kind: 'user', value: lawyer.id }, { kind: 'user', value: requester.id }] });
  store.approvals.setPolicy(co.id, 'document', { steps: [{ approvers: [{ kind: 'team', id: legal.id }], need: 'any' }] });

  assert.equal(store.startApproval(co.id, 'document', 'd1', { amount: 0, requesterId: requester.id }), 'pending');
  assert.throws(() => store.decideApproval('document', 'd1', as(admin), 'approve'), /Legal/, 'an Admin is not on a team step');
  assert.throws(() => store.decideApproval('document', 'd1', as(requester), 'approve'), /own/, 'never your own request');
  assert.deepEqual(store.approvalsWaitingFor(co.id, lawyer.id).map((w) => w.docId), ['d1']);
  assert.deepEqual(store.approvalsWaitingFor(co.id, lawyer2.id), [], 'not a member');
  assert.equal(store.decideApproval('document', 'd1', as(lawyer), 'approve'), 'approved');
});

test('an "all" step needs Legal and Finance each; one person cannot fill both', () => {
  const { store, co, mk, as } = setup();
  const both = mk('Employee');
  const accountant = mk('Accountant');
  const legal = store.approvals.saveTeam(co.id, { name: 'Legal', members: [{ kind: 'user', value: both.id }] });
  const finance = store.approvals.saveTeam(co.id, { name: 'Finance', members: [{ kind: 'user', value: both.id }, { kind: 'role', value: 'Accountant' }] });
  store.approvals.setPolicy(co.id, 'document', { steps: [{ approvers: [{ kind: 'team', id: legal.id }, { kind: 'team', id: finance.id }], need: 'all' }] });
  store.startApproval(co.id, 'document', 'd2', { amount: 0, requesterId: null });

  assert.equal(store.decideApproval('document', 'd2', as(both), 'approve'), 'pending', 'Legal signed; Finance still to sign');
  assert.throws(() => store.decideApproval('document', 'd2', as(both), 'approve'), /someone else|already/);
  assert.equal(store.decideApproval('document', 'd2', as(accountant), 'approve'), 'approved', 'an Accountant is in Finance by role');
});

test('amount bands and order: a Manager first, then the requester\'s manager above 5,000', () => {
  const { store, co, mk, as } = setup();
  const boss = mk('Employee');
  const worker = mk('Employee');
  const manager = mk('Manager');
  const bossRec = store.createEmployee({ companyId: co.id, name: 'Boss', userId: boss.id });
  store.createEmployee({ companyId: co.id, name: 'Worker', userId: worker.id, managerId: bossRec.id });
  store.approvals.setPolicy(co.id, 'expense', {
    steps: [
      { approvers: [{ kind: 'role', id: 'Manager' }], need: 'any', minAmount: 100 },
      { approvers: [{ kind: 'manager' }], need: 'any', minAmount: 5000 },
    ],
  });
  assert.equal(store.startApproval(co.id, 'expense', 'small', { amount: 50, requesterId: worker.id }), 'not_required');
  assert.equal(store.startApproval(co.id, 'expense', 'mid', { amount: 500, requesterId: worker.id }), 'pending');
  assert.equal(store.approvalView('expense', 'mid').steps.length, 1);
  store.startApproval(co.id, 'expense', 'big', { amount: 9000, requesterId: worker.id });
  assert.throws(() => store.decideApproval('expense', 'big', as(boss), 'approve'), /Manager/, 'in order: the Manager step first');
  assert.equal(store.decideApproval('expense', 'big', as(manager), 'approve'), 'pending');
  assert.equal(store.decideApproval('expense', 'big', as(boss), 'approve'), 'approved', 'the worker\'s own manager');
});

test('the requester\'s manager step is skipped, with a note, when there is no manager', () => {
  const { store, co, mk } = setup();
  const loner = mk('Employee');
  store.approvals.setPolicy(co.id, 'leave_request', { steps: [{ approvers: [{ kind: 'manager' }], need: 'any' }] });
  assert.equal(store.startApproval(co.id, 'leave_request', 'l1', { amount: 0, requesterId: loner.id }), 'not_required');
  assert.match(store.approvalView('leave_request', 'l1').trail.map((t) => t.note).join(' '), /no manager/i);
});

test('a delegate decides for an approver while they are away, and the trail says so', () => {
  const { store, co, mk, as } = setup();
  const lawyer = mk('Employee');
  const stand = mk('Employee');
  const legal = store.approvals.saveTeam(co.id, { name: 'Legal', members: [{ kind: 'user', value: lawyer.id }] });
  store.approvals.setPolicy(co.id, 'document', { steps: [{ approvers: [{ kind: 'team', id: legal.id }], need: 'any' }] });
  store.approvals.setDelegation(lawyer.id, { toUserId: stand.id, startsAt: '2000-01-01', endsAt: '2999-01-01' });
  store.startApproval(co.id, 'document', 'd3', { amount: 0, requesterId: null });
  assert.deepEqual(store.approvalsWaitingFor(co.id, stand.id).map((w) => w.docId), ['d3']);
  assert.equal(store.decideApproval('document', 'd3', as(stand), 'approve'), 'approved');
  const decided = store.approvalView('document', 'd3').trail.find((t) => t.kind === 'approved');
  assert.equal(decided.onBehalfOf, lawyer.id);
});

test('an empty team cannot approve anything and the request says it is stuck', () => {
  const { store, co, mk, as } = setup();
  const admin = mk('Admin');
  const legal = store.approvals.saveTeam(co.id, { name: 'Legal', members: [] });
  store.approvals.setPolicy(co.id, 'document', { steps: [{ approvers: [{ kind: 'team', id: legal.id }], need: 'all' }] });
  assert.equal(store.startApproval(co.id, 'document', 'd4', { amount: 0, requesterId: null }), 'pending');
  assert.equal(store.approvalView('document', 'd4').steps[0].stuck, true);
  assert.throws(() => store.decideApproval('document', 'd4', as(admin), 'approve'));
});

test('send back ends the request as changes requested, with the reason', () => {
  const { store, co, mk, as } = setup();
  const manager = mk('Manager');
  store.approvals.setPolicy(co.id, 'quotation', { steps: [{ approvers: [{ kind: 'role', id: 'Manager' }], need: 'any' }] });
  store.startApproval(co.id, 'quotation', 'q1', { amount: 10, requesterId: null });
  assert.throws(() => store.decideApproval('quotation', 'q1', as(manager), 'send_back', ''), /reason/);
  assert.equal(store.decideApproval('quotation', 'q1', as(manager), 'send_back', 'Add the VAT'), 'changes_requested');
});

test('a child company with no policy of its own uses its group\'s', () => {
  const { store, co, mk, as } = setup();
  const child = store.createCompany({ name: 'Child' });
  store.setCompanyParent(child.id, co.id, null);
  const cfo = mk('Employee');
  const finance = store.approvals.saveTeam(co.id, { name: 'Group finance', members: [{ kind: 'user', value: cfo.id }] });
  store.approvals.setPolicy(co.id, 'vendor_bill', { steps: [{ approvers: [{ kind: 'team', id: finance.id }], need: 'any' }] });
  assert.equal(store.startApproval(child.id, 'vendor_bill', 'b1', { amount: 100, requesterId: null }), 'pending');
  assert.equal(store.decideApproval('vendor_bill', 'b1', as(cfo), 'approve'), 'approved');
  store.approvals.setPolicy(child.id, 'vendor_bill', { steps: [] });
  assert.equal(store.startApproval(child.id, 'vendor_bill', 'b2', { amount: 100, requesterId: null }), 'pending', 'an empty own policy still defers to the group');
});

test('converted rules keep today\'s behaviour: an Admin acts for a Manager level, self-approval allowed', () => {
  const { store, co, mk, as } = setup();
  const admin = mk('Admin');
  store.approvals.setRules(co.id, 'purchase_order', [{ minAmount: 1000, approverRole: 'Manager' }]);
  store.startApproval(co.id, 'purchase_order', 'p1', { amount: 2000, requesterId: admin.id });
  assert.equal(store.decideApproval('purchase_order', 'p1', as(admin), 'approve'), 'approved');
});
