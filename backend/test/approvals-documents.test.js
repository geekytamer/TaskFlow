const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Wave-1 documents: with a policy, a new document asks for approval and its
 * next step (pay, send, approve, finalise) waits until approved. Without a
 * policy nothing changes. A bigger amount after approval asks again.
 */

let seq = 0;
const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-apdocs-'), 'taskflow.db'), seedOnEmpty: true });
  const co = '1';
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@apdocs.test`, password: 'x', role, companyIds: [co], companyRoles: [{ companyId: co, role }] });
  const requester = mk('Employee');
  const approver = mk('Employee');
  const team = store.approvals.saveTeam(co, { name: 'Finance', members: [{ kind: 'user', value: approver.id }] });
  const policy = (docType) => store.approvals.setPolicy(co, docType, { steps: [{ approvers: [{ kind: 'team', id: team.id }], need: 'any' }] });
  const asRequester = (fn) => store.runAsActor({ userId: requester.id, name: requester.name }, fn);
  const approve = (docType, id) => store.decideApproval(docType, id, { id: approver.id, name: approver.name }, 'approve');
  const client = store.listClients(co)[0];
  return { store, co, policy, asRequester, approve, client };
};
const refused = (fn, code) => assert.throws(fn, (e) => e.status === 409 && e.details?.code === code);

test('a vendor bill waits for approval before it can be paid', () => {
  const { store, co, policy, asRequester, approve } = setup();
  policy('vendor_bill');
  const bill = asRequester(() => store.createVendorBill({ companyId: co, vendorName: 'Globex', amount: 500, issueDate: new Date(), dueDate: new Date(), status: 'Approved' }));
  assert.equal(store.approvals.outcome('vendor_bill', bill.id), 'pending');
  assert.equal(store.approvalView('vendor_bill', bill.id).requesterId !== null, true, 'the requester is whoever created it');
  refused(() => store.createVendorBillPayment({ billId: bill.id, amount: 100, paidAt: new Date(), method: 'Bank Transfer' }), 'APPROVAL_PENDING');
  assert.equal(approve('vendor_bill', bill.id), 'approved');
  assert.ok(store.createVendorBillPayment({ billId: bill.id, amount: 100, paidAt: new Date(), method: 'Bank Transfer' }).payment);
});

test('without a policy a vendor bill is paid as before', () => {
  const { store, co } = setup();
  const bill = store.createVendorBill({ companyId: co, vendorName: 'Globex', amount: 500, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
  assert.equal(store.approvals.outcome('vendor_bill', bill.id), 'not_required');
  assert.ok(store.createVendorBillPayment({ billId: bill.id, amount: 100, paidAt: new Date(), method: 'Bank Transfer' }).payment);
});

test('an invoice is approved before it is sent, and must start as a draft', () => {
  const { store, co, policy, asRequester, approve, client } = setup();
  policy('invoice');
  const lines = [{ description: 'Work', quantity: 1, unitPrice: 100, amount: 100, itemType: 'Manual' }];
  refused(() => store.createInvoice({ companyId: co, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Sent', lineItems: lines }), 'APPROVAL_REQUIRED');
  const inv = asRequester(() => store.createInvoice({ companyId: co, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Draft', lineItems: lines }));
  refused(() => store.updateInvoiceStatus(inv.id, 'Sent'), 'APPROVAL_PENDING');
  approve('invoice', inv.id);
  assert.equal(store.updateInvoiceStatus(inv.id, 'Sent').status, 'Sent');
});

test('a quotation is approved before it is sent; a bigger amount after approval asks again', () => {
  const { store, co, policy, asRequester, approve, client } = setup();
  policy('quotation');
  const at = new Date();
  const until = new Date(Date.now() + 30 * 86_400_000);
  const q = asRequester(() => store.createQuotation({ companyId: co, clientId: client.id, issueDate: at, validUntil: until, items: [{ description: 'Line', quantity: 1, unitPrice: 10 }] }));
  refused(() => store.setQuotationStatus(q.id, 'Sent'), 'APPROVAL_PENDING');
  approve('quotation', q.id);
  store.updateQuotation(q.id, { items: [{ description: 'Line', quantity: 5, unitPrice: 10 }] });
  assert.equal(store.approvals.outcome('quotation', q.id), 'pending', 'more money: asked again');
  approve('quotation', q.id);
  assert.equal(store.setQuotationStatus(q.id, 'Sent').status, 'Sent');
});

test('a payroll run is approved before it is approved for payment', () => {
  const { store, co, policy, asRequester, approve } = setup();
  policy('payroll_run');
  store.createEmployee({ companyId: co, name: 'Worker', status: 'Active', basicSalary: 400 });
  const run = asRequester(() => store.createPayrollRun(co, '2026-10'));
  refused(() => store.updatePayrollRunStatus(run.id, 'approved'), 'APPROVAL_PENDING');
  approve('payroll_run', run.id);
  assert.equal(store.updatePayrollRunStatus(run.id, 'approved').status, 'approved');
});

test('a document is finalised only after Legal signs off', () => {
  const { store, co, policy, asRequester, approve } = setup();
  policy('document');
  const template = store.createDocumentTemplate(co, { name: 'NDA', type: 'letter', dataSource: 'none' });
  refused(() => store.createDocument(co, { templateId: template.id, title: 'NDA', status: 'final' }), 'APPROVAL_REQUIRED');
  const doc = asRequester(() => store.createDocument(co, { templateId: template.id, title: 'NDA', status: 'draft' }));
  refused(() => store.updateDocument(doc.id, { status: 'final' }), 'APPROVAL_PENDING');
  approve('document', doc.id);
  assert.equal(store.updateDocument(doc.id, { status: 'final' }).status, 'final');
});

// ── Review fixes ─────────────────────────────────────────────────────

test('an expense whose only step is the requester\'s manager, with no manager, needs no approval and posts', () => {
  const { store, co, asRequester } = setup();
  store.approvals.setPolicy(co, 'expense', { steps: [{ approvers: [{ kind: 'manager' }], need: 'any', minAmount: 10 }] });
  const ex = asRequester(() => store.createExpense({ companyId: co, category: 'Taxi', amount: 100, expenseDate: new Date() }));
  assert.equal(store.getExpenseById(ex.id).approvalStatus, 'not_required');
});

test('a purchase order records who asked, and "never your own" holds', () => {
  const { store, co, asRequester } = setup();
  const supplier = store.createSupplier({ companyId: co, name: 'S', email: 's@x.example' });
  const item = store.createInventoryItem({ companyId: co, name: 'I', category: 'C', unit: 'u', unitCost: 1 });
  store.approvals.setPolicy(co, 'purchase_order', { steps: [{ approvers: [{ kind: 'role', id: 'Admin' }], need: 'any', minAmount: 1 }] });
  const admin = store.createUser({ name: 'Boss', email: 'boss-po@apdocs.test', password: 'x', role: 'Admin', companyIds: [co], companyRoles: [{ companyId: co, role: 'Admin' }] });
  const po = store.runAsActor({ userId: admin.id, name: admin.name }, () => store.createPurchaseOrder({ companyId: co, supplierId: supplier.id, supplierName: 'S', orderDate: new Date(), status: 'Draft', items: [{ inventoryItemId: item.id, description: 'I', quantity: 10, unitCost: 10 }] }));
  assert.equal(store.approvalView('purchase_order', po.id).requesterId, admin.id);
  assert.throws(() => store.decideApproval('purchase_order', po.id, { id: admin.id, name: admin.name }, 'approve'), /own/);
  assert.ok(asRequester);
});

test('a vendor bill cannot be created already paid while bills need approval', () => {
  const { store, co, policy } = setup();
  policy('vendor_bill');
  refused(() => store.createVendorBill({ companyId: co, vendorName: 'Globex', amount: 500, issueDate: new Date(), dueDate: new Date(), status: 'Paid' }), 'APPROVAL_REQUIRED');
});

test('an invoice cannot leave Draft through an edit or as Overdue before approval', () => {
  const { store, co, policy, asRequester, client } = setup();
  policy('invoice');
  const inv = asRequester(() => store.createInvoice({ companyId: co, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Draft', lineItems: [{ description: 'W', quantity: 1, unitPrice: 100, amount: 100, itemType: 'Manual' }] }));
  refused(() => store.updateInvoice(inv.id, { status: 'Sent' }), 'APPROVAL_PENDING');
  refused(() => store.updateInvoiceStatus(inv.id, 'Overdue'), 'APPROVAL_PENDING');
});

test('a restart keeps the first requester; a deleted invoice leaves nobody waiting', () => {
  const { store, co, policy, asRequester, client } = setup();
  policy('invoice');
  const lines = (n) => [{ description: 'W', quantity: n, unitPrice: 100, amount: 100 * n, itemType: 'Manual' }];
  const inv = asRequester(() => store.createInvoice({ companyId: co, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Draft', lineItems: lines(1) }));
  const first = store.approvalView('invoice', inv.id).requesterId;
  const other = store.createUser({ name: 'Other', email: 'other@apdocs.test', password: 'x', role: 'Manager', companyIds: [co], companyRoles: [{ companyId: co, role: 'Manager' }] });
  store.runAsActor({ userId: other.id, name: other.name }, () => store.updateInvoice(inv.id, { lineItems: lines(3) }));
  assert.equal(store.approvalView('invoice', inv.id).requesterId, first, 'the editor does not become the requester');
  store.deleteInvoice(inv.id);
  assert.equal(store.approvals.outcome('invoice', inv.id), 'not_required');
  assert.deepEqual(store.approvals.overdue('reminded', Date.now() + 1e12).filter((r) => r.docId === inv.id), []);
});

test('rewriting a document Legal approved asks Legal again', () => {
  const { store, co, policy, asRequester, approve } = setup();
  policy('document');
  const template = store.createDocumentTemplate(co, { name: 'NDA', type: 'letter', dataSource: 'none' });
  const doc = asRequester(() => store.createDocument(co, { templateId: template.id, title: 'NDA', status: 'draft' }));
  approve('document', doc.id);
  store.updateDocument(doc.id, { title: 'NDA, rewritten' });
  assert.equal(store.approvals.outcome('document', doc.id), 'pending');
});
