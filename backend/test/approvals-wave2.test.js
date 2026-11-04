const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Approvals wave 2 (spec 2026-11-04-approvals-wave-2-design): leave and
 * requisitions on the engine, held credit notes and vendor payments,
 * handing a step to someone else, and the per-type status list.
 */

let seq = 0;
const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-apw2-'), 'taskflow.db'), seedOnEmpty: true });
  const co = '1';
  const mk = (role, name = role) => store.createUser({ name: `${name}${++seq}`, email: `${role}${seq}@apw2.test`, password: 'x', role, companyIds: [co], companyRoles: [{ companyId: co, role }] });
  const as = (u) => ({ id: u.id, name: u.name });
  const acting = (u, fn) => store.runAsActor({ userId: u.id, name: u.name }, fn);
  const refused = (fn, code) => assert.throws(fn, (e) => e.status === 409 && e.details?.code === code);
  return { store, co, mk, as, acting, refused };
};
const day = (n) => new Date(Date.UTC(2026, 11, n));

// ── Leave ────────────────────────────────────────────────────────────

const leaveSetup = (withLogin = true) => {
  const ctx = setup();
  const { store, co, mk } = ctx;
  const boss = mk('Employee', 'Boss');
  const worker = mk('Employee', 'Worker');
  const hr = mk('Manager', 'HR');
  const bossRec = store.createEmployee({ companyId: co, name: 'Boss', userId: boss.id, status: 'Active' });
  const workerRec = store.createEmployee({ companyId: co, name: 'Worker', userId: withLogin ? worker.id : undefined, managerId: bossRec.id, status: 'Active' });
  store.approvals.setPolicy(co, 'leave_request', { steps: [{ approvers: [{ kind: 'manager' }], need: 'any' }] });
  return { ...ctx, boss, worker, hr, workerRec };
};

test('leave goes to the employee\'s manager; approval sets it Approved', () => {
  const { store, co, as, acting, boss, hr, workerRec } = leaveSetup();
  const leave = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(3) }));
  assert.equal(store.approvals.outcome('leave_request', leave.id), 'pending');
  assert.equal(store.approvalView('leave_request', leave.id).requesterId, workerRec.userId, 'the employee asked, not who typed it');
  assert.equal(store.decideApproval('leave_request', leave.id, as(boss), 'approve'), 'approved');
  const after = store.getLeaveRequestById(leave.id);
  assert.equal(after.status, 'Approved');
  assert.equal(after.reviewedByUserId, boss.id);
});

test('leave can\'t be approved by hand while it waits; cancelling withdraws it', () => {
  const { store, co, acting, hr, workerRec, refused } = leaveSetup();
  const leave = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(2) }));
  refused(() => store.setLeaveRequestStatus(leave.id, 'Approved', { userId: hr.id, name: hr.name }), 'APPROVAL_PENDING');
  refused(() => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(5), endDate: day(6), status: 'Approved' }), 'APPROVAL_REQUIRED');
  assert.equal(store.setLeaveRequestStatus(leave.id, 'Cancelled', { userId: hr.id, name: hr.name }).status, 'Cancelled');
  assert.equal(store.approvals.outcome('leave_request', leave.id), 'not_required', 'nobody is left waiting');
});

test('rejected or sent back leave is Rejected with the note', () => {
  const { store, co, as, acting, boss, hr, workerRec } = leaveSetup();
  const leave = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(2) }));
  store.decideApproval('leave_request', leave.id, as(boss), 'send_back', 'Pick other dates, audit week');
  const after = store.getLeaveRequestById(leave.id);
  assert.equal(after.status, 'Rejected');
  assert.equal(after.reviewNote, 'Pick other dates, audit week');
});

