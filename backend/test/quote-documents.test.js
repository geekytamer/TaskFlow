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
  assert.ok(outsider, 'seed has a user outside company 1');
  const bad = await as(request(app).put(`/quotations/${quote.id}`)).send({ ownerUserId: outsider.id });
  assert.equal(bad.status, 400);
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

test('converting drops sections and unticked optional lines; a ticked one counts', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  const order = await as(request(app).post(`/quotations/${quote.id}/sales-order`)).send({ includeOptional: [4] });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.deepEqual(order.body.items.map((i) => i.description), ['Discovery workshop', 'Design sprint', 'Extra revision round']);
  assert.ok(order.body.items.every((i) => i.lineType === undefined && i.optional === undefined));
  assert.equal(order.body.totalAmount, 1700);
});

test('invoicing a quote without ticking optional lines bills only counted lines', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Accepted' });
  const invoice = await as(request(app).post(`/quotations/${quote.id}/invoice`)).send({});
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  assert.equal(invoice.body.lineItems.length, 2);
  assert.equal(invoice.body.total, 1470);
  // A quote that can be invoiced: the 400 must come from the index check, not the status check.
  const accepted = await newQuote(app, as);
  await as(request(app).patch(`/quotations/${accepted.id}/status`)).send({ status: 'Accepted' });
  const bad = await as(request(app).post(`/quotations/${accepted.id}/invoice`)).send({ includeOptional: [1] });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  assert.match(bad.body.error || bad.body.message || '', /optional/i);
  const worse = await as(request(app).post(`/quotations/${accepted.id}/invoice`)).send({ includeOptional: 'x' });
  assert.equal(worse.status, 400);
});

test('copy quote makes a fresh draft with the same lines, text and salesperson', async () => {
  const { app, as } = setup();
  const quote = await newQuote(app, as, { content: { terms }, notes: 'n' });
  await as(request(app).patch(`/quotations/${quote.id}/status`)).send({ status: 'Declined' });
  const copy = await as(request(app).post(`/quotations/${quote.id}/copy`));
  assert.equal(copy.status, 201, JSON.stringify(copy.body));
  assert.notEqual(copy.body.id, quote.id);
  assert.notEqual(copy.body.quoteNumber, quote.quoteNumber);
  assert.equal(copy.body.status, 'Draft');
  assert.deepEqual(copy.body.items, quote.items);
  assert.equal(copy.body.notes, 'n');
  assert.equal(copy.body.ownerUserId, quote.ownerUserId);
  assert.deepEqual(copy.body.content, { terms });
  assert.ok(new Date(copy.body.validUntil) > new Date(Date.now() + 29 * 86400000));
});

test('deleting the salesperson clears the quote owner', async () => {
  const { app, as, store } = setup();
  const user = store.createUser({ name: 'Seller', email: 'seller@x.example', password: 'Password1!', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }], role: 'Employee' });
  const quote = await newQuote(app, as);
  const put = await as(request(app).put(`/quotations/${quote.id}`)).send({ ownerUserId: user.id });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.ownerUserId, user.id);
  store.deleteUser(user.id);
  const read = await as(request(app).get(`/quotations/${quote.id}`));
  assert.equal(read.body.ownerUserId, undefined);
});

test('the public quote carries lines, quote data and text, still with no opportunity', async () => {
  const { app, as } = setup();
  const contact = (await as(request(app).post('/companies/1/contacts')).send({ name: 'Gulf Retail LLC', contactPerson: 'Sara', phone: '+968 9000 0000' })).body;
  const opp = (await as(request(app).post('/companies/1/opportunities')).send({ contactId: contact.id, title: 'Secret deal', serviceType: 'Web' })).body;
  const quote = await newQuote(app, as, { opportunityId: opp.id, content: { terms } });
  const res = await request(app).get(`/public/quotations/${quote.id}`);
  assert.equal(res.status, 200);
  const q = res.body.quotation;
  assert.equal(q.items[0].lineType, 'section');
  assert.equal(q.items[4].optional, true);
  assert.equal(q.items[1].details, 'Two half-day sessions');
  assert.equal(q.extras['contact.name'].value, 'Sara');
  assert.equal(q.extras['contact.phone'].value, '+968 9000 0000');
  assert.equal(q.extras['fields.validUntil'].type, 'date');
  assert.ok(q.extras['owner.name'].value);
  assert.deepEqual(q.content, { terms });
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes(opp.id) && !raw.includes('Secret deal'));
});

test('a quote template may use slots, new columns and new conditions', async () => {
  const { app, as } = setup();
  const doc = {
    version: 1, page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } },
    theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#222222', textColor: '#333333' },
    body: [
      { id: 's1', type: 'slot', slot: 'terms', fallback: 'Payment in 30 days.' },
      { id: 'l1', type: 'lineItems', visibleWhen: 'hasOptionalLines', columns: [
        { id: 'c1', key: 'index', label: '#', visible: true }, { id: 'c2', key: 'unit', label: 'Unit', visible: true }, { id: 'c3', key: 'discount', label: 'Off', visible: true },
      ] },
      { id: 't1', type: 'text', content: 'x', visibleWhen: 'lang:ar' },
    ],
  };
  const res = await as(request(app).post('/companies/1/invoice-templates')).send({ name: 'Proposal', docType: 'quote', layout: 'classic', primaryColor: '#111111', accentColor: '#222222', doc });
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  const bad = await as(request(app).post('/companies/1/invoice-templates')).send({ name: 'Bad', docType: 'quote', layout: 'classic', primaryColor: '#111111', accentColor: '#222222',
    doc: { ...doc, body: [{ id: 's1', type: 'slot', slot: 'Bad Slot!' }] } });
  assert.equal(bad.status, 400);
});
