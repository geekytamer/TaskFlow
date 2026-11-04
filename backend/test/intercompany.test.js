const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** Intercompany (spec 2026-11-04-intercompany-design): sister companies trade and both books agree. */

let seq = 0;
const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-ic-'), 'taskflow.db'), seedOnEmpty: false });
  const group = store.createCompany({ name: 'Group' });
  const a = store.createCompany({ name: 'Alpha' });
  const b = store.createCompany({ name: 'Beta' });
  store.setCompanyParent(a.id, group.id, null);
  store.setCompanyParent(b.id, group.id, null);
  const lines = (amount) => [{ description: 'Design work', quantity: 1, unitPrice: amount, amount, itemType: 'Manual' }];
  const invoice = (amount, extra = {}) => {
    const client = store.ensureIntercompanyPartner(a.id, b.id, 'client');
    return store.createInvoice({ companyId: a.id, clientId: client.id, issueDate: new Date(), dueDate: new Date(Date.now() + 864e6), status: 'Sent', lineItems: lines(amount), ...extra });
  };
  const billOf = (inv) => store.listVendorBills(b.id).find((x) => x.referenceInvoiceNumber === inv.invoiceNumber);
  const lineOn = (companyId, code) => store.listJournalEntries(companyId).flatMap((e) => e.lines.map((l) => ({ ...l, code: store.getLedgerAccountById(l.accountId)?.code })))
    .filter((l) => l.code === code);
  return { store, group, a, b, invoice, billOf, lineOn, lines };
};

test('a sister is a partner once; an outside company is not', () => {
  const { store, a, b } = setup();
  const one = store.ensureIntercompanyPartner(a.id, b.id, 'client');
  assert.equal(store.ensureIntercompanyPartner(a.id, b.id, 'client').id, one.id, 'made once');
  assert.equal(one.name, 'Beta');
  const outside = store.createCompany({ name: 'Outside' });
  assert.throws(() => store.ensureIntercompanyPartner(a.id, outside.id, 'client'), (e) => e.status === 400);
});

test('an invoice to a sister posts to 1160 and puts a Draft bill in its books; the approved bill posts to 2050', () => {
  const { store, a, b, invoice, billOf, lineOn } = setup();
  const inv = invoice(100);
  const due = lineOn(a.id, '1160');
  assert.equal(due.length, 1);
  assert.equal(due[0].debit, 100);
  assert.equal(due[0].partnerCompanyId, b.id);
  assert.equal(lineOn(a.id, '1100').length, 0, 'not trade receivables');
  const bill = billOf(inv);
  assert.ok(bill, 'Beta has the bill');
  assert.equal(bill.status, 'Draft');
  assert.equal(bill.amount, 100);
  assert.match(bill.notes, /From Alpha invoice/);
  store.updateVendorBillStatus(bill.id, 'Approved');
  const owed = lineOn(b.id, '2050');
  assert.equal(owed[0].credit, 100);
  assert.equal(owed[0].partnerCompanyId, a.id);
  const balance = store.intercompanyBalances(a.id).find((x) => x.sisterId === b.id);
  assert.deepEqual([balance.ours, balance.theirs, balance.difference], [100, 100, 0]);
});

test('a bill still in Draft explains the difference', () => {
  const { store, a, b, invoice } = setup();
  invoice(70);
  const balance = store.intercompanyBalances(a.id).find((x) => x.sisterId === b.id);
  assert.equal(balance.difference, 70);
  assert.equal(balance.explain[0].kind, 'draft_bill');
});

test('an invoice to a sister must be in the sister\'s own currency', () => {
  const { store, a, b, invoice } = setup();
  const theirs = store.getCompanyFinanceSettings(b.id).currencyCode;
  const other = theirs === 'EUR' ? 'USD' : 'EUR';
  assert.throws(() => invoice(10, { currency: other, exchangeRate: 0.4 }), (e) => e.status === 400 && e.details?.code === 'INTERCOMPANY_CURRENCY');
});

