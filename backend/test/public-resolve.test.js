const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-resolve-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  return { store, app, as };
}

const template = (docType) => ({ name: docType, docType, layout: 'modern', primaryColor: '#123456', accentColor: '#654321' });

test('a scanned QR finds its document whatever kind it is', async () => {
  const { app, as } = setup();
  const invoice = await as(request(app).post('/invoices')).send({
    companyId: '1', clientId: 'client-1', issueDate: new Date().toISOString(), dueDate: new Date().toISOString(),
    lineItems: [{ itemType: 'Manual', description: 'Work', quantity: 1, unitPrice: 10, amount: 10 }], total: 10, status: 'Draft',
  });
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  const quote = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', items: [{ description: 'Work', quantity: 1, unitPrice: 10 }],
  });
  const letterTemplate = await as(request(app).post('/companies/1/invoice-templates')).send(template('letter'));
  assert.equal(letterTemplate.status, 201, JSON.stringify(letterTemplate.body));
  const letter = await as(request(app).post('/companies/1/documents')).send({ templateId: letterTemplate.body.id, title: 'Welcome letter' });
  assert.equal(letter.status, 201, JSON.stringify(letter.body));

  const kinds = {};
  for (const [name, id] of [['invoice', invoice.body.id], ['quotation', quote.body.id], ['document', letter.body.id]]) {
    const res = await request(app).get(`/public/resolve/${id}`);
    assert.equal(res.status, 200, name);
    kinds[name] = res.body;
  }
  assert.deepEqual(kinds.invoice, { kind: 'invoice', id: invoice.body.id });
  assert.deepEqual(kinds.quotation, { kind: 'quotation', id: quote.body.id });
  assert.deepEqual(kinds.document, { kind: 'document', id: letter.body.id });
  assert.equal((await request(app).get('/public/resolve/no-such-thing')).status, 404);
});

test('the resolver says nothing about a document whose module is switched off', async () => {
  const { app, as, store } = setup();
  const quote = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', items: [{ description: 'Work', quantity: 1, unitPrice: 10 }],
  });
  const company = store.getCompanyById('1');
  store.updateCompany('1', { disabledModules: [...(company.disabledModules || []), 'sales'] });
  assert.equal((await request(app).get(`/public/resolve/${quote.body.id}`)).status, 404);
});
