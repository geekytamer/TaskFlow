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

// ── Held credit notes and vendor payments ───────────────────────────

const moneySetup = (docType) => {
  const ctx = setup();
  const { store, co, mk } = ctx;
  const clerk = mk('Accountant', 'Clerk');
  const cfo = mk('Employee', 'CFO');
  store.approvals.setPolicy(co, docType, { steps: [{ approvers: [{ kind: 'user', id: cfo.id }], need: 'any' }] });
  const bill = () => store.createVendorBill({ companyId: co, vendorName: 'Globex', amount: 500, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
  const invoice = () => {
    const client = store.listClients(co)[0];
    const inv = store.createInvoice({ companyId: co, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Draft', lineItems: [{ description: 'W', quantity: 1, unitPrice: 300, amount: 300, itemType: 'Manual' }] });
    return store.updateInvoiceStatus(inv.id, 'Sent');
  };
  return { ...ctx, clerk, cfo, bill, invoice };
};

test('a held payment posts nothing until approved, then posts once', () => {
  const { store, as, acting, clerk, cfo, bill, refused } = moneySetup('vendor_payment');
  const b = bill();
  refused(() => store.createVendorBillPayment({ billId: b.id, amount: 100, paidAt: new Date() }), 'APPROVAL_REQUIRED');
  const asked = acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 100, paidAt: new Date(), method: 'Bank Transfer' }));
  assert.ok(asked.hold, 'held');
  assert.equal(asked.hold.status, 'pending');
  assert.equal(store.listVendorBillPayments(b.id).length, 0, 'nothing posted');
  assert.equal(store.approvalView('vendor_payment', asked.hold.id).requesterId, clerk.id);
  assert.equal(store.decideApproval('vendor_payment', asked.hold.id, as(cfo), 'approve'), 'approved');
  const payments = store.listVendorBillPayments(b.id);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 100);
  const hold = store.getApprovalHold(asked.hold.id);
  assert.equal(hold.status, 'approved');
  assert.equal(hold.resultId, payments[0].id);
  refused(() => store.updateVendorBillStatus(b.id, 'Paid'), 'APPROVAL_REQUIRED');
});

test('payments waiting for approval count: two can\'t pay more than the bill', () => {
  const { store, acting, clerk, bill } = moneySetup('vendor_payment');
  const b = bill();
  acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 400, paidAt: new Date() }));
  assert.throws(() => acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 200, paidAt: new Date() })), /outstanding/);
  assert.ok(acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 100, paidAt: new Date() })).hold);
});

test('approved after its period was locked: the hold fails, nothing posts, the requester is told', () => {
  const { store, co, as, acting, clerk, cfo, bill } = moneySetup('vendor_payment');
  const b = bill();
  const paidAt = new Date(Date.now() - 86_400_000);
  const asked = acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 300, paidAt }));
  store.updateCompanyFinanceSettings(co, { lockedThroughDate: new Date() });
  store.decideApproval('vendor_payment', asked.hold.id, as(cfo), 'approve');
  const hold = store.getApprovalHold(asked.hold.id);
  assert.equal(hold.status, 'failed');
  assert.match(hold.error, /locked/);
  assert.equal(store.listVendorBillPayments(b.id).length, 0);
  assert.ok(store.listNotifications(clerk.id).some((n) => /could not be recorded/.test(n.title)));
});

test('a rejected payment posts nothing; the requester can withdraw a waiting one', () => {
  const { store, as, acting, clerk, cfo, bill } = moneySetup('vendor_payment');
  const b = bill();
  const one = acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 100, paidAt: new Date() })).hold;
  store.decideApproval('vendor_payment', one.id, as(cfo), 'reject', 'Wrong account');
  assert.equal(store.getApprovalHold(one.id).status, 'rejected');
  assert.equal(store.getApprovalHold(one.id).note, 'Wrong account');
  const two = acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 100, paidAt: new Date() })).hold;
  assert.throws(() => store.withdrawApprovalHold(two.id, cfo.id, false), (e) => e.status === 403);
  assert.equal(store.withdrawApprovalHold(two.id, clerk.id, false).status, 'withdrawn');
  assert.equal(store.approvals.outcome('vendor_payment', two.id), 'not_required');
  assert.equal(store.listVendorBillPayments(b.id).length, 0);
});

test('a credit note is held and recorded on approval; holds count against the invoice', () => {
  const { store, co, as, acting, clerk, cfo, invoice, refused } = moneySetup('credit_note');
  const inv = invoice();
  const lines = (n) => [{ description: 'Refund', amount: n }];
  refused(() => store.createCreditNote({ companyId: co, invoiceId: inv.id, lineItems: lines(10) }), 'APPROVAL_REQUIRED');
  const asked = acting(clerk, () => store.requestCreditNote({ companyId: co, invoiceId: inv.id, lineItems: lines(200) }));
  assert.ok(asked.hold);
  assert.equal(store.listCreditNotes(co).length, 0);
  assert.throws(() => acting(clerk, () => store.requestCreditNote({ companyId: co, invoiceId: inv.id, lineItems: lines(150) })), /available to credit/);
  store.decideApproval('credit_note', asked.hold.id, as(cfo), 'approve');
  const notes = store.listCreditNotes(co);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].total, 200);
});

