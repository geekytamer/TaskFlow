const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkspace } = require('./helpers/workspace');

/** What the influencer earned, is owed and kept, per currency, with Peak payouts counted in. */

const setup = async ({ peak = false } = {}) => {
  const ctx = buildWorkspace();
  const { store, company, client, lina } = ctx;
  store.updateCompanyFinanceSettings(company.id, { currencyCode: 'USD' });
  const ws = ctx.ws(await ctx.session('influencer', lina, 'lina@creator.test'));
  const deal = async (body) => (await ws.post('/deals', body)).body;
  const a = await deal({ title: 'A', amount: 1000, currency: 'AED', status: 'confirmed' });
  await ws.post(`/deals/${a.id}/payments`, { amount: 400, currency: 'AED', receivedOn: '2026-10-05' });
  await ws.post(`/deals/${a.id}/payments`, { amount: 250, currency: 'AED', receivedOn: '2026-10-20' });
  await deal({ title: 'B', amount: 300, currency: 'OMR', status: 'delivered' });
  await deal({ title: 'C', amount: 200, currency: 'AED', status: 'lead' });
  const d = await deal({ title: 'D', amount: 100, currency: 'AED', status: 'paid' });
  await ws.post(`/deals/${d.id}/payments`, { amount: 150, currency: 'AED', receivedOn: '2026-11-01' });
  await ws.post('/expenses', { category: 'production', amount: 120, currency: 'AED', spentOn: '2026-10-03' });
  await ws.post('/expenses', { category: 'equipment', amount: 60, currency: 'OMR', spentOn: '2026-09-28' });
  await ws.post('/expenses', { category: 'travel', amount: 999, currency: 'AED', spentOn: '2025-12-31' });

  if (peak) {
    const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', visibility: 'Public' });
    store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', status: 'Completed', agreedRate: 1900 });
    for (const [title, cost] of [['Reel', 1500], ['Story', 400]]) {
      store.createCampaignDeliverable({ companyId: company.id, campaignId: campaign.id, title, status: 'Published', fulfillment: 'External', vendorContactId: lina.id, cost, price: cost * 2 });
    }
    store.generateCampaignVendorBills(company.id, campaign.id);
    const bills = [...new Set(store.listCampaignDeliverables(campaign.id).map((x) => x.vendorBillId))];
    for (const id of bills) store.updateVendorBillStatus(id, 'Approved');
    const big = bills.find((id) => store.getVendorBillById(id).amount === 1500);
    store.createVendorBillPayment({ billId: big, amount: 1500, paidAt: new Date('2026-10-15T10:00:00Z'), method: 'Bank Transfer' });
  }
  return { ...ctx, ws };
};

const byCurrency = (summary) => Object.fromEntries(summary.currencies.map((c) => [c.currency, [c.received, c.owed, c.expenses, c.profit]]));

test('received, owed, expenses and profit per currency', async () => {
  const { ws } = await setup();
  const res = await ws.get('/money?year=2026');
  assert.equal(res.status, 200);
  // AED: received 400+250+150; owed 1000-650 (A) — D is paid, C a lead; expenses 120 (the 2025 one is another year).
  // OMR: owed 300 (B, delivered, nothing received); expenses 60.
  assert.deepEqual(byCurrency(res.body), { AED: [800, 350, 120, 680], OMR: [0, 300, 60, -60] });
  assert.deepEqual(res.body.months.filter((m) => m.currency === 'AED').map((m) => [m.month, m.received, m.expenses]), [['2026-10', 650, 120], ['2026-11', 150, 0]]);
  assert.deepEqual(res.body.owedItems.map((o) => [o.title, o.currency, o.owed]).sort(), [['A', 'AED', 350], ['B', 'OMR', 300]]);
});

test('owed never goes below zero when payments exceed the amount', async () => {
  const { ws } = await setup();
  const deal = (await ws.post('/deals', { title: 'E', amount: 50, currency: 'AED', status: 'delivered' })).body;
  await ws.post(`/deals/${deal.id}/payments`, { amount: 80, currency: 'AED', receivedOn: '2026-10-07' });
  const aed = (await ws.get('/money?year=2026')).body.currencies.find((c) => c.currency === 'AED');
  assert.equal(aed.owed, 350, 'E adds nothing owed, and does not cancel out A');
  assert.equal(aed.received, 880);
});

test('Peak paid payouts count as received once; pending and approved ones as owed', async () => {
  const { ws } = await setup({ peak: true });
  const body = (await ws.get('/money?year=2026')).body;
  assert.deepEqual(byCurrency(body).USD, [1500, 400, 0, 1500]);
  const peakRows = body.ledger.filter((l) => l.kind === 'peak_payout');
  assert.deepEqual(peakRows.map((l) => [l.amount, l.status, l.deletable]).sort(), [[1500, 'paid', false], [400, 'approved', false]]);
  assert.ok(body.byBrand.some((b) => b.source === 'peak' && b.currency === 'USD' && b.received === 1500));
});

test('only the asked year counts', async () => {
  const { ws } = await setup();
  const y2025 = (await ws.get('/money?year=2025')).body;
  assert.deepEqual(byCurrency(y2025).AED, [0, 350, 999, -999], 'owed is as of today, whatever the year');
  assert.equal((await ws.get('/money?year=abc')).status, 400);
});
