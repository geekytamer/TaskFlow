const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-quotes-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const token = `Bearer ${store.issueToken(admin.id)}`;
  const as = (req) => req.set('Authorization', token);
  return { store, app, as };
}

const lines = [
  { description: 'Discovery workshop', quantity: 2, unitPrice: 250 },
  { description: 'Design sprint', quantity: 1, unitPrice: 1000, discount: 10, discountType: 'percent' },
];

const tomorrow = () => new Date(Date.now() + 86400000).toISOString();
const yesterday = () => new Date(Date.now() - 86400000).toISOString();

async function newQuote(app, as, extra = {}) {
  const res = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', issueDate: new Date().toISOString(), validUntil: tomorrow(), taxRate: 5, items: lines, ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('a quotation numbers itself and computes subtotal, VAT and total on the server', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as, { subtotal: 1, totalAmount: 1 });
  assert.match(quote.quoteNumber, /^QT-\d{4}$/);
  assert.equal(quote.status, 'Draft');
  assert.equal(quote.subtotal, 1400); // 500 + 900
  assert.equal(quote.taxAmount, 70);
  assert.equal(quote.totalAmount, 1470);
  assert.equal(quote.currency, 'USD');

  const list = await as(request(app).get('/companies/1/quotations'));
  assert.equal(list.status, 200);
  assert.ok(list.body.some((q) => q.id === quote.id));
  const second = await newQuote(app, as);
  assert.notEqual(second.quoteNumber, quote.quoteNumber);
});

test('a quotation needs a client, a line and a valid-until on or after its date', async () => {
  const { app, as } = setup();
  const base = { clientId: 'client-1', issueDate: new Date().toISOString(), validUntil: tomorrow(), items: lines };
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, clientId: undefined })).status, 400);
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, items: [] })).status, 400);
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, validUntil: yesterday(), issueDate: new Date().toISOString() })).status, 400);
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, currency: 'EUR' })).status, 400, 'a foreign currency needs a rate');
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, currency: 'EUR', exchangeRate: 1.1 })).status, 201);
});

test('a quotation from another company is invisible and untouchable', async () => {
  const { app, as, store } = setup();
  const quote = await newQuote(app, as);
  const other = store.listCompanies().find((c) => c.id !== '1');
  if (other) {
    const res = await as(request(app).get(`/companies/${other.id}/quotations`));
    assert.ok(res.status !== 200 || !res.body.some((q) => q.id === quote.id));
  }
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'no-such-client', issueDate: new Date().toISOString(), validUntil: tomorrow(), items: lines,
  })).status, 400);
});

test('editing works until the quotation is accepted, declined or converted', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  const edited = await as(request(app).put(`/quotations/${quote.id}`)).send({
    items: [{ description: 'Only line', quantity: 1, unitPrice: 100 }], taxRate: 0, notes: 'Revised',
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.totalAmount, 100);
  assert.equal(edited.body.notes, 'Revised');
  assert.equal(edited.body.quoteNumber, quote.quoteNumber);

  assert.equal((await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' })).status, 200);
  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ notes: 'late' })).status, 400);
});

test('status moves follow the rules and stamp their dates', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  const sent = await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Sent' });
  assert.equal(sent.body.status, 'Sent');
  assert.ok(sent.body.sentAt);
  const declined = await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Declined' });
  assert.equal(declined.body.status, 'Declined');
  assert.ok(declined.body.declinedAt);
  assert.equal((await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' })).status, 400, 'reopen first');
  const reopened = await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Draft' });
  assert.equal(reopened.body.status, 'Draft');
  assert.equal((await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Expired' })).status, 400, 'expired is derived, not set');
});

test('a quotation past its valid-until reads as Expired and cannot be accepted until extended', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as, { issueDate: new Date(Date.now() - 5 * 86400000).toISOString(), validUntil: yesterday() });
  const fetched = await as(request(app).get(`/quotations/${quote.id}`));
  assert.equal(fetched.body.status, 'Expired');
  assert.equal((await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' })).status, 400);
  const extended = await as(request(app).put(`/quotations/${quote.id}`)).send({ validUntil: tomorrow() });
  assert.equal(extended.status, 200);
  assert.equal(extended.body.status, 'Draft');
  assert.equal((await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' })).status, 200);
});

test('an accepted quotation becomes an invoice with its lines, discounts and VAT, once', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  assert.equal((await as(request(app).post(`/quotations/${quote.id}/invoice`)).send({})).status, 400, 'only when accepted');
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });

  const invoice = await as(request(app).post(`/quotations/${quote.id}/invoice`)).send({});
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  assert.equal(invoice.body.status, 'Draft');
  assert.equal(invoice.body.taxRate, 5);
  assert.equal(invoice.body.total, 1470);
  assert.equal(invoice.body.lineItems.length, 2);
  assert.match(invoice.body.notes, new RegExp(quote.quoteNumber));

  const again = await as(request(app).post(`/quotations/${quote.id}/invoice`)).send({});
  assert.equal(again.status, 200);
  assert.equal(again.body.id, invoice.body.id);
  assert.equal((await as(request(app).post(`/quotations/${quote.id}/sales-order`)).send({})).status, 409);

  const after = await as(request(app).get(`/quotations/${quote.id}`));
  assert.equal(after.body.invoiceId, invoice.body.id);
  assert.equal((await as(request(app).delete(`/quotations/${quote.id}`))).status, 409, 'converted quotes stay');

  // Deleting the invoice releases the quotation.
  assert.equal((await as(request(app).delete(`/invoices/${invoice.body.id}`))).status, 204);
  const released = await as(request(app).get(`/quotations/${quote.id}`));
  assert.equal(released.body.invoiceId, undefined);
});

test('an accepted quotation becomes a confirmed sales order whose invoice keeps the VAT', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  const order = await as(request(app).post(`/quotations/${quote.id}/sales-order`)).send({});
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(order.body.status, 'Confirmed');
  assert.equal(order.body.clientId, 'client-1');
  assert.equal(order.body.totalAmount, 1400);
  assert.equal((await as(request(app).post(`/quotations/${quote.id}/invoice`)).send({})).status, 409);

  const invoice = await as(request(app).post(`/sales-orders/${order.body.id}/invoice`)).send({});
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  assert.equal(invoice.body.taxRate, 5);
  assert.equal(invoice.body.total, 1470, 'discounted line survives the sales order');
});

test('deleting a sales order made from a quotation releases the quotation', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  const order = await as(request(app).post(`/quotations/${quote.id}/sales-order`)).send({});
  assert.equal((await as(request(app).delete(`/sales-orders/${order.body.id}`))).status, 204);
  const released = await as(request(app).get(`/quotations/${quote.id}`));
  assert.equal(released.body.salesOrderId, undefined);
});