test('the buyer pays; the seller is offered the receipt once, and then both sides are clear', () => {
  const { store, a, b, invoice, billOf } = setup();
  const inv = invoice(100);
  const bill = billOf(inv);
  store.updateVendorBillStatus(bill.id, 'Approved');
  store.createVendorBillPayment({ billId: bill.id, amount: 40, paidAt: new Date(), method: 'Bank Transfer' });
  const offered = store.intercompanyToMatch(a.id);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].kind, 'bill_payment');
  assert.equal(offered[0].targetId, inv.id);
  assert.equal(store.intercompanyToMatch(b.id).length, 0, 'the buyer is not asked to match its own payment');
  store.matchIntercompanyPayment(a.id, 'bill_payment', offered[0].paymentId);
  assert.equal(store.getInvoiceById(inv.id).outstandingAmount, 60);
  assert.equal(store.intercompanyToMatch(a.id).length, 0);
  assert.equal(store.intercompanyToMatch(b.id).length, 0, 'the receipt is not offered back to the buyer');
  assert.throws(() => store.matchIntercompanyPayment(a.id, 'bill_payment', offered[0].paymentId), (e) => e.status === 404);
  const balance = store.intercompanyBalances(a.id).find((x) => x.sisterId === b.id);
  assert.deepEqual([balance.ours, balance.theirs, balance.difference], [60, 60, 0]);
});

test('the seller records a receipt; the buyer matches it on its approved bill, not on a Draft one', () => {
  const { store, a, b, invoice, billOf } = setup();
  const inv = invoice(50);
  store.createPayment({ invoiceId: inv.id, amount: 50, paidAt: new Date(), method: 'Bank Transfer' });
  const offered = store.intercompanyToMatch(b.id);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].kind, 'invoice_payment');
  assert.throws(() => store.matchIntercompanyPayment(b.id, 'invoice_payment', offered[0].paymentId), (e) => e.status === 409, 'Draft bill');
  store.updateVendorBillStatus(billOf(inv).id, 'Approved');
  const done = store.matchIntercompanyPayment(b.id, 'invoice_payment', offered[0].paymentId);
  assert.ok(done.payment);
  assert.equal(store.getVendorBillById(billOf(inv).id).status, 'Paid');
  assert.equal(store.intercompanyToMatch(b.id).length, 0);
  const balance = store.intercompanyBalances(b.id).find((x) => x.sisterId === a.id);
  assert.deepEqual([balance.ours, balance.theirs, balance.difference], [0, 0, 0]);
});

test('a match waiting for payment approval is not offered twice', () => {
  const { store, a, b, invoice, billOf } = setup();
  const inv = invoice(30);
  store.updateVendorBillStatus(billOf(inv).id, 'Approved');
  store.createPayment({ invoiceId: inv.id, amount: 30, paidAt: new Date() });
  const boss = store.createUser({ name: 'Boss', email: `boss${++seq}@ic.test`, password: 'x', role: 'Admin', companyIds: [b.id], companyRoles: [{ companyId: b.id, role: 'Admin' }] });
  store.approvals.setPolicy(b.id, 'vendor_payment', { steps: [{ approvers: [{ kind: 'user', id: boss.id }], need: 'any' }] });
  const [item] = store.intercompanyToMatch(b.id);
  const held = store.matchIntercompanyPayment(b.id, 'invoice_payment', item.paymentId);
  assert.ok(held.hold, 'held for approval');
  assert.equal(store.intercompanyToMatch(b.id).length, 0, 'not offered while it waits');
  store.decideApproval('vendor_payment', held.hold.id, { id: boss.id, name: boss.name }, 'approve');
  assert.equal(store.getVendorBillById(billOf(inv).id).status, 'Paid', 'recorded on approval');
  assert.equal(store.intercompanyToMatch(a.id).length, 0, 'and linked, so the seller is not asked back');
});

test('deleting an invoice takes its Draft bill along; an approved bill stops it', () => {
  const { store, invoice, billOf } = setup();
  const first = invoice(10);
  const draft = billOf(first);
  store.deleteInvoice(first.id);
  assert.equal(store.getVendorBillById(draft.id), undefined);
  const second = invoice(20);
  store.updateVendorBillStatus(billOf(second).id, 'Approved');
  assert.throws(() => store.deleteInvoice(second.id), (e) => e.status === 409 && /Beta has approved/.test(e.message));
});

