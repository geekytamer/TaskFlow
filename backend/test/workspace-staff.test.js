const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildWorkspace } = require('./helpers/workspace');

/** What Peak staff see of an influencer's own business: only on that influencer's contact, only for Admin and Manager. */

const seeded = async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const brand = (await lina.post('/contacts', { name: 'Zebra Poison', kind: 'brand', company: 'Zebra Poison LLC', email: 'hi@zebra.example', phone: '+968 9000 0000', notes: 'PRIVATE-NOTE' })).body;
  await lina.post('/deals', { title: 'Reel A', wsContactId: brand.id, amount: 500, currency: 'AED', status: 'paid', startDate: '2026-10-01' });
  await lina.post('/deals', { title: 'Reel B', wsContactId: brand.id, amount: 300, currency: 'AED', status: 'confirmed' });
  await lina.post('/deals', { title: 'Story', wsContactId: brand.id, amount: 80, currency: 'OMR', status: 'lead' });
  const as = (user) => (method, p) => request(ctx.server)[method](p).set(ctx.staffAuth(user));
  return { ...ctx, brand, as };
};

test("staff see an influencer's outside clients and totals per currency", async () => {
  const ctx = await seeded();
  const res = await ctx.as(ctx.users.manager)('get', `/contacts/${ctx.lina.id}/workspace`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.contacts.map((c) => c.name), ['Zebra Poison']);
  assert.equal(res.body.deals.length, 3);
  const rows = res.body.byBrand.map((r) => [r.brandName, r.currency, r.total, r.deals]).sort();
  assert.deepEqual(rows, [['Zebra Poison', 'AED', 800, 2], ['Zebra Poison', 'OMR', 80, 1]]);
  assert.ok(res.body.lastActivityAt);
  assert.equal((await ctx.as(ctx.users.admin)('get', `/contacts/${ctx.lina.id}/workspace`)).status, 200);
});

test('Employee and Accountant are refused', async () => {
  const ctx = await seeded();
  for (const user of [ctx.users.employee, ctx.users.accountant]) {
    assert.equal((await ctx.as(user)('get', `/contacts/${ctx.lina.id}/workspace`)).status, 403);
    assert.equal((await ctx.as(user)('post', `/contacts/${ctx.lina.id}/workspace/contacts/${ctx.brand.id}/peak-contact`)).status, 403);
  }
});

test('the workspace of another influencer, or an unknown workspace contact, is 404', async () => {
  const ctx = await seeded();
  const as = ctx.as(ctx.users.manager);
  assert.equal((await as('post', `/contacts/${ctx.noel.id}/workspace/contacts/${ctx.brand.id}/peak-contact`)).status, 404);
  assert.equal((await as('get', '/contacts/no-such-contact/workspace')).status, 404);
});

test('making a Peak contact twice gives one contact with only the listed fields', async () => {
  const ctx = await seeded();
  const as = ctx.as(ctx.users.manager);
  const before = ctx.store.listContacts(ctx.company.id).length;
  const [a, b] = await Promise.all([
    as('post', `/contacts/${ctx.lina.id}/workspace/contacts/${ctx.brand.id}/peak-contact`),
    as('post', `/contacts/${ctx.lina.id}/workspace/contacts/${ctx.brand.id}/peak-contact`),
  ]);
  assert.equal(a.status, 200);
  assert.equal(a.body.peakContactId, b.body.peakContactId);
  assert.equal(ctx.store.listContacts(ctx.company.id).length, before + 1);
  const made = ctx.store.getContactById(a.body.peakContactId);
  assert.equal(made.kind, 'Organization');
  assert.equal(made.name, 'Zebra Poison LLC');
  assert.equal(made.contactPerson, 'Zebra Poison');
  assert.equal(made.email, 'hi@zebra.example');
  assert.equal(made.phone, '+968 9000 0000');
  assert.deepEqual(made.roles, ['Lead']);
  assert.equal(made.ownerUserId, ctx.users.manager.id);
  assert.equal(JSON.stringify(made).includes('PRIVATE-NOTE'), false, 'the influencer’s notes stay in the workspace');
  const view = await as('get', `/contacts/${ctx.lina.id}/workspace`);
  assert.equal(view.body.contacts[0].peakContactId, a.body.peakContactId);
});

test("workspace data stays out of Peak's screens", async () => {
  const ctx = await seeded();
  const as = ctx.as(ctx.users.admin);
  const c = ctx.company.id;
  const screens = [
    `/companies/${c}/contacts`, `/companies/${c}/search?q=Zebra`, `/companies/${c}/opportunities`, `/companies/${c}/dashboard`, `/companies/${c}/crm-campaigns`,
  ];
  for (const p of screens) {
    const res = await as('get', p);
    assert.ok(res.status < 500, `${p} answered ${res.status}`);
    assert.equal(JSON.stringify(res.body).includes('Zebra'), false, `${p} shows workspace data`);
  }
});

test('migration 120 grants the workspace permissions to existing Admin and Manager groups only', () => {
  const path = require('node:path');
  const Database = require('better-sqlite3');
  const { DataStore } = require('../dist/data/store');
  const { makeTmpDir } = require('./helpers/tmp');
  const dbPath = path.join(makeTmpDir('taskflow-ws-migration-'), 'taskflow.db');
  const first = new DataStore({ dbPath, seedOnEmpty: false });
  const company = first.createCompany({ name: 'Older Co', website: '', address: '' });
  const raw = new Database(dbPath);
  raw.prepare("DELETE FROM group_permissions WHERE module = 'contacts' AND action LIKE 'contacts.workspace.%'").run();
  raw.prepare("DELETE FROM schema_migrations WHERE id = '120_workspace_staff_permission'").run();
  raw.close();

  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  const has = (key) => reopened.listGroupPermissions(reopened.getPermissionGroupByKey(company.id, key).id).filter((p) => p.startsWith('contacts:contacts.workspace.')).sort();
  const both = ['contacts:contacts.workspace.contacts.peak-contact.create', 'contacts:contacts.workspace.read'];
  assert.deepEqual(has('admin'), both);
  assert.deepEqual(has('manager'), both);
  assert.deepEqual(has('employee'), []);
});