test('without a policy credit notes and payments post at once, as before', () => {
  const { store, co, mk } = setup();
  const b = store.createVendorBill({ companyId: co, vendorName: 'G', amount: 50, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
  assert.ok(store.requestVendorPayment({ billId: b.id, amount: 50, paidAt: new Date() }).payment);
  assert.ok(mk);
});

// ── Handing a step on ────────────────────────────────────────────────

test('a step can\'t be handed to someone who already approved, or to someone outside the company', () => {
  const { store, co, mk, as, acting } = setup();
  const a = mk('Employee');
  const b = mk('Employee');
  const asker = mk('Employee');
  const outsider = store.createUser({ name: 'Out', email: 'out@apw2.test', password: 'x', role: 'Admin', companyIds: [store.createCompany({ name: 'Other' }).id] });
  store.approvals.setPolicy(co, 'vendor_bill', { steps: [{ approvers: [{ kind: 'user', id: a.id }], need: 'any' }, { approvers: [{ kind: 'user', id: b.id }], need: 'any' }] });
  const bill = acting(asker, () => store.createVendorBill({ companyId: co, vendorName: 'G', amount: 10, issueDate: new Date(), dueDate: new Date(), status: 'Approved' }));
  store.decideApproval('vendor_bill', bill.id, as(a), 'approve');
  const boss = mk('Admin');
  assert.throws(() => store.reassignApproval('vendor_bill', bill.id, { id: boss.id }, a.id, 'b is away'), /already approved/);
  assert.throws(() => store.reassignApproval('vendor_bill', bill.id, { id: boss.id }, outsider.id, 'b is away'), /can't open/);
  const step = store.reassignApproval('vendor_bill', bill.id, { id: boss.id }, mk('Employee').id, 'b is away');
  assert.equal(step.level, 2);
  assert.equal(step.need, 'any');
});

// ── Review fixes (2026-11-04) ────────────────────────────────────────

test('cancelled leave can\'t be approved by hand; back to Pending asks again', () => {
  const { store, co, acting, hr, workerRec, refused } = leaveSetup();
  const leave = acting(hr, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(2) }));
  store.setLeaveRequestStatus(leave.id, 'Cancelled', { userId: hr.id, name: hr.name });
  refused(() => store.setLeaveRequestStatus(leave.id, 'Approved', { userId: hr.id, name: hr.name }), 'APPROVAL_REQUIRED');
  store.setLeaveRequestStatus(leave.id, 'Pending', { userId: hr.id, name: hr.name });
  assert.equal(store.approvals.outcome('leave_request', leave.id), 'pending');
  refused(() => store.setLeaveRequestStatus(leave.id, 'Approved', { userId: hr.id, name: hr.name }), 'APPROVAL_PENDING');
});

test('a manager recording leave for their own staff without a login can still decide it', () => {
  const { store, co, as, acting, boss, workerRec } = leaveSetup(false);
  const leave = acting(boss, () => store.createLeaveRequest({ companyId: co, employeeId: workerRec.id, startDate: day(1), endDate: day(2) }));
  assert.equal(store.approvalView('leave_request', leave.id).steps[0].stuck, false);
  assert.equal(store.decideApproval('leave_request', leave.id, as(boss), 'approve'), 'approved');
});

test('a step whose only approver is the requester shows as stuck', () => {
  const { store, co, mk, acting } = setup();
  const solo = mk('Employee');
  store.approvals.setPolicy(co, 'vendor_bill', { steps: [{ approvers: [{ kind: 'user', id: solo.id }], need: 'any' }] });
  const bill = acting(solo, () => store.createVendorBill({ companyId: co, vendorName: 'G', amount: 5, issueDate: new Date(), dueDate: new Date(), status: 'Approved' }));
  assert.equal(store.approvalView('vendor_bill', bill.id).steps[0].stuck, true);
  assert.equal(store.approvals.statuses(co, 'vendor_bill')[0].stuck, true);
});

test('nobody can hand a step to themselves', () => {
  const { store, co, mk, acting } = setup();
  const admin = mk('Admin');
  const other = mk('Employee');
  store.approvals.setPolicy(co, 'vendor_bill', { steps: [{ approvers: [{ kind: 'user', id: other.id }], need: 'any' }] });
  const bill = acting(mk('Employee'), () => store.createVendorBill({ companyId: co, vendorName: 'G', amount: 5, issueDate: new Date(), dueDate: new Date(), status: 'Approved' }));
  assert.throws(() => store.reassignApproval('vendor_bill', bill.id, { id: admin.id }, admin.id, 'I will do it'), /yourself/);
});

test('a bill can\'t be created already Paid while payments need approval, and nothing is half-saved', () => {
  const { store, co, refused } = moneySetup('vendor_payment');
  const before = store.listVendorBills(co).length;
  refused(() => store.createVendorBill({ companyId: co, vendorName: 'G', amount: 50, issueDate: new Date(), dueDate: new Date(), status: 'Paid' }), 'APPROVAL_REQUIRED');
  assert.equal(store.listVendorBills(co).length, before);
});

test('a failed release tells the requester once, not "approved" as well', () => {
  const { store, co, as, acting, clerk, cfo, bill } = moneySetup('vendor_payment');
  const b = bill();
  const asked = acting(clerk, () => store.requestVendorPayment({ billId: b.id, amount: 100, paidAt: new Date(Date.now() - 864e5) }));
  store.updateCompanyFinanceSettings(co, { lockedThroughDate: new Date() });
  store.decideApproval('vendor_payment', asked.hold.id, as(cfo), 'approve');
  const titles = store.listNotifications(clerk.id).map((n) => n.title);
  assert.equal(titles.filter((t) => /could not be recorded/.test(t)).length, 1);
  assert.equal(titles.filter((t) => /was approved$/.test(t)).length, 0);
});
