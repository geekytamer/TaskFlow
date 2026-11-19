const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-quote-docs-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const token = `Bearer ${store.issueToken(admin.id)}`;
  const as = (req) => req.set('Authorization', token);
  return { store, app, as, admin };
}

const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

const mixedLines = [
  { lineType: 'section', description: 'Package A' },
  { description: 'Discovery workshop', quantity: 2, unitPrice: 250, unit: 'day', details: 'Two half-day sessions' },
  { description: 'Design sprint', quantity: 1, unitPrice: 1000, discount: 10, discountType: 'percent' },
  { lineType: 'section', description: 'Extras' },
  { description: 'Extra revision round', quantity: 1, unitPrice: 300, optional: true },
];

async function newQuote(app, as, extra = {}) {
  const res = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', issueDate: new Date().toISOString(), validUntil: tomorrow(), taxRate: 5, items: mixedLines, ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('section and optional lines are kept but only counted lines make the total', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  assert.equal(quote.items.length, 5);
  assert.deepEqual(quote.items[0], { lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, lineTotal: 0 });
  assert.equal(quote.items[1].unit, 'day');
  assert.equal(quote.items[1].details, 'Two half-day sessions');
  assert.equal(quote.items[4].optional, true);
  assert.equal(quote.items[4].lineTotal, 300);
  assert.equal(quote.subtotal, 1400); // 500 + 900; the optional 300 is left out
  assert.equal(quote.taxAmount, 70);
  assert.equal(quote.totalAmount, 1470);
});

test('a quotation needs at least one counted line', async () => {
  const { app, as } = setup();
  const res = await as(request(app).post('/companies/1/quotations')).send({
    clientId: 'client-1', validUntil: tomorrow(),
    items: [{ lineType: 'section', description: 'Only a heading' }, { description: 'Maybe', quantity: 1, unitPrice: 5, optional: true }],
  });
  assert.equal(res.status, 400);
});

test('old-style lines are stored exactly as before', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as, { items: [{ description: 'Plain line', quantity: 1, unitPrice: 100 }] });
  assert.deepEqual(Object.keys(quote.items[0]).sort(), ['description', 'lineTotal', 'quantity', 'unitPrice']);
});

test('editing keeps sections and optional lines', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  const res = await as(request(app).put(`/quotations/${quote.id}`)).send({ items: mixedLines.slice(0, 3) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.items[0].lineType, 'section');
  assert.equal(res.body.subtotal, 1400);
});

const terms = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valid for 30 days.' }] }] };

test('a quote has a salesperson: the creator unless chosen, and must be a company member', async () => {
  const { app, as, admin, store } = setup();
  const quote = await newQuote(app, as);
  assert.equal(quote.ownerUserId, admin.id);
  assert.equal(quote.ownerName, admin.name);
  const outsider = store.listUsers().find((u) => !(u.companyIds || []).includes('1'));
  if (outsider) {
    const bad = await as(request(app).put(`/quotations/${quote.id}`)).send({ ownerUserId: outsider.id });
    assert.equal(bad.status, 400);
  }
});

test('reading a quote back returns the same lines (decode path)', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  const read = await as(request(app).get(`/quotations/${quote.id}`));
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.items, quote.items);
  assert.equal(read.body.items[0].lineType, 'section');
  assert.equal(read.body.items[4].optional, true);
});

test('per-quote text is saved, returned on the quote, editable while open and removed with the quote', async () => {
  const { app, as, store } = setup();
  const quote = await newQuote(app, as, { content: { terms, intro: 'Dear client,' } });
  const read = await as(request(app).get(`/quotations/${quote.id}`));
  assert.deepEqual(read.body.content, { terms, intro: 'Dear client,' });

  const cleared = await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { intro: null } });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.deepEqual(cleared.body.content, { terms });

  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { 'bad key!': 'x' } })).status, 400);
  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { scope: 'x'.repeat(60001) } })).status, 400);

  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  assert.equal((await as(request(app).put(`/quotations/${quote.id}`)).send({ content: { terms: 'changed' } })).status, 400);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Draft' });
  await as(request(app).delete(`/quotations/${quote.id}`));
  assert.deepEqual(store.getDocumentContent('quote', quote.id), {});
});
