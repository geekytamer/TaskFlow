const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Payouts: the bills that pay an influencer's own work — bills linked from
 * deliverables they are paid for, and their referral commission bills. Never
 * other bills for the same supplier, never another influencer's.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-payouts-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const supplier = store.createSupplier({ companyId: company.id, name: 'Lina Haddad Trading', isActive: true });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'], supplierId: supplier.id });
  const rival = store.createContact({ companyId: company.id, kind: 'Person', name: 'Rival Influencer', roles: ['Influencer', 'Vendor'] });
  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', visibility: 'Public' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', status: 'Confirmed' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: rival.id, role: 'Influencer', status: 'Confirmed' });
  const deliverable = (contact, title, cost) => store.createCampaignDeliverable({
    companyId: company.id, campaignId: campaign.id, title, status: 'Approved', fulfillment: 'External', vendorContactId: contact.id, cost, price: cost * 2,
  });
  deliverable(lina, 'Reel 1', 1500);
  deliverable(lina, 'Story', 400);
  deliverable(rival, 'Rival reel', 77777.31);
  store.generateCampaignVendorBills(company.id, campaign.id);

  // A bill to the same supplier that has nothing to do with her portal work.
  store.createVendorBill({ companyId: company.id, vendorName: 'Lina Haddad Trading', supplierId: supplier.id, issueDate: new Date(), dueDate: new Date(), amount: 99999.17, status: 'Approved', notes: 'UNRELATED-BILL' });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const session = async (audience, contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, company, client, lina, rival, campaign, session };
};

const payouts = async (ctx, session) => (await request(ctx.server).get('/portal-api/influencer/payouts').set(session)).body;

test('an influencer sees the bills for their own deliverables, with status following the bill', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const list = await payouts(ctx, lina);
  assert.deepEqual(list.map((p) => p.amount).sort((a, b) => a - b), [400, 1500]);
  assert.ok(list.every((p) => p.kind === 'campaign' && p.label === 'Ramadan launch' && p.status === 'pending'));
  assert.deepEqual(list.find((p) => p.amount === 1500).items, ['Reel 1']);

  const billId = ctx.store.listCampaignDeliverables(ctx.campaign.id).find((d) => d.title === 'Reel 1').vendorBillId;
  ctx.store.updateVendorBillStatus(billId, 'Approved');
  assert.equal((await payouts(ctx, lina)).find((p) => p.amount === 1500).status, 'approved');
  ctx.store.createVendorBillPayment({ billId, amount: 1500, paidAt: new Date('2026-12-01'), method: 'Bank Transfer' });
  const paid = (await payouts(ctx, lina)).find((p) => p.amount === 1500);
  assert.equal(paid.status, 'paid');
  assert.ok(paid.paidAt);
});

test('payouts never include another influencer’s bill, unrelated supplier bills, or internal fields', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const json = JSON.stringify(await payouts(ctx, lina));
  for (const secret of ['77777.31', '99999.17', 'UNRELATED-BILL', 'Rival', 'supplierId', 'expenseAccountId', '"notes"', 'purchaseOrderId', '3000']) {
    assert.equal(json.includes(secret), false, `leaked ${secret}`);
  }
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await request(ctx.server).get('/portal-api/influencer/payouts').set(omar)).status, 401);
});

test('an approved referral commission paid by vendor bill appears as a referral payout', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const owner = ctx.store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [ctx.company.id], companyRoles: [{ companyId: ctx.company.id, role: 'Manager' }] });
  const auth = { Authorization: `Bearer ${ctx.store.issueToken(owner.id)}` };
  const ref = await request(ctx.server).post('/portal-api/influencer/referrals').set(lina)
    .send({ prospectName: 'Muscat Cafe', prospectContact: 'cafe@muscat.test', description: 'Opening a second branch next month.' });
  const conv = await request(ctx.server).post(`/companies/${ctx.company.id}/portal-referrals/${ref.body.id}/convert`).set(auth)
    .send({ expectedRevenue: 4000, commission: { basis: 'fixed', fixedAmount: 250, payoutType: 'vendor_bill' } });
  ctx.store.updateOpportunityStage(conv.body.opportunity.id, 'Won');
  await request(ctx.server).post(`/companies/${ctx.company.id}/portal-referrals/${ref.body.id}/commission/approve`).set(auth);

  const referral = (await payouts(ctx, lina)).find((p) => p.kind === 'referral');
  assert.ok(referral, 'the commission bill is listed');
  assert.equal(referral.amount, 250);
  assert.equal(referral.label, 'Muscat Cafe');
  assert.equal(referral.status, 'pending');
});
