const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Customer returns: goods come back against a shipped delivery. Restocked
 * goods return to the shelf and their cost comes off cost of sales; scrapped
 * goods move nothing. A credit note for the goods can be issued on receipt.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-returns-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  return { app, store, as };
}

const balance = (store, code) => {
  const account = store.listLedgerAccounts('1').find((a) => a.code === code);
  return store.listJournalEntries('1', 10000).flatMap((e) => e.lines).filter((l) => l.accountId === account.id)
    .reduce((sum, l) => sum + l.debit - l.credit, 0);
};

/** 12 boxes at 20 (cost 12) ordered, 10 shipped, invoiced with 5% VAT. */
async function shipped({ app, store, as }) {
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  const item = store.createInventoryItem({ companyId: '1', name: 'Gift box', category: 'Dates', sku: 'GB1', unit: 'box', unitPrice: 20, unitCost: 12, onHand: 50 });
  const order = (await as(request(app).post('/companies/1/sales-orders')).send({
    clientId: client.id, orderDate: new Date().toISOString(), status: 'Confirmed',
    items: [{ inventoryItemId: item.id, description: 'Gift box', quantity: 12, unitPrice: 20 }],
  })).body;
  const delivery = (await as(request(app).post(`/sales-orders/${order.id}/deliveries`)).send({ items: [{ salesOrderLineIndex: 0, quantity: 10 }] })).body;
  const ship = await as(request(app).patch(`/deliveries/${delivery.id}/status`)).send({ status: 'Shipped' });
  assert.equal(ship.status, 200, JSON.stringify(ship.body));
  const invoice = (await as(request(app).post(`/sales-orders/${order.id}/invoice`)).send({})).body;
  store.updateInvoice(invoice.id, { taxRate: 5 });
  assert.equal((await as(request(app).patch(`/invoices/${invoice.id}/status`)).send({ status: 'Sent' })).status, 200);
  return { client, item, order, delivery, invoice: store.getInvoiceById(invoice.id) };
}