test('a purchase order to a sister, once Ordered, is a Draft sales order there', () => {
  const { store, a, b } = setup();
  const supplier = store.ensureIntercompanyPartner(a.id, b.id, 'supplier');
  const item = store.createInventoryItem({ companyId: a.id, name: 'Paper', category: 'Office', unit: 'box', unitCost: 3 });
  const po = store.createPurchaseOrder({ companyId: a.id, supplierId: supplier.id, supplierName: supplier.name, orderDate: new Date(), status: 'Draft', items: [{ inventoryItemId: item.id, description: 'Paper', quantity: 4, unitCost: 3 }] });
  assert.equal(store.listSalesOrders(b.id).length, 0, 'not while Draft');
  store.updatePurchaseOrderStatus(po.id, 'Ordered');
  const [so] = store.listSalesOrders(b.id);
  assert.equal(so.status, 'Draft');
  assert.equal(so.items[0].description, 'Paper');
  assert.equal(so.items[0].quantity, 4);
  assert.equal(so.items[0].inventoryItemId, undefined, 'items are each company\'s own');
  assert.equal(store.getClientById(so.clientId).name, 'Alpha');
});

// ── API ──────────────────────────────────────────────────────────────

test('the intercompany page is for those who run finance; matching needs the payment permission', async () => {
  const { store, a, b, invoice, billOf } = setup();
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const user = (role) => store.createUser({ name: role, email: `${role}${++seq}@ic.test`, password: 'x', role, companyIds: [a.id], companyRoles: [{ companyId: a.id, role }] });
  const as = (u) => `Bearer ${store.issueToken(u.id)}`;
  const admin = user('Admin');
  const employee = user('Employee');
  const inv = invoice(100);
  store.updateVendorBillStatus(billOf(inv).id, 'Approved');
  store.createVendorBillPayment({ billId: billOf(inv).id, amount: 100, paidAt: new Date() });

  assert.equal((await request(server).get(`/companies/${a.id}/intercompany`).set('Authorization', as(employee))).status, 403);
  const page = await request(server).get(`/companies/${a.id}/intercompany`).set('Authorization', as(admin));
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.deepEqual(page.body.sisters.map((s) => s.name).sort(), ['Beta', 'Group']);
  assert.ok(page.body.sisters.find((s) => s.name === 'Beta').clientId);
  assert.equal(page.body.toMatch.length, 1);

  assert.equal((await request(server).post(`/companies/${a.id}/intercompany/match-receipt`).set('Authorization', as(employee)).send({ paymentId: page.body.toMatch[0].paymentId })).status, 403);
  const matched = await request(server).post(`/companies/${a.id}/intercompany/match-receipt`).set('Authorization', as(admin)).send({ paymentId: page.body.toMatch[0].paymentId });
  assert.equal(matched.status, 200, JSON.stringify(matched.body));
  assert.equal(store.getInvoiceById(inv.id).status, 'Paid');

  const partner = await request(server).post(`/companies/${a.id}/intercompany/partners`).set('Authorization', as(admin)).send({ sisterId: b.id, kind: 'supplier' });
  assert.equal(partner.status, 201);
  const outside = store.createCompany({ name: 'Outside' });
  assert.equal((await request(server).post(`/companies/${a.id}/intercompany/partners`).set('Authorization', as(admin)).send({ sisterId: outside.id, kind: 'client' })).status, 400);
  server.close();
});

// ── Review fixes ─────────────────────────────────────────────────────

test('a credit note made from the invoice alone credits 1160, and shows as a difference', () => {
  const { store, a, b, invoice, billOf, lineOn } = setup();
  const inv = invoice(100);
  store.updateVendorBillStatus(billOf(inv).id, 'Approved');
  store.createCreditNote({ companyId: a.id, invoiceId: inv.id, lineItems: [{ description: 'Discount', amount: 40 }] });
  const net = (code) => lineOn(a.id, code).reduce((n, l) => n + l.debit - l.credit, 0);
  assert.equal(net('1160'), 60);
  assert.equal(net('1100'), 0, 'trade receivables untouched');
  const balance = store.intercompanyBalances(a.id).find((x) => x.sisterId === b.id);
  assert.equal(balance.difference, -40);
  assert.ok(balance.explain.some((e) => e.kind === 'credit_note' && e.amount === 40));
});

