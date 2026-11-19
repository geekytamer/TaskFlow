const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const freshStore = () => new DataStore({ dbPath: path.join(makeTmpDir('taskflow-campaign-'), 'taskflow.db'), seedOnEmpty: false });

const setup = () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Campaign Co', website: '', address: '' });
  const client = store.createContact({ companyId: co.id, name: 'Client' });
  const campaign = store.createCrmCampaign({ companyId: co.id, name: 'Launch', contactId: client.id });
  return { store, co, client, campaign };
};

test('a cancelled deliverable is not billed to the client', () => {
  const { store, co, campaign } = setup();
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Reel', price: 1000 });
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Story', price: 400, status: 'Cancelled' });

  const invoice = store.generateCampaignInvoice(co.id, campaign.id);
  assert.equal(invoice.total, 1000);
  assert.deepEqual(invoice.lineItems.map((l) => l.description), ['Reel']);

  // Cancelling one later and syncing the draft drops it too.
  const reel = store.listCampaignDeliverables(campaign.id).find((d) => d.title === 'Reel');
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Post', price: 300 });
  store.updateCampaignDeliverable(reel.id, { status: 'Cancelled' });
  const synced = store.syncCampaignInvoice(co.id, campaign.id);
  assert.equal(synced.status, 'resynced');
  assert.equal(synced.invoice.total, 300);
});

test('syncing an issued invoice with VAT and no change is up to date', () => {
  const { store, co, campaign } = setup();
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Reel', price: 1000 });
  const draft = store.generateCampaignInvoice(co.id, campaign.id);
  store.updateInvoice(draft.id, { taxRate: 5 });
  store.updateInvoiceStatus(draft.id, 'Sent');
  assert.equal(store.getInvoiceById(draft.id).total, 1050);

  assert.equal(store.syncCampaignInvoice(co.id, campaign.id).status, 'up_to_date');
});

test('added scope on an issued VAT invoice is billed once, VAT on top', () => {
  const { store, co, campaign } = setup();
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Reel', price: 1000 });
  const draft = store.generateCampaignInvoice(co.id, campaign.id);
  store.updateInvoice(draft.id, { taxRate: 5 });
  store.updateInvoiceStatus(draft.id, 'Sent');

  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Story', price: 200 });
  const asked = store.syncCampaignInvoice(co.id, campaign.id);
  assert.equal(asked.status, 'needs_confirmation');
  assert.equal(asked.kind, 'supplementary');
  assert.equal(asked.delta, 200);

  const done = store.syncCampaignInvoice(co.id, campaign.id, true);
  assert.equal(done.status, 'supplemented');
  assert.equal(done.invoice.taxRate, 5);
  assert.equal(done.invoice.total, 210);
  // Nothing more to bill afterwards.
  assert.equal(store.syncCampaignInvoice(co.id, campaign.id).status, 'up_to_date');
});

test('reduced scope on an issued VAT invoice credits the price plus its VAT', () => {
  const { store, co, campaign } = setup();
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Reel', price: 1000 });
  const story = store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Story', price: 200 });
  const draft = store.generateCampaignInvoice(co.id, campaign.id);
  store.updateInvoice(draft.id, { taxRate: 5 });
  store.updateInvoiceStatus(draft.id, 'Sent');
  assert.equal(store.getInvoiceById(draft.id).total, 1260);

  store.updateCampaignDeliverable(story.id, { status: 'Cancelled' });
  const asked = store.syncCampaignInvoice(co.id, campaign.id);
  assert.equal(asked.kind, 'credit');
  assert.equal(asked.delta, -200);

  const done = store.syncCampaignInvoice(co.id, campaign.id, true);
  assert.equal(done.status, 'credited');
  assert.equal(done.creditNote.total, 210);
  assert.equal(store.syncCampaignInvoice(co.id, campaign.id).status, 'up_to_date');
});

test('a deliverable vendor must be a contact of the same company', () => {
  const { store, co, campaign } = setup();
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const foreign = store.createContact({ companyId: other.id, name: 'Foreign Vendor' });
  assert.throws(
    () => store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Shoot', fulfillment: 'External', vendorContactId: foreign.id, cost: 500 }),
    /vendor/i,
  );
  const local = store.createContact({ companyId: co.id, name: 'Local Vendor' });
  const d = store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Shoot', fulfillment: 'External', vendorContactId: local.id, cost: 500 });
  assert.throws(() => store.updateCampaignDeliverable(d.id, { vendorContactId: foreign.id }), /vendor/i);
});

test('vendor bills skip cancelled deliverables', () => {
  const { store, co, campaign } = setup();
  const vendor = store.createContact({ companyId: co.id, name: 'Vendor' });
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Shoot', fulfillment: 'External', vendorContactId: vendor.id, cost: 500 });
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Edit', fulfillment: 'External', vendorContactId: vendor.id, cost: 300, status: 'Cancelled' });
  const bills = store.generateCampaignVendorBills(co.id, campaign.id);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].amount, 500);
});

test('an expense contact must belong to the campaign company when edited', () => {
  const { store, co, campaign } = setup();
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const foreign = store.createContact({ companyId: other.id, name: 'Foreign' });
  const expense = store.createCampaignExpense({ companyId: co.id, campaignId: campaign.id, description: 'Props', amount: 50 });
  assert.throws(() => store.updateCampaignExpense(expense.id, { contactId: foreign.id }), /contact/i);
});

test('only someone who may edit the campaign can turn its deliverables into vendor bills', async () => {
  const dir = makeTmpDir('taskflow-campaign-api-');
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const co = store.createCompany({ name: 'Campaign Co', website: '', address: '' });
  const owner = store.createUser({
    name: 'Owner', email: 'owner@test.com', password: 'password', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }],
  });
  store.createUser({
    name: 'Staff', email: 'staff@test.com', password: 'password', role: 'Employee',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Employee' }],
  });
  const vendor = store.createContact({ companyId: co.id, name: 'Vendor' });
  const client = store.createContact({ companyId: co.id, name: 'Client' });
  const campaign = store.createCrmCampaign({ companyId: co.id, name: 'Private launch', contactId: client.id, ownerUserId: owner.id, ownerName: owner.name, visibility: 'Private' });
  store.createCampaignDeliverable({ companyId: co.id, campaignId: campaign.id, title: 'Shoot', fulfillment: 'External', vendorContactId: vendor.id, cost: 500 });

  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  app.unref();
  const login = async (email) => (await request(app).post('/auth/login').send({ email, password: 'password' })).body.token;

  const staff = await login('staff@test.com');
  const denied = await request(app)
    .post(`/companies/${co.id}/campaigns/${campaign.id}/generate-vendor-bills`)
    .set('Authorization', `Bearer ${staff}`);
  assert.equal(denied.status, 403);
  assert.equal(store.listVendorBills(co.id).length, 0);

  const ownerToken = await login('owner@test.com');
  const allowed = await request(app)
    .post(`/companies/${co.id}/campaigns/${campaign.id}/generate-vendor-bills`)
    .set('Authorization', `Bearer ${ownerToken}`);
  assert.equal(allowed.status, 201);
  assert.equal(allowed.body.length, 1);
  app.close();
});