test('restocked goods go back on the shelf and their cost comes off cost of sales; scrapped goods move nothing', async () => {
  const ctx = setup();
  const { item, delivery, invoice } = await shipped(ctx);
  const { app, store, as } = ctx;
  assert.equal(store.getInventoryItemById(item.id).onHand, 40);
  const stockBefore = balance(store, '1200');
  const cogsBefore = balance(store, '5100');

  const created = await as(request(app).post('/companies/1/customer-returns')).send({
    deliveryId: delivery.id, reason: 'Crushed boxes',
    items: [{ deliveryLineIndex: 0, quantity: 3, condition: 'Restock' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.returnNumber, 'RMA-0001');
  assert.equal(store.getInventoryItemById(item.id).onHand, 40, 'nothing moves until received');

  const received = await as(request(app).post(`/customer-returns/${created.body.id}/receipt`)).send({ issueCredit: true });
  assert.equal(received.status, 200, JSON.stringify(received.body));
  assert.equal(received.body.status, 'Received');
  assert.equal(store.getInventoryItemById(item.id).onHand, 43);
  assert.equal(Number((balance(store, '1200') - stockBefore).toFixed(2)), 36, 'stock value up 3 × 12');
  assert.equal(Number((balance(store, '5100') - cogsBefore).toFixed(2)), -36, 'cost of sales down by the same');
  const note = store.getCreditNoteById(received.body.creditNoteId);
  assert.equal(note.invoiceId, invoice.id);
  assert.equal(note.total, 63, '3 × 20 plus 5% VAT');
  assert.equal(store.getInvoiceById(invoice.id).outstandingAmount, Number((invoice.total - 63).toFixed(2)));

  const scrap = (await as(request(app).post('/companies/1/customer-returns')).send({ deliveryId: delivery.id, items: [{ deliveryLineIndex: 0, quantity: 2, condition: 'Scrap' }] })).body;
  const stockMid = balance(store, '1200');
  assert.equal((await as(request(app).post(`/customer-returns/${scrap.id}/receipt`)).send({})).status, 200);
  assert.equal(store.getInventoryItemById(item.id).onHand, 43, 'scrap does not restock');
  assert.equal(balance(store, '1200'), stockMid, 'and does not change stock value');
});

test('a line cannot return more than was shipped less earlier returns; only shipped goods; only drafts are cancelled', async () => {
  const ctx = setup();
  const { delivery, order } = await shipped(ctx);
  const { app, store, as } = ctx;
  const ret = (qty) => as(request(app).post('/companies/1/customer-returns')).send({ deliveryId: delivery.id, items: [{ deliveryLineIndex: 0, quantity: qty }] });
  assert.equal((await ret(11)).status, 400);
  const first = (await ret(6)).body;
  assert.equal((await ret(5)).status, 400, 'a draft return already holds 6 of 10');
  assert.equal((await as(request(app).post(`/customer-returns/${first.id}/cancel`)).send({})).status, 200);
  assert.equal((await ret(10)).status, 201, 'a cancelled return frees its quantity');

  const second = store.listCustomerReturns('1').find((r) => r.status === 'Draft');
  assert.equal((await as(request(app).post(`/customer-returns/${second.id}/receipt`)).send({})).status, 200);
  assert.equal((await as(request(app).post(`/customer-returns/${second.id}/receipt`)).send({})).status, 409, 'once');
  assert.equal((await as(request(app).post(`/customer-returns/${second.id}/cancel`)).send({})).status, 409, 'a received return stays');

  const pending = (await as(request(app).post(`/sales-orders/${order.id}/deliveries`)).send({ items: [{ salesOrderLineIndex: 0, quantity: 1 }] })).body;
  assert.ok(pending.id, JSON.stringify(pending));
  assert.equal((await as(request(app).post('/companies/1/customer-returns')).send({ deliveryId: pending.id, items: [{ deliveryLineIndex: 0, quantity: 1 }] })).status, 400, 'not shipped');
  const other = store.listUsers().find((u) => u.email === 'dana.s@synergysolutions.com');
  const res = await request(app).get('/companies/1/customer-returns').set('Authorization', `Bearer ${store.issueToken(other.id)}`);
  assert.equal(res.status, 403, 'another company');
});

test('cancelling a shipped delivery reverses its cost of sales as well as its stock', async () => {
  const ctx = setup();
  const { app, store, as } = ctx;
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  const item = store.createInventoryItem({ companyId: '1', name: 'Gift box', category: 'Dates', sku: 'GB2', unit: 'box', unitPrice: 20, unitCost: 12, onHand: 50 });
  const order = (await as(request(app).post('/companies/1/sales-orders')).send({ clientId: client.id, orderDate: new Date().toISOString(), status: 'Confirmed', items: [{ inventoryItemId: item.id, description: 'Gift box', quantity: 5, unitPrice: 20 }] })).body;
  const delivery = (await as(request(app).post(`/sales-orders/${order.id}/deliveries`)).send({ items: [{ salesOrderLineIndex: 0, quantity: 5 }] })).body;
  const stock = balance(store, '1200');
  const cogs = balance(store, '5100');
  await as(request(app).patch(`/deliveries/${delivery.id}/status`)).send({ status: 'Shipped' });
  assert.equal(Number((balance(store, '5100') - cogs).toFixed(2)), 60);
  const cancel = await as(request(app).post(`/deliveries/${delivery.id}/cancel`)).send({ reason: 'Wrong address' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(Number(balance(store, '5100').toFixed(2)), Number(cogs.toFixed(2)), 'cost of sales back where it was');
  assert.equal(Number(balance(store, '1200').toFixed(2)), Number(stock.toFixed(2)), 'stock value back where it was');
  assert.equal(store.getInventoryItemById(item.id).onHand, 50);
});

test('a delivery being prepared already claims its units: a second one cannot take them again', async () => {
  const { app, store, as } = setup();
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  const item = store.createInventoryItem({ companyId: '1', name: 'Gift box', category: 'Dates', sku: 'GB3', unit: 'box', unitPrice: 20, unitCost: 12, onHand: 50 });
  const order = (await as(request(app).post('/companies/1/sales-orders')).send({ clientId: client.id, orderDate: new Date().toISOString(), status: 'Confirmed', items: [{ inventoryItemId: item.id, description: 'Gift box', quantity: 4, unitPrice: 20 }] })).body;
  const deliver = (qty) => as(request(app).post(`/sales-orders/${order.id}/deliveries`)).send({ items: [{ salesOrderLineIndex: 0, quantity: qty }] });
  const first = await deliver(3);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal((await deliver(2)).status, 400, 'only 1 is left');
  assert.equal((await deliver(1)).status, 201);
  await as(request(app).post(`/deliveries/${first.body.id}/cancel`)).send({});
  assert.equal((await deliver(3)).status, 201, 'a cancelled delivery frees its units');
});

test('with a credit-note policy the goods come back now and the credit waits, then links to the return when approved', async () => {
  const ctx = setup();
  const { delivery, invoice } = await shipped(ctx);
  const { app, store, as } = ctx;
  const cfo = store.createUser({ name: 'CFO', email: 'cfo@returns.test', password: 'x', role: 'Employee', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }] });
  store.approvals.setPolicy('1', 'credit_note', { steps: [{ approvers: [{ kind: 'user', id: cfo.id }], need: 'any' }] });
  const created = (await as(request(app).post('/companies/1/customer-returns')).send({ deliveryId: delivery.id, items: [{ deliveryLineIndex: 0, quantity: 2, condition: 'Restock' }] })).body;
  const received = await as(request(app).post(`/customer-returns/${created.id}/receipt`)).send({ issueCredit: true });
  assert.equal(received.status, 200, JSON.stringify(received.body));
  assert.equal(received.body.status, 'Received');
  assert.equal(received.body.creditNoteId ?? null, null, 'no credit yet');
  const [hold] = store.listApprovalHolds('1', { docType: 'credit_note', targetId: invoice.id });
  assert.equal(hold.status, 'pending');
  store.decideApproval('credit_note', hold.id, { id: cfo.id, name: cfo.name }, 'approve');
  const note = store.getCreditNoteById(store.getApprovalHold(hold.id).resultId);
  assert.equal(store.getCustomerReturnById(created.id).creditNoteId, note.id);
});

test('a second return on an invoice is received while the first one\'s credit waits: its credit is trimmed to what is left', async () => {
  const ctx = setup();
  const { delivery, invoice } = await shipped(ctx);
  const { app, store, as } = ctx;
  const cfo = store.createUser({ name: 'CFO2', email: 'cfo2@returns.test', password: 'x', role: 'Employee', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }] });
  store.approvals.setPolicy('1', 'credit_note', { steps: [{ approvers: [{ kind: 'user', id: cfo.id }], need: 'any' }] });
  const ret = async (qty) => {
    const created = (await as(request(app).post('/companies/1/customer-returns')).send({ deliveryId: delivery.id, items: [{ deliveryLineIndex: 0, quantity: qty, condition: 'Restock' }] })).body;
    return as(request(app).post(`/customer-returns/${created.id}/receipt`)).send({ issueCredit: true });
  };
  assert.equal((await ret(6)).status, 200);
  const second = await ret(4);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const held = store.listApprovalHolds('1', { docType: 'credit_note', targetId: invoice.id, status: 'pending' });
  assert.equal(held.length, 2);
  assert.ok(held.reduce((s, h) => s + h.amount, 0) <= invoice.total + 0.001, 'never more than the invoice');
});
