const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Sales → Services & prices (spec 2026-11-06-documents-hub-design, stage 3):
 * non-stock items behind the sales module, so a company without inventory
 * (an agency) still keeps a price list and quotes from it.
 */

let seq = 0;
const setup = (engine) => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-services-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const co = store.createCompany({ name: 'Agency' });
  // An agency: inventory, manufacturing and purchasing switched off.
  store.updateCompany(co.id, { disabledModules: ['inventory', 'manufacturing', 'purchasing'] });
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@services.test`, password: 'x', role, companyIds: [co.id], companyRoles: [{ companyId: co.id, role }] });
  const as = (u) => {
    const auth = ['Authorization', `Bearer ${store.issueToken(u.id)}`];
    return {
      get: (url) => request(server).get(url).set(...auth),
      post: (url, body) => request(server).post(url).set(...auth).send(body ?? {}),
      put: (url, body) => request(server).put(url).set(...auth).send(body ?? {}),
      del: (url) => request(server).delete(url).set(...auth),
    };
  };
  return { store, co, mk, as };
};

for (const engine of ['legacy', 'v2']) {
  test(`an agency keeps a price list with inventory switched off, and quotes from it (${engine})`, async () => {
    const { store, co, mk, as } = setup(engine);
    const manager = mk('Manager');
    assert.equal((await as(manager).get(`/companies/${co.id}/inventory-items`)).status, 403, 'inventory itself stays off');

    const made = await as(manager).post(`/companies/${co.id}/services`, { name: '  Reels package  ', salePrice: 250, unit: 'package' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.name, 'Reels package');
    assert.equal(made.body.salePrice, 250);
    assert.equal(made.body.tracksInventory, false);
    assert.equal(made.body.vatApplicable, true);
    assert.equal(made.body.unit, 'package');

    const list = await as(manager).get(`/companies/${co.id}/services`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map((s) => s.name), ['Reels package']);

    // A stocked item never shows up as a service, and can't be changed through these routes.
    const stocked = store.createInventoryItem({ companyId: co.id, name: 'Printed banner', category: 'Print', unit: 'pc', unitCost: 3, tracksInventory: true });
    assert.deepEqual((await as(manager).get(`/companies/${co.id}/services`)).body.map((s) => s.name), ['Reels package']);
    assert.equal((await as(manager).put(`/services/${stocked.id}`, { salePrice: 1 })).status, 404);

    const client = store.createContact({ companyId: co.id, kind: 'Organization', name: 'Zubair Hotel', roles: ['Client'] });
    const quote = await as(manager).post(`/companies/${co.id}/quotations`, {
      contactId: client.id,
      items: [{ inventoryItemId: made.body.id, description: 'Reels package', quantity: 2, unitPrice: 250 }],
    });
    assert.equal(quote.status, 201, JSON.stringify(quote.body));
    assert.equal(quote.body.items[0].inventoryItemId, made.body.id);
  });

  test(`editing and removing a service; an employee can see prices but not change them (${engine})`, async () => {
    const { co, mk, as } = setup(engine);
    const admin = mk('Admin');
    const employee = mk('Employee');
    const made = (await as(admin).post(`/companies/${co.id}/services`, { name: 'Logo design', salePrice: 120 })).body;

    const edited = await as(admin).put(`/services/${made.id}`, { salePrice: 150, vatApplicable: false, name: 'Logo design (3 concepts)' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.salePrice, 150);
    assert.equal(edited.body.vatApplicable, false);
    assert.equal(edited.body.name, 'Logo design (3 concepts)');

    assert.equal((await as(admin).post(`/companies/${co.id}/services`, { name: '', salePrice: 1 })).status, 400);
    assert.equal((await as(admin).post(`/companies/${co.id}/services`, { name: 'Bad', salePrice: -5 })).status, 400);
    assert.equal((await as(employee).post(`/companies/${co.id}/services`, { name: 'X', salePrice: 1 })).status, 403);
    assert.equal((await as(employee).put(`/services/${made.id}`, { salePrice: 1 })).status, 403);

    const removed = await as(admin).del(`/services/${made.id}`);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.deepEqual((await as(admin).get(`/companies/${co.id}/services`)).body, []);
  });

  test(`a service used on a quotation is archived, not deleted, and the quotation keeps it (${engine})`, async () => {
    const { store, co, mk, as } = setup(engine);
    const admin = mk('Admin');
    const made = (await as(admin).post(`/companies/${co.id}/services`, { name: 'Monthly social media', salePrice: 400 })).body;
    const client = store.createContact({ companyId: co.id, kind: 'Organization', name: 'Cafe', roles: ['Client'] });
    const quote = await as(admin).post(`/companies/${co.id}/quotations`, { contactId: client.id, items: [{ inventoryItemId: made.id, description: 'Monthly social media', quantity: 1, unitPrice: 400 }] });
    assert.equal(quote.status, 201, JSON.stringify(quote.body));
    const removed = await as(admin).del(`/services/${made.id}`);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.outcome, 'archived');
    assert.deepEqual((await as(admin).get(`/companies/${co.id}/services`)).body, [], 'gone from the price list');
    assert.equal((await as(admin).get(`/quotations/${quote.body.id}`)).body.items[0].description, 'Monthly social media');
  });
}

test('services follow the sales module: off when sales is off', async () => {
  const { store, co, mk, as } = setup('legacy');
  const admin = mk('Admin');
  store.updateCompany(co.id, { disabledModules: ['inventory', 'manufacturing', 'purchasing', 'sales'] });
  assert.equal((await as(admin).get(`/companies/${co.id}/services`)).status, 403);
});