test('a quotation from an opportunity takes its client and lists under it', async () => {
  const { app, as } = setup();
  const contact = (await as(request(app).post('/companies/1/contacts')).send({ name: 'Gulf Retail LLC', roles: ['Lead'] })).body;
  const opp = await as(request(app).post('/companies/1/opportunities')).send({
    contactId: contact.id, title: 'Website rebuild', serviceType: 'Web',
  });
  assert.equal(opp.status, 201, JSON.stringify(opp.body));
  const quote = await as(request(app).post('/companies/1/quotations')).send({
    opportunityId: opp.body.id, issueDate: new Date().toISOString(), validUntil: tomorrow(), items: lines,
  });
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  assert.equal(quote.body.opportunityId, opp.body.id);
  assert.equal(quote.body.contactId, contact.id);
  assert.ok(quote.body.clientId);

  const forOpp = await as(request(app).get(`/companies/1/quotations?opportunityId=${opp.body.id}`));
  assert.deepEqual(forOpp.body.map((q) => q.id), [quote.body.id]);
});

test('a quotation template must be a quote template of the same company', async () => {
  const { app, as } = setup();
  const invoiceTemplate = await as(request(app).post('/companies/1/invoice-templates')).send({ name: 'Inv', docType: 'invoice', layout: 'modern', primaryColor: '#123456', accentColor: '#654321' });
  const quoteTemplate = await as(request(app).post('/companies/1/invoice-templates')).send({ name: 'Quote', docType: 'quote', layout: 'modern', primaryColor: '#123456', accentColor: '#654321' });
  assert.equal(invoiceTemplate.status, 201, JSON.stringify(invoiceTemplate.body));
  assert.equal(quoteTemplate.status, 201, JSON.stringify(quoteTemplate.body));
  const base = { clientId: 'client-1', issueDate: new Date().toISOString(), validUntil: tomorrow(), items: lines };
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, templateId: invoiceTemplate.body.id })).status, 400);
  assert.equal((await as(request(app).post('/companies/1/quotations')).send({ ...base, templateId: quoteTemplate.body.id })).status, 201);
});

test('the public quotation shows the document and nothing internal', async () => {
  const { app, as } = setup();
  const contact = (await as(request(app).post('/companies/1/contacts')).send({ name: 'Gulf Retail LLC' })).body;
  const opp = await as(request(app).post('/companies/1/opportunities')).send({ contactId: contact.id, title: 'Secret deal', serviceType: 'Web' });
  const quote = await newQuote(app, as, { opportunityId: opp.body.id, notes: 'Thanks for your interest' });
  const res = await request(app).get(`/public/quotations/${quote.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.quotation.quoteNumber, quote.quoteNumber);
  assert.equal(res.body.quotation.totalAmount, 1470);
  assert.equal(res.body.quotation.notes, 'Thanks for your interest');
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes(opp.body.id), 'no opportunity id');
  assert.ok(!raw.includes('Secret deal'), 'no opportunity title');
  assert.equal(res.body.quotation.opportunityId, undefined);
  assert.equal((await request(app).get('/public/quotations/nope')).status, 404);
});

test('a draft quotation can be deleted', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  assert.equal((await as(request(app).delete(`/quotations/${quote.id}`))).status, 204);
  assert.equal((await as(request(app).get(`/quotations/${quote.id}`))).status, 404);
});
