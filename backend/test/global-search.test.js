const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** One search across the company, showing only what the person may see. */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-search-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const mk = (role, email) => store.createUser({ name: `${role} ${email}`, email, password: 'Password1!', role, companyIds: ['1'], companyRoles: [{ companyId: '1', role }] });
  const manager = mk('Manager', 'mgr@x.example');
  const employee = mk('Employee', 'emp@x.example');
  const search = async (u, q) => (await request(app).get(`/companies/1/search?q=${encodeURIComponent(q)}`).set('Authorization', `Bearer ${store.issueToken(u.id)}`)).body;
  return { app, store, manager, employee, search };
}

test('finds records of many kinds, including ones far down a long list', async () => {
  const { store, manager, search } = setup();
  for (let i = 0; i < 40; i += 1) store.createContact({ companyId: '1', kind: 'Organization', name: `Filler Trading ${i}`, roles: ['Client'] });
  const hotel = store.createContact({ companyId: '1', kind: 'Organization', name: 'Zubair Hotel', roles: ['Client'] });
  store.createInventoryItem({ companyId: '1', name: 'Khalas dates 1kg', category: 'Dates', unit: 'box', unitCost: 1, barcode: '6291001234567' });
  const groups = await search(manager, 'zubair');
  const contacts = groups.find((g) => g.type === 'contacts');
  assert.ok(contacts, JSON.stringify(groups));
  assert.deepEqual(contacts.items.map((i) => [i.title, i.route]), [['Zubair Hotel', `/contacts/${hotel.id}`]], 'the 41st contact is found and opens its own page');
  assert.equal((await search(manager, '6291001234567')).find((g) => g.type === 'items').items[0].title, 'Khalas dates 1kg', 'by barcode');
  assert.equal((await search(manager, 'z')).length, 0, 'two letters at least');
  assert.ok((await search(manager, 'filler')).find((g) => g.type === 'contacts').items.length <= 6, 'a few per kind');
});

test("an employee finds no invoices, orders or stock, nor someone else's private contact", async () => {
  const { store, manager, employee, search } = setup();
  const client = store.createClient({ name: 'Secret Buyer LLC', email: 's@x.example', address: 'Muscat', companyId: '1' });
  store.createInvoice({ invoiceNumber: 'INV-SECRET', companyId: '1', clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Draft', total: 0, lineItems: [{ itemType: 'Manual', description: 'x item', quantity: 1, unitPrice: 5, amount: 5 }] });
  store.createContact({ companyId: '1', kind: 'Person', name: 'Private Prospect', roles: ['Lead'], visibility: 'Private', ownerUserId: manager.id });
  assert.ok((await search(manager, 'inv-secret')).some((g) => g.type === 'invoices'));
  assert.deepEqual(await search(employee, 'inv-secret'), [], 'no invoices for an employee');
  assert.ok(!(await search(employee, 'private prospect')).some((g) => g.type === 'contacts'), "a colleague's private contact");
  assert.ok((await search(manager, 'private prospect')).some((g) => g.type === 'contacts'), 'its owner finds it');
});

test("the contacts export no longer includes other people's private contacts", async () => {
  const { app, store, manager, employee } = setup();
  store.createContact({ companyId: '1', kind: 'Person', name: 'Private Prospect', roles: ['Lead'], visibility: 'Private', ownerUserId: manager.id });
  const csv = (await request(app).get('/companies/1/contacts/export').set('Authorization', `Bearer ${store.issueToken(employee.id)}`)).text;
  assert.ok(!csv.includes('Private Prospect'), 'an employee does not get it');
  const own = (await request(app).get('/companies/1/contacts/export').set('Authorization', `Bearer ${store.issueToken(manager.id)}`)).text;
  assert.ok(own.includes('Private Prospect'), 'its owner does');
});
