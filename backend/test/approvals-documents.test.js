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
