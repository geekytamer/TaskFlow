const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-docfields-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  return { app, as };
}

async function letter(app, as, extra = {}) {
  const template = await as(request(app).post('/companies/1/invoice-templates')).send({
    name: 'Letter', docType: 'letter', layout: 'modern', primaryColor: '#123456', accentColor: '#654321',
  });
  const doc = await as(request(app).post('/companies/1/documents')).send({
    templateId: template.body.id, title: 'Offer letter',
    fieldValues: { 'document.notes': 'Dear {{field.recipient}}', 'field.recipient': 'Sara', 'field.salary': '900' }, ...extra,
  });
  assert.equal(doc.status, 201, JSON.stringify(doc.body));
  return doc.body;
}

test('a document keeps its fill-in fields and the public copy carries them', async () => {
  const { app, as } = setup();
  const doc = await letter(app, as);
  assert.equal(doc.fieldValues['field.recipient'], 'Sara');
  const pub = await request(app).get(`/public/documents/${doc.id}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.body.fields, { 'document.notes': 'Dear {{field.recipient}}', 'field.recipient': 'Sara', 'field.salary': '900' });
});

test('a draft document can be edited; a final one is frozen', async () => {
  const { app, as } = setup();
  const doc = await letter(app, as);
  const edited = await as(request(app).put(`/documents/${doc.id}`)).send({ title: 'Offer letter v2', fieldValues: { 'field.recipient': 'Mona' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.title, 'Offer letter v2');
  assert.equal(edited.body.fieldValues['field.recipient'], 'Mona');

  const finalised = await as(request(app).put(`/documents/${doc.id}`)).send({ status: 'final' });
  assert.equal(finalised.body.status, 'final');
  const late = await as(request(app).put(`/documents/${doc.id}`)).send({ fieldValues: { 'field.recipient': 'Changed' } });
  assert.equal(late.status, 409);
  const stillThere = await as(request(app).get(`/documents/${doc.id}`));
  assert.equal(stillThere.body.fieldValues['field.recipient'], 'Mona');
});

test('field values must be text', async () => {
  const { app, as } = setup();
  const template = await as(request(app).post('/companies/1/invoice-templates')).send({
    name: 'Letter', docType: 'letter', layout: 'modern', primaryColor: '#123456', accentColor: '#654321',
  });
  const bad = await as(request(app).post('/companies/1/documents')).send({ templateId: template.body.id, fieldValues: { 'field.x': { evil: true } } });
  assert.equal(bad.status, 400);
});

test('the public document shows the client by name and address only', async () => {
  const { app, as } = setup();
  const contact = await as(request(app).post('/companies/1/contacts')).send({
    name: 'Gulf Retail LLC', address: 'Muscat', email: 'buyer@gulf.example', roles: ['Client'],
    notes: 'POISON internal note', tags: ['POISON-tag'],
  });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  const doc = await letter(app, as, { recordType: 'client', recordId: contact.body.id });
  const pub = await request(app).get(`/public/documents/${doc.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.client.name, 'Gulf Retail LLC');
  assert.equal(pub.body.client.address, 'Muscat');
  assert.ok(!JSON.stringify(pub.body).includes('POISON'), 'nothing internal about the client');
});

test('a draft can be linked to a client and unlinked again', async () => {
  const { app, as } = setup();
  const doc = await letter(app, as);
  const linked = await as(request(app).put(`/documents/${doc.id}`)).send({ recordType: 'client', recordId: 'client-1' });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(linked.body.recordType, 'client');
  assert.equal(linked.body.recordId, 'client-1');
  const unlinked = await as(request(app).put(`/documents/${doc.id}`)).send({ recordId: '' });
  assert.equal(unlinked.body.recordId, undefined);
  assert.equal(unlinked.body.recordType, undefined);
});

test("a document cannot be linked to another company's record", async () => {
  const { app, as } = setup();
  const otherClient = await as(request(app).post('/companies/2/contacts')).send({ name: 'Rival Co', roles: ['Client'], address: 'SECRET-ADDRESS' });
  assert.equal(otherClient.status, 201, JSON.stringify(otherClient.body));
  const template = await as(request(app).post('/companies/1/invoice-templates')).send({
    name: 'Letter', docType: 'letter', layout: 'modern', primaryColor: '#123456', accentColor: '#654321',
  });
  const linked = await as(request(app).post('/companies/1/documents')).send({ templateId: template.body.id, recordType: 'client', recordId: otherClient.body.id });
  assert.equal(linked.status, 400);
  const doc = await letter(app, as);
  const relinked = await as(request(app).put(`/documents/${doc.id}`)).send({ recordType: 'client', recordId: otherClient.body.id });
  assert.equal(relinked.status, 400);
  const otherInvoice = await as(request(app).post('/invoices')).send({
    companyId: '2', clientId: otherClient.body.id, issueDate: new Date().toISOString(), dueDate: new Date().toISOString(),
    lineItems: [{ itemType: 'Manual', description: 'x', quantity: 1, unitPrice: 5, amount: 5 }], total: 5, status: 'Draft',
  });
  if (otherInvoice.status === 201) {
    const viaInvoice = await as(request(app).post('/companies/1/documents')).send({ templateId: template.body.id, recordType: 'invoice', recordId: otherInvoice.body.id });
    assert.equal(viaInvoice.status, 400);
  }
});

test('changing only the kind of a linked record is checked too', async () => {
  const { app, as } = setup();
  const doc = await letter(app, as, { recordType: 'client', recordId: 'client-1' });
  const swapped = await as(request(app).put(`/documents/${doc.id}`)).send({ recordType: 'invoice' });
  assert.equal(swapped.status, 400);
});
