/**
 * Campaign health: one call that tells the campaign list, per campaign, its
 * money (revenue, cost, expenses, profit) and what needs attention — the
 * checks the 2026-11-22 Peak audit had to do by hand.
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
  const dbPath = path.join(makeTmpDir('taskflow-camp-health-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const c = store.createCompany({ name: 'Peak', website: '', address: '' }).id;
  const mk = (name, role) => store.createUser({
    name, email: `${name.toLowerCase()}@health.test`, role,
    companyIds: [c], companyRoles: [{ companyId: c, role }], password: 'x',
  });
  const admin = mk('Admin', 'Admin');
  const emp = mk('Emp', 'Employee');
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const get = (user, url) => agent.get(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`);
  const client = store.createContact({ companyId: c, name: 'SBG', roles: ['Client'] });
  const vendor = store.createContact({ companyId: c, name: 'abed abid', roles: ['Influencer'] });
  const campaign = (name, extra = {}) => store.createCrmCampaign({ companyId: c, contactId: client.id, name, status: 'Active', ...extra });
  const deliverable = (camp, fields) => store.createCampaignDeliverable({ companyId: c, campaignId: camp.id, title: 'd', status: 'Published', ...fields });
  return { store, c, admin, emp, get, vendor, campaign, deliverable };
};

const byId = (rows) => Object.fromEntries(rows.map((r) => [r.campaignId, r]));

test('health: money per campaign and the issues it has', async () => {
  const w = build();
  const kia = w.campaign('Kia Q2', { budget: 1000 });
  w.deliverable(kia, { fulfillment: 'External', vendorContactId: w.vendor.id, price: 450 }); // no cost
  w.deliverable(kia, { fulfillment: 'External', vendorContactId: w.vendor.id, price: 390, cost: 80 }); // unbilled
  w.deliverable(kia, { fulfillment: 'External', vendorContactId: w.vendor.id, price: 160, cost: 300 }); // loss, unbilled
  w.store.createCampaignExpense({ companyId: w.c, campaignId: kia.id, description: 'shoot', amount: 20, status: 'Approved', billable: false });
  w.store.createCampaignExpense({ companyId: w.c, campaignId: kia.id, description: 'no', amount: 999, status: 'Rejected', billable: false });

  const empty = w.campaign('Kia Q3');

  const clean = w.campaign('Clean', { budget: 500 });
  w.deliverable(clean, { fulfillment: 'External', vendorContactId: w.vendor.id, price: 500, cost: 100 });
  w.store.generateCampaignVendorBills(w.c, clean.id);
  w.store.generateCampaignInvoice(w.c, clean.id);

  const res = await w.get(w.admin, `/companies/${w.c}/campaigns/health`);
  assert.equal(res.status, 200, res.text);
  const rows = byId(res.body);

  const k = rows[kia.id];
  assert.equal(k.revenue, 1000);
  assert.equal(k.cost, 380);
  assert.equal(k.expenses, 20); // rejected expense left out
  assert.equal(k.profit, 600);
  assert.deepEqual(k.issues.sort(), ['loss', 'missingCost', 'noInvoice', 'unbilled'].sort());
  assert.equal(k.missingCost, 1);
  assert.equal(k.unbilled, 2);

  assert.deepEqual(rows[empty.id].issues, ['noDeliverables']);
  assert.deepEqual(rows[clean.id].issues, []);
  assert.equal(rows[clean.id].profit, 400);
});

test('health: budget that does not match the deliverables is flagged', async () => {
  const w = build();
  const ford = w.campaign('FORD Q2', { budget: 3630 });
  w.deliverable(ford, { fulfillment: 'Internal', price: 1860 });
  w.store.generateCampaignInvoice(w.c, ford.id);
  const res = await w.get(w.admin, `/companies/${w.c}/campaigns/health`);
  assert.deepEqual(byId(res.body)[ford.id].issues, ['budgetGap']);
});

test('health: only people who handle campaign money see it', async () => {
  const w = build();
  w.campaign('Kia Q2');
  const res = await w.get(w.emp, `/companies/${w.c}/campaigns/health`);
  assert.equal(res.status, 403, res.text);
});
