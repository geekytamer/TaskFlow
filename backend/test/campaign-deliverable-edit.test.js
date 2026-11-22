/**
 * Editing a campaign deliverable after the fact, and billing one vendor at a
 * time: a deliverable added without a cost can be fixed and billed on its own;
 * a draft bill follows the cost/vendor edit; an approved or paid bill locks them.
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
  const dbPath = path.join(makeTmpDir('taskflow-deliv-edit-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak', website: '', address: '' });
  const c = company.id;
  const admin = store.createUser({
    name: 'Admin', email: 'admin@deliv.test', role: 'Admin',
    companyIds: [c], companyRoles: [{ companyId: c, role: 'Admin' }], password: 'x',
  });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const auth = () => `Bearer ${store.issueToken(admin.id)}`;
  const api = {
    put: (url, body) => agent.put(url).set('Authorization', auth()).send(body),
    post: (url, body) => agent.post(url).set('Authorization', auth()).send(body ?? {}),
  };
  const client = store.createContact({ companyId: c, name: 'Client Co', roles: ['Client'] });
  const abed = store.createContact({ companyId: c, name: 'abed abid', roles: ['Influencer'] });
  const maram = store.createContact({ companyId: c, name: 'maram altoobi', roles: ['Influencer'] });
  const campaign = store.createCrmCampaign({ companyId: c, contactId: client.id, name: 'Kia Q2', status: 'Active' });
  const deliverable = (title, vendor, cost) => store.createCampaignDeliverable({
    companyId: c, campaignId: campaign.id, title, status: 'Published', fulfillment: 'External', vendorContactId: vendor.id, cost, price: 400,
  });
  return { store, c, api, campaign, abed, maram, deliverable };
};

test('a deliverable added without a cost gets one by editing, then bills on its own', async () => {
  const w = build();
  const noCost = w.deliverable('q2 kia', w.abed, undefined);
  const other = w.deliverable('Q2 kia', w.maram, 80);

  const edited = await w.api.put(`/campaign-deliverables/${noCost.id}`, { cost: 120, price: 450, title: 'q2 kia reel' });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.body.cost, 120);
  assert.equal(edited.body.title, 'q2 kia reel');

  // Bill only this deliverable: the other one stays unbilled.
  const res = await w.api.post(`/companies/${w.c}/campaigns/${w.campaign.id}/generate-vendor-bills`, { deliverableId: noCost.id });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].amount, 120);
  assert.equal(res.body[0].vendorName, 'abed abid');
  assert.ok(w.store.getCampaignDeliverableById(noCost.id).vendorBillId);
  assert.equal(w.store.getCampaignDeliverableById(other.id).vendorBillId, undefined);

  // Billing it again makes nothing new.
  const again = await w.api.post(`/companies/${w.c}/campaigns/${w.campaign.id}/generate-vendor-bills`, { deliverableId: noCost.id });
  assert.equal(again.status, 201);
  assert.equal(again.body.length, 0);
});

test('billing one deliverable of another campaign is refused', async () => {
  const w = build();
  const other = w.store.createCrmCampaign({ companyId: w.c, contactId: w.campaign.contactId, name: 'Other', status: 'Active' });
  const d = w.store.createCampaignDeliverable({ companyId: w.c, campaignId: other.id, title: 'x', fulfillment: 'External', vendorContactId: w.abed.id, cost: 50 });
  const res = await w.api.post(`/companies/${w.c}/campaigns/${w.campaign.id}/generate-vendor-bills`, { deliverableId: d.id });
  assert.equal(res.status, 404, res.text);
  assert.equal(w.store.getCampaignDeliverableById(d.id).vendorBillId, undefined);
});

test('a draft bill follows the edited cost and vendor', async () => {
  const w = build();
  const d = w.deliverable('q2', w.abed, 150);
  const [bill] = w.store.generateCampaignVendorBills(w.c, w.campaign.id);
  assert.equal(bill.status, 'Draft');

  const res = await w.api.put(`/campaign-deliverables/${d.id}`, { cost: 175, vendorContactId: w.maram.id });
  assert.equal(res.status, 200, res.text);
  const after = w.store.getVendorBillById(bill.id);
  assert.equal(after.amount, 175);
  assert.equal(after.vendorName, 'maram altoobi');
  assert.equal(w.store.getCampaignDeliverableById(d.id).vendorBillId, bill.id);
});

test('an approved bill locks cost and vendor, other fields still edit', async () => {
  const w = build();
  const d = w.deliverable('q2', w.abed, 150);
  const [bill] = w.store.generateCampaignVendorBills(w.c, w.campaign.id);
  w.store.updateVendorBillStatus(bill.id, 'Approved');

  const cost = await w.api.put(`/campaign-deliverables/${d.id}`, { cost: 200 });
  assert.equal(cost.status, 400, cost.text);
  assert.match(cost.body.error ?? cost.text, /bill/i);
  assert.equal(w.store.getCampaignDeliverableById(d.id).cost, 150);
  assert.equal(w.store.getVendorBillById(bill.id).amount, 150);

  const vendor = await w.api.put(`/campaign-deliverables/${d.id}`, { vendorContactId: w.maram.id });
  assert.equal(vendor.status, 400, vendor.text);

  // Same values sent back (a full form save) are not a change.
  const same = await w.api.put(`/campaign-deliverables/${d.id}`, { cost: 150, vendorContactId: w.abed.id, title: 'q2 renamed', fulfillment: 'External' });
  assert.equal(same.status, 200, same.text);
  assert.equal(same.body.title, 'q2 renamed');
});

test('a deliverable whose bill was deleted can be billed again', async () => {
  const w = build();
  const d = w.deliverable('q2', w.abed, 150);
  const [bill] = w.store.generateCampaignVendorBills(w.c, w.campaign.id);
  w.store.deleteVendorBill(bill.id);
  const bills = w.store.generateCampaignVendorBills(w.c, w.campaign.id);
  assert.equal(bills.length, 1);
  assert.equal(w.store.getCampaignDeliverableById(d.id).vendorBillId, bills[0].id);
});
