const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Credit limits: a change that takes a client past their limit is refused,
 * counting unpaid issued invoices and confirmed orders not yet invoiced.
 * Only increases are refused; Admins and Accountants may override.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-credit-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const as = (user) => (req) => req.set('Authorization', `Bearer ${store.issueToken(user.id)}`);
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const accountant = store.createUser({ name: 'Layla Accountant', email: 'layla@x.example', password: 'Password1!', role: 'Accountant', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Accountant' }] });
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  store.updateClient(client.id, { creditLimit: 1000 });
  return { app, store, client, manager: as(manager), accountant: as(accountant) };
}

const invoiceBody = (clientId, amount, status = 'Sent') => ({
  companyId: '1', clientId, issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  status, taxRate: 0, lineItems: [{ itemType: 'Manual', description: 'Dates', quantity: 1, unitPrice: amount, amount }],
});

test('issuing an invoice past the credit limit is refused; drafts and invoices within the limit are not', async () => {
  const { app, store, client, manager } = setup();
  assert.equal((await manager(request(app).post('/invoices')).send(invoiceBody(client.id, 600))).status, 201);
  assert.equal(store.clientCreditExposure(client.id), 600);

  const over = await manager(request(app).post('/invoices')).send(invoiceBody(client.id, 500));
  assert.equal(over.status, 409, JSON.stringify(over.body));
  assert.deepEqual([over.body.code, over.body.limit, over.body.owed, over.body.adding, over.body.canOverride], ['CREDIT_LIMIT_EXCEEDED', 1000, 600, 500, false]);
  assert.equal(store.listInvoices('1').filter((i) => i.clientId === client.id).length, 1, 'nothing was created');

  const draft = await manager(request(app).post('/invoices')).send(invoiceBody(client.id, 500, 'Draft'));
  assert.equal(draft.status, 201, 'a draft owes nothing');
  assert.equal((await manager(request(app).patch(`/invoices/${draft.body.id}/status`)).send({ status: 'Sent' })).status, 409, 'sending it would');
  assert.equal(store.getInvoiceById(draft.body.id).status, 'Draft', 'and it stays a draft');
  const bulk = await manager(request(app).post('/companies/1/invoices/bulk-status')).send({ targetStatus: 'Sent', invoiceIds: [draft.body.id] });
  assert.equal(bulk.status, 409, 'bulk sending too');
  assert.equal(store.getInvoiceById(draft.body.id).status, 'Draft');
});

test('a payment makes room again; only an Admin or Accountant can override', async () => {
  const { app, store, client, manager, accountant } = setup();
  const first = await manager(request(app).post('/invoices')).send(invoiceBody(client.id, 900));
  assert.equal((await manager(request(app).post('/invoices')).send(invoiceBody(client.id, 200))).status, 409);
  assert.equal((await manager(request(app).post('/invoices')).send({ ...invoiceBody(client.id, 200), overrideCreditLimit: true })).status, 409, 'a manager cannot override');

  const refused = await accountant(request(app).post('/invoices')).send(invoiceBody(client.id, 200));
  assert.equal(refused.body.canOverride, true);
  assert.equal((await accountant(request(app).post('/invoices')).send({ ...invoiceBody(client.id, 200), overrideCreditLimit: true })).status, 201, 'an accountant can');

  store.createPayment({ invoiceId: first.body.id, amount: 900, method: 'Bank Transfer', paidAt: new Date() });
  assert.equal(store.clientCreditExposure(client.id), 200);
  assert.equal((await manager(request(app).post('/invoices')).send(invoiceBody(client.id, 700))).status, 201, 'paid invoices free the limit');
});

test('confirmed orders count toward the limit, and invoicing them does not count twice', async () => {
  const { app, store, client, manager } = setup();
  const item = store.createInventoryItem({ companyId: '1', name: 'Khalas dates 1kg', category: 'Dates', sku: 'KD1', unit: 'kg', unitPrice: 10, unitCost: 6, quantityOnHand: 500 });
  const order = (status, qty) => manager(request(app).post('/companies/1/sales-orders')).send({ clientId: client.id, orderDate: new Date().toISOString(), status, items: [{ inventoryItemId: item.id, description: 'Dates', quantity: qty, unitPrice: 10 }] });
  const confirmed = await order('Confirmed', 80);
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
  assert.equal(store.clientCreditExposure(client.id), 800);
  assert.equal((await order('Confirmed', 30)).status, 409, 'a second order would pass the limit');
  const draft = await order('Draft', 30);
  assert.equal(draft.status, 201);
  assert.equal((await manager(request(app).patch(`/sales-orders/${draft.body.id}/status`)).send({ status: 'Confirmed' })).status, 409);

  // The limit is lowered below what they already owe: work already agreed can still be invoiced.
  store.updateClient(client.id, { creditLimit: 500 });
  const invoice = await manager(request(app).post(`/sales-orders/${confirmed.body.id}/invoice`)).send({});
  assert.ok([200, 201].includes(invoice.status), JSON.stringify(invoice.body));
  const sent = await manager(request(app).patch(`/invoices/${invoice.body.id}/status`)).send({ status: 'Sent' });
  assert.equal(sent.status, 200, `invoicing a confirmed order moves it, it does not add: ${JSON.stringify(sent.body)}`);
});
