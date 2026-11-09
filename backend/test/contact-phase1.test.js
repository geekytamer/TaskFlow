/**
 * Contacts, phase 1 fixes:
 *  - a field emptied in a form is cleared, not silently kept;
 *  - edit, delete and role changes need the contact to be visible to the person;
 *  - a refused delete says what still uses the contact (code + counts).
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
  const dbPath = path.join(makeTmpDir('taskflow-contacts-p1-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak', website: '', address: '' });
  const c = company.id;
  const mk = (name, role) => store.createUser({
    name, email: `${name.toLowerCase()}@p1.test`, role,
    companyIds: [c], companyRoles: [{ companyId: c, role }], password: 'x',
  });
  const u = { admin: mk('Admin', 'Admin'), manager: mk('Manager', 'Manager'), accountant: mk('Accountant', 'Accountant'), emp: mk('Emp', 'Employee') };
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const call = (method, user, url, body) => {
    const r = agent[method](url).set('Authorization', `Bearer ${store.issueToken(user.id)}`);
    return body === undefined ? r : r.send(body);
  };
  return { store, c, u, call };
};

test('emptying a field in the edit form clears it', async () => {
  const w = build();
  const contact = w.store.createContact({
    companyId: w.c, name: 'Brand Co', email: 'old@brand.test', phone: '+968 1111', address: 'Muscat',
    legalName: 'Brand Co LLC', taxNumber: 'OM123', contactPerson: 'Ali', notes: 'old note', roles: ['Client'],
  });
  const res = await w.call('put', w.u.manager, `/contacts/${contact.id}`, {
    name: 'Brand Co', email: null, phone: '', address: '   ', legalName: null, taxNumber: '', contactPerson: null, notes: '',
  });
  assert.equal(res.status, 200, res.text);
  const after = w.store.getContactById(contact.id);
  for (const key of ['email', 'phone', 'address', 'legalName', 'taxNumber', 'contactPerson', 'notes']) {
    assert.equal(after[key], undefined, `${key} cleared`);
  }

  // Leaving a field out still keeps it.
  w.store.updateContact(contact.id, { email: 'kept@brand.test' });
  await w.call('put', w.u.manager, `/contacts/${contact.id}`, { name: 'Brand Co Renamed' });
  assert.equal(w.store.getContactById(contact.id).email, 'kept@brand.test');
});

test('emptying CRM fields in the side panel clears them', async () => {
  const w = build();
  const contact = w.store.createContact({
    companyId: w.c, name: 'Lead Co', roles: ['Lead'], leadStatus: 'Qualified', leadSource: 'Referral', priority: 'High',
    ownerUserId: w.u.manager.id, ownerName: 'Manager', nextFollowupDate: new Date(Date.now() + 864e5), nextFollowupNote: 'call back',
  });
  const res = await w.call('patch', w.u.manager, `/contacts/${contact.id}`, {
    leadStatus: null, leadSource: '', priority: null, ownerUserId: null, ownerName: null, nextFollowupDate: null, nextFollowupNote: '',
  });
  assert.equal(res.status, 200, res.text);
  const after = w.store.getContactById(contact.id);
  for (const key of ['leadStatus', 'leadSource', 'priority', 'ownerUserId', 'ownerName', 'nextFollowupDate', 'nextFollowupNote']) {
    assert.equal(after[key] ?? undefined, undefined, `${key} cleared`);
  }
  // A wrong value is still refused.
  assert.equal((await w.call('patch', w.u.manager, `/contacts/${contact.id}`, { leadStatus: 'Nonsense' })).status, 400);
});

test('emptying influencer fields clears them', async () => {
  const w = build();
  const inf = w.store.createContact({
    companyId: w.c, name: 'Sara', roles: ['Influencer'], location: 'Muscat', influencerNiche: 'Food', followerCount: 5000, availabilityStatus: 'Available',
  });
  const res = await w.call('put', w.u.manager, `/contacts/${inf.id}`, { location: '', influencerNiche: null, followerCount: null, availabilityStatus: '' });
  assert.equal(res.status, 200, res.text);
  const after = w.store.getContactById(inf.id);
  assert.equal(after.location, undefined);
  assert.equal(after.influencerNiche, undefined);
  assert.equal(after.followerCount, undefined);
  assert.equal(after.availabilityStatus, undefined);
});

test('a private contact someone may not see cannot be edited, deleted or given roles by them', async () => {
  const w = build();
  // Private and owned by an employee: the accountant's role does not see others' private contacts.
  const secret = w.store.createContact({ companyId: w.c, name: 'Secret Co', roles: ['Lead'], visibility: 'Private', ownerUserId: w.u.emp.id, ownerName: 'Emp' });
  const list = await w.call('get', w.u.accountant, `/companies/${w.c}/contacts`);
  assert.ok(!list.text.includes('Secret Co'), 'hidden from the accountant\'s list');

  assert.equal((await w.call('put', w.u.accountant, `/contacts/${secret.id}`, { name: 'Hacked' })).status, 404);
  assert.equal((await w.call('post', w.u.accountant, `/contacts/${secret.id}/roles`, { role: 'Client' })).status, 404);
  assert.equal((await w.call('delete', w.u.accountant, `/contacts/${secret.id}/roles/Lead`)).status, 404);
  assert.equal((await w.call('delete', w.u.accountant, `/contacts/${secret.id}`)).status, 404);
  const after = w.store.getContactById(secret.id);
  assert.equal(after.name, 'Secret Co');
  assert.deepEqual(after.roles, ['Lead']);

  // Someone who may see it still can.
  assert.equal((await w.call('put', w.u.admin, `/contacts/${secret.id}`, { name: 'Secret Co 2' })).status, 200);
});

test('a refused delete says what still uses the contact', async () => {
  const w = build();
  const client = w.store.createContact({ companyId: w.c, name: 'Brand Co', roles: ['Client'] });
  w.store.createInvoice({
    companyId: w.c, clientId: client.id, contactId: client.id, issueDate: new Date(), dueDate: new Date(Date.now() + 864e5),
    status: 'Sent', total: 100, lineItems: [{ description: 'Work', quantity: 1, unitPrice: 100 }],
  });
  const res = await w.call('delete', w.u.admin, `/contacts/${client.id}`);
  assert.equal(res.status, 409, res.text);
  assert.equal(res.body.code, 'contact_in_use');
  assert.deepEqual(res.body.blockers, [{ key: 'invoices', count: 1 }]);
  assert.ok(w.store.getContactById(client.id), 'still there');

  // A payout bill names the contact as its supplier: that blocks a delete too.
  const inf = w.store.createContact({ companyId: w.c, name: 'Sara', roles: ['Influencer'] });
  w.store.createVendorBill({ companyId: w.c, vendorName: 'Sara', supplierId: inf.id, issueDate: new Date(), dueDate: new Date(), amount: 300, status: 'Draft' });
  const second = await w.call('delete', w.u.admin, `/contacts/${inf.id}`);
  assert.equal(second.status, 409, second.text);
  assert.deepEqual(second.body.blockers, [{ key: 'vendor_bills', count: 1 }]);

  // Nothing uses it: deleted.
  const free = w.store.createContact({ companyId: w.c, name: 'Free', roles: ['Lead'] });
  assert.equal((await w.call('delete', w.u.admin, `/contacts/${free.id}`)).status, 204);
});
