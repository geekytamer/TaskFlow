/**
 * The contact page's summary: when we last dealt with the contact, and the
 * payments they made (for the statement and the aging on the Finance tab).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-contact-v2-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak', website: '', address: '' });
  const c = company.id;
  const admin = store.createUser({ name: 'Admin', email: 'admin@v2.test', role: 'Admin', companyIds: [c], companyRoles: [{ companyId: c, role: 'Admin' }], password: 'x' });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c });
  const server = app.listen(0);
  server.unref();
  const get = (url) => request(server).get(url).set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  return { store, c, admin, get };
};

test('summary: payments the contact made, newest first, with their invoice number', async () => {
  const w = build();
  const client = w.store.createContact({ companyId: w.c, name: 'Brand Co', roles: ['Client'] });
  const inv = w.store.createInvoice({
    companyId: w.c, clientId: client.id, contactId: client.id, issueDate: new Date('2026-10-01'), dueDate: new Date('2026-10-31'),
    status: 'Sent', total: 500, lineItems: [{ description: 'Campaign', quantity: 1, unitPrice: 500 }],
  });
  w.store.createPayment({ invoiceId: inv.id, amount: 200, method: 'Bank transfer', paidAt: new Date('2026-10-10') });
  w.store.createPayment({ invoiceId: inv.id, amount: 100, method: 'Cash', paidAt: new Date('2026-10-20') });

  const res = await w.get(`/contacts/${client.id}/summary`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.totals.paymentTotal, 300);
  assert.deepEqual(res.body.payments.map((p) => [p.invoiceNumber, p.amount, p.method]), [
    [inv.invoiceNumber, 100, 'Cash'],
    [inv.invoiceNumber, 200, 'Bank transfer'],
  ]);
});

test('summary: when we last dealt with the contact', async () => {
  const w = build();
  const client = w.store.createContact({ companyId: w.c, name: 'Quiet Co', roles: ['Lead'] });
  const none = await w.get(`/contacts/${client.id}/summary`);
  // Creating a contact is not dealing with them.
  assert.equal(none.body.lastActivityAt, null);

  w.store.runAsActor({ userId: w.admin.id, name: 'Admin' }, () => w.store.createCrmActivity({
    companyId: w.c, contactId: client.id, category: 'Call', summary: 'Intro call',
  }));
  const after = await w.get(`/contacts/${client.id}/summary`);
  assert.ok(after.body.lastActivityAt, 'set once a call is logged');
  assert.ok(Date.now() - new Date(after.body.lastActivityAt).getTime() < 60_000);
});
