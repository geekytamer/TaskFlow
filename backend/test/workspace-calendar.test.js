const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkspace } = require('./helpers/workspace');

/** Every deliverable, the influencer's own and Peak's, by due date. */

const setup = async () => {
  const ctx = buildWorkspace();
  const { store, company, client, lina } = ctx;
  const ws = ctx.ws(await ctx.session('influencer', lina, 'lina@creator.test'));
  const deal = (await ws.post('/deals', { title: 'Sidr reels', currency: 'AED', status: 'confirmed' })).body;
  await ws.post(`/deals/${deal.id}/deliverables`, { title: 'Reel 1', dueDate: '2026-11-05', platform: 'Instagram' });
  const done = (await ws.post(`/deals/${deal.id}/deliverables`, { title: 'Reel 0', dueDate: '2026-10-20' })).body;
  await ws.post(`/deliverables/${done.id}`, { status: 'done' });
  await ws.post(`/deals/${deal.id}/deliverables`, { title: 'Late story', dueDate: '2026-10-25' });
  await ws.post(`/deals/${deal.id}/deliverables`, { title: 'Undated' });

  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', visibility: 'Public' });
  const a = store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', status: 'Confirmed', agreedRate: 900 });
  store.createCampaignDeliverable({ companyId: company.id, campaignId: campaign.id, title: 'Peak reel', status: 'Planned', fulfillment: 'External', vendorContactId: lina.id, dueDate: new Date('2026-11-10T00:00:00Z') });
  store.createCampaignDeliverable({ companyId: company.id, campaignId: campaign.id, title: 'Peak story', status: 'Published', fulfillment: 'External', vendorContactId: lina.id, dueDate: new Date('2026-11-12T00:00:00Z') });
  const offer = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Offer only', status: 'Active', visibility: 'Public' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: offer.id, contactId: lina.id, role: 'Influencer', status: 'Contacted', agreedRate: 100 });
  store.createCampaignDeliverable({ companyId: company.id, campaignId: offer.id, title: 'Not yet accepted', status: 'Planned', fulfillment: 'External', vendorContactId: lina.id, dueDate: new Date('2026-11-11T00:00:00Z') });
  return { ...ctx, ws, deal, assignment: a };
};

test('own and Peak deliverables in range, sorted by date', async () => {
  const { ws, deal, assignment } = await setup();
  const res = await ws.get('/calendar?from=2026-11-01&to=2026-11-30');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i) => [i.dueDate, i.title, i.source, i.done]), [
    ['2026-11-05', 'Reel 1', 'own', false],
    ['2026-11-10', 'Peak reel', 'peak', false],
    ['2026-11-12', 'Peak story', 'peak', true],
  ], 'an offer not yet accepted is not on the calendar');
  assert.equal(res.body.items[0].dealId, deal.id);
  assert.equal(res.body.items[1].dealId, `peak-${assignment.id}`);
  assert.equal(res.body.items[1].dealTitle, 'Ramadan launch');
});

test('overdue lists undone items due before the range', async () => {
  const { ws } = await setup();
  const res = await ws.get('/calendar?from=2026-11-01&to=2026-11-30');
  assert.deepEqual(res.body.overdue.map((i) => i.title), ['Late story'], 'the done one is not overdue');
});

test('a range over 93 days or a bad date is refused', async () => {
  const { ws } = await setup();
  assert.equal((await ws.get('/calendar?from=2026-01-01&to=2026-06-01')).status, 400);
  assert.equal((await ws.get('/calendar?from=2026-13-01&to=2026-12-31')).status, 400);
  assert.equal((await ws.get('/calendar?from=2026-11-30&to=2026-11-01')).status, 400);
  assert.equal((await ws.get('/calendar')).status, 200, 'defaults to this month');
});
