const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkspace } = require('./helpers/workspace');

/** Peak assignments shown as deals in the influencer's workspace, read from Peak's records, never copied. */

const withCampaigns = () => {
  const ctx = buildWorkspace();
  const { store, company, client, lina } = ctx;
  const campaign = (name, status = 'Active') => store.createCrmCampaign({
    companyId: company.id, contactId: client.id, name, status, visibility: 'Public',
    startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30'),
  });
  const assign = (c, status, agreedRate = 1500) => store.createCampaignAssignment({ companyId: company.id, campaignId: c.id, contactId: lina.id, role: 'Influencer', status, agreedRate });
  return { ...ctx, campaign, assign };
};

test('a confirmed Peak assignment appears as a confirmed Peak deal', async () => {
  const ctx = withCampaigns();
  const a = ctx.assign(ctx.campaign('Ramadan launch'), 'Confirmed', 1500);
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const deals = (await lina.get('/deals')).body;
  const peak = deals.find((d) => d.source === 'peak');
  assert.equal(peak.id, `peak-${a.id}`);
  assert.equal(peak.title, 'Ramadan launch');
  assert.equal(peak.brand.name, 'Al Noor Dates');
  assert.equal(peak.amount, 1500);
  assert.equal(peak.status, 'confirmed');
  assert.equal(peak.startDate, '2026-11-01');

  const page = await lina.get(`/deals/peak-${a.id}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.assignment.id, a.id, 'carries the assignment as the portal shows it today');
  assert.equal((await lina.post(`/deals/peak-${a.id}`, { title: 'Renamed' })).status, 404, 'Peak deals are read-only');
  assert.equal((await lina.post(`/deals/peak-${a.id}/delete`)).status, 404);
});

test('offers awaiting a reply are leads; completed work is delivered', async () => {
  const ctx = withCampaigns();
  ctx.assign(ctx.campaign('Offer'), 'Contacted');
  ctx.assign(ctx.campaign('Done'), 'Completed');
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const byTitle = Object.fromEntries((await lina.get('/deals')).body.map((d) => [d.title, d.status]));
  assert.equal(byTitle.Offer, 'lead');
  assert.equal(byTitle.Done, 'delivered');
});

test('declined, cancelled, planned and hidden assignments never appear', async () => {
  const ctx = withCampaigns();
  ctx.assign(ctx.campaign('Cancelled one'), 'Cancelled');
  ctx.assign(ctx.campaign('Planned one'), 'Planned');
  ctx.assign(ctx.campaign('Archived campaign', 'Archived'), 'Confirmed');
  const declined = ctx.assign(ctx.campaign('Declined one'), 'Contacted');
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const request = require('supertest');
  await request(ctx.server).post(`/portal-api/influencer/assignments/${declined.id}/respond`).set(lina).send({ decision: 'declined', reason: 'Travelling' });
  const deals = (await ctx.ws(lina).get('/deals')).body;
  assert.deepEqual(deals.filter((d) => d.source === 'peak'), []);
  assert.equal((await ctx.ws(lina).get(`/deals/peak-${declined.id}`)).status, 404);
});

test('a completed assignment whose bills are all paid shows as paid', async () => {
  const ctx = withCampaigns();
  const { store, company, lina } = ctx;
  const c = ctx.campaign('Paid campaign');
  ctx.assign(c, 'Completed', 1900);
  for (const [title, cost] of [['Reel', 1500], ['Story', 400]]) {
    store.createCampaignDeliverable({ companyId: company.id, campaignId: c.id, title, status: 'Published', fulfillment: 'External', vendorContactId: lina.id, cost, price: cost * 2 });
  }
  store.generateCampaignVendorBills(company.id, c.id);
  const session = ctx.ws(await ctx.session('influencer', lina, 'lina@creator.test'));
  const status = async () => (await session.get('/deals')).body.find((d) => d.title === 'Paid campaign').status;
  assert.equal(await status(), 'delivered');
  const bills = store.listCampaignDeliverables(c.id).map((d) => d.vendorBillId);
  for (const id of new Set(bills)) store.updateVendorBillStatus(id, 'Approved');
  store.createVendorBillPayment({ billId: bills[0], amount: store.getVendorBillById(bills[0]).amount, paidAt: new Date(), method: 'Bank Transfer' });
  assert.equal(await status(), 'delivered', 'one bill still unpaid');
  for (const id of new Set(bills.slice(1))) if (id !== bills[0]) store.createVendorBillPayment({ billId: id, amount: store.getVendorBillById(id).amount, paidAt: new Date(), method: 'Bank Transfer' });
  assert.equal(await status(), 'paid');
});

test('the deals list mixes own and Peak deals; source filters them', async () => {
  const ctx = withCampaigns();
  ctx.assign(ctx.campaign('Peak one'), 'Confirmed');
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  await lina.post('/deals', { title: 'Own one', currency: 'OMR', status: 'lead' });
  assert.deepEqual((await lina.get('/deals')).body.map((d) => d.source).sort(), ['own', 'peak']);
  assert.deepEqual((await lina.get('/deals?source=peak')).body.map((d) => d.title), ['Peak one']);
  assert.deepEqual((await lina.get('/deals?source=own')).body.map((d) => d.title), ['Own one']);
});