test('reversing a matched receipt offers the buyer\'s payment again', () => {
  const { store, a, invoice, billOf } = setup();
  const inv = invoice(100);
  const bill = billOf(inv);
  store.updateVendorBillStatus(bill.id, 'Approved');
  store.createVendorBillPayment({ billId: bill.id, amount: 100, paidAt: new Date() });
  const [item] = store.intercompanyToMatch(a.id);
  const { payment } = store.matchIntercompanyPayment(a.id, 'bill_payment', item.paymentId);
  assert.equal(store.intercompanyToMatch(a.id).length, 0);
  store.reverseInvoicePayment(payment.id);
  assert.equal(store.intercompanyToMatch(a.id).length, 1, 'offered again');
});

test('when both sides recorded their own payment, matching links them instead of paying twice', () => {
  const { store, a, b, invoice, billOf } = setup();
  const inv = invoice(100);
  const bill = billOf(inv);
  store.updateVendorBillStatus(bill.id, 'Approved');
  store.createVendorBillPayment({ billId: bill.id, amount: 100, paidAt: new Date() });
  store.createPayment({ invoiceId: inv.id, amount: 100, paidAt: new Date() });
  const [item] = store.intercompanyToMatch(a.id);
  const result = store.matchIntercompanyPayment(a.id, 'bill_payment', item.paymentId);
  assert.ok(result.linked);
  assert.equal(store.intercompanyToMatch(a.id).length, 0);
  assert.equal(store.intercompanyToMatch(b.id).length, 0, 'the seller\'s own receipt is linked too');
  assert.equal(store.listPayments(inv.id).length, 1, 'no second receipt');
});

test('after a credit note the match records only what is still open', () => {
  const { store, a, invoice, billOf } = setup();
  const inv = invoice(100);
  const bill = billOf(inv);
  store.updateVendorBillStatus(bill.id, 'Approved');
  store.createCreditNote({ companyId: a.id, invoiceId: inv.id, lineItems: [{ description: 'Discount', amount: 30 }] });
  store.createVendorBillPayment({ billId: bill.id, amount: 100, paidAt: new Date() });
  const [item] = store.intercompanyToMatch(a.id);
  const { payment } = store.matchIntercompanyPayment(a.id, 'bill_payment', item.paymentId);
  assert.equal(payment.amount, 70);
});

test('a mirrored bill keeps the invoice\'s amount, VAT and supplier', () => {
  const { store, invoice, billOf } = setup();
  const bill = billOf(invoice(100));
  assert.throws(() => store.updateVendorBill(bill.id, { amount: 80 }), (e) => e.status === 409);
  assert.ok(store.updateVendorBill(bill.id, { notes: 'Checked' }), 'other fields can change');
});

test('a company that leaves the group is an ordinary client again', () => {
  const { store, a, b, lineOn } = setup();
  const client = store.ensureIntercompanyPartner(a.id, b.id, 'client');
  store.setCompanyParent(b.id, null, null);
  store.createInvoice({ companyId: a.id, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Sent', lineItems: [{ description: 'W', quantity: 1, unitPrice: 10, amount: 10, itemType: 'Manual' }] });
  assert.equal(lineOn(a.id, '1160').length, 0);
  assert.equal(lineOn(a.id, '1100').length, 1);
});

test('an invoice moved back to Draft takes its Draft bill along, and issuing it again brings it back', () => {
  const { store, invoice, billOf } = setup();
  const inv = invoice(50);
  assert.ok(billOf(inv));
  store.updateInvoiceStatus(inv.id, 'Draft');
  assert.equal(billOf(inv), undefined);
  store.updateInvoiceStatus(inv.id, 'Sent');
  assert.ok(billOf(inv), 'mirrored again');
});