test('leave amount is days: a "from 5 days" step is left out for two days', () => {
  const { store, co, acting, hr, workerRec } = leaveSetup();
  store.approvals.setPolicy(co, 'leave_request', { steps: [{ approvers: [{ kind: 'role', id: 'Manager' }], need: 'any', minAmount: 5 }] });
  const short = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(2) }));
  assert.equal(store.approvals.outcome('leave_request', short.id), 'not_required');
  const long = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(10), endDate: day(16) }));
  assert.equal(store.approvals.outcome('leave_request', long.id), 'pending');
});

test('leave for someone without a login: the recorder asked, and the employee\'s own manager decides', () => {
  const { store, co, as, acting, boss, hr, workerRec } = leaveSetup(false);
  const leave = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(2) }));
  assert.equal(store.approvalView('leave_request', leave.id).requesterId, hr.id);
  assert.throws(() => store.decideApproval('leave_request', leave.id, as(hr), 'approve'));
  assert.equal(store.decideApproval('leave_request', leave.id, as(boss), 'approve'), 'approved');
});

// ── Purchase requisitions ────────────────────────────────────────────

const reqSetup = () => {
  const ctx = setup();
  const { store, co, mk } = ctx;
  const buyer = mk('Employee', 'Buyer');
  const approver = mk('Employee', 'Finance');
  const team = store.approvals.saveTeam(co, { name: 'Finance', members: [{ kind: 'user', value: approver.id }] });
  store.approvals.setPolicy(co, 'purchase_requisition', { steps: [{ approvers: [{ kind: 'team', id: team.id }], need: 'any' }] });
  const make = () => ctx.acting(buyer, () => store.createPurchaseRequisition({ companyId: co, items: [{ description: 'Gloves', quantity: 10, estimatedUnitCost: 2 }] }));
  return { ...ctx, buyer, approver, make };
};

test('submitting a requisition asks for approval; the old Approve button waits', () => {
  const { store, as, acting, buyer, approver, make, refused } = reqSetup();
  const r = make();
  assert.equal(store.approvals.outcome('purchase_requisition', r.id), 'not_required', 'drafts do not ask');
  acting(buyer, () => store.submitPurchaseRequisition(r.id));
  assert.equal(store.approvals.outcome('purchase_requisition', r.id), 'pending');
  assert.equal(store.approvalView('purchase_requisition', r.id).requesterId, buyer.id);
  refused(() => store.approvePurchaseRequisition(r.id), 'APPROVAL_PENDING');
  refused(() => store.rejectPurchaseRequisition(r.id, 'no'), 'APPROVAL_PENDING');
  assert.equal(store.decideApproval('purchase_requisition', r.id, as(approver), 'approve'), 'approved');
  const after = store.getPurchaseRequisitionById(r.id);
  assert.equal(after.status, 'Approved');
  assert.equal(after.approvedByUserId, approver.id);
});

test('a requisition sent back is a draft again and resubmitting asks again', () => {
  const { store, as, acting, buyer, approver, make } = reqSetup();
  const r = make();
  acting(buyer, () => store.submitPurchaseRequisition(r.id));
  store.decideApproval('purchase_requisition', r.id, as(approver), 'send_back', 'Split by site');
  const back = store.getPurchaseRequisitionById(r.id);
  assert.equal(back.status, 'Draft');
  assert.equal(back.rejectionReason, 'Split by site');
  acting(buyer, () => store.submitPurchaseRequisition(r.id));
  assert.equal(store.approvals.outcome('purchase_requisition', r.id), 'pending');
  store.decideApproval('purchase_requisition', r.id, as(approver), 'reject', 'Not budgeted');
  assert.equal(store.getPurchaseRequisitionById(r.id).status, 'Rejected');
});

test('without a requisition policy the old buttons work as before', () => {
  const { store, co, mk, acting } = setup();
  const u = mk('Manager');
  const r = acting(u, () => store.createPurchaseRequisition({ companyId: co, items: [{ description: 'Tape', quantity: 1, estimatedUnitCost: 1 }] }));
  store.submitPurchaseRequisition(r.id);
  assert.equal(store.approvePurchaseRequisition(r.id).status, 'Approved');
});
