const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Campaigns in the client portal: what a client sees of its own campaigns, and
 * its review of submitted content. A review is advice to staff; it never moves
 * a deliverable's status itself.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
// Decimal poison values: a UUID has no dots, so none of these can appear by chance.
const POISON = ['98765.43', 'CAMPAIGN-NOTE-POISON', '11111.37', '22222.73', 'DELIV-NOTE-POISON', '33333.19', 'ASSIGN-NOTE-POISON', 'EXPENSE-POISON', '44444.61', 'vendorBillId', 'agreedRate', 'budget', 'ownerUserId'];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-campaigns-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const owner = store.createUser({
    name: 'Carla Owner', email: 'carla@peak.test', password: 'x', role: 'Manager',
    companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }],
  });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: owner.id });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const lina = store.createContact({
    companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'],
    influencerAccounts: [{ id: 'a', platform: 'Instagram', handle: '@lina.eats' }],
  });
  const maybe = store.createContact({ companyId: company.id, kind: 'Person', name: 'Not Yet Confirmed', roles: ['Influencer'] });

  const opportunity = store.createOpportunity({ companyId: company.id, contactId: client.id, title: 'Ramadan', serviceType: 'Influencer campaign', stage: 'Won', expectedRevenue: 0, probability: 0 });
  const campaign = store.createCrmCampaign({
    companyId: company.id, contactId: client.id, opportunityId: opportunity.id, name: 'Ramadan launch', status: 'Active',
    startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30'), budget: 98765.43, ownerUserId: owner.id,
    visibility: 'Public', notes: 'CAMPAIGN-NOTE-POISON',
  });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', agreedRate: 33333.19, status: 'Confirmed', notes: 'ASSIGN-NOTE-POISON' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: maybe.id, role: 'Influencer', status: 'Planned' });
  store.createCampaignExpense({ companyId: company.id, campaignId: campaign.id, description: 'EXPENSE-POISON', amount: 44444.61, status: 'Approved', billable: false });

  const deliverable = (title, status, extra = {}) => store.createCampaignDeliverable({
    companyId: company.id, campaignId: campaign.id, title, platform: 'Instagram', status,
    fulfillment: 'External', vendorContactId: lina.id, price: 11111.37, cost: 22222.73, notes: 'DELIV-NOTE-POISON',
    dueDate: new Date('2026-11-10'), ...extra,
  });
  const reel = deliverable('Reel 1', 'Submitted', { contentUrl: 'https://instagram.com/p/reel1' });
  const draft = deliverable('Reel 2', 'In Progress', { contentUrl: 'https://drafts.example/private' });
  const hostile = deliverable('Story', 'Submitted', { contentUrl: 'javascript:alert(1)' });
  const dropped = deliverable('Dropped', 'Cancelled');

  const rivalCampaign = store.createCrmCampaign({ companyId: company.id, contactId: rival.id, name: 'Honey week', status: 'Active', visibility: 'Public' });
  const rivalDeliverable = store.createCampaignDeliverable({ companyId: company.id, campaignId: rivalCampaign.id, title: 'Honey reel', status: 'Submitted', contentUrl: 'https://x.test/h' });
  const archived = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Old one', status: 'Archived', visibility: 'Public', archivedAt: new Date() });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();

  const session = async (audience, contact, email, name = email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name,
      role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };

  return { server, store, company, owner, client, rival, lina, opportunity, campaign, reel, draft, hostile, dropped, rivalCampaign, rivalDeliverable, archived, session };
};

const review = (ctx, session, deliverableId, body, campaignId = ctx.campaign.id) =>
  request(ctx.server).post(`/portal-api/client/campaigns/${campaignId}/deliverables/${deliverableId}/review`).set(session).send(body);

test('a client sees its own live campaigns only', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const list = await request(ctx.server).get('/portal-api/client/campaigns').set(omar);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((c) => c.name), ['Ramadan launch'], 'no archived campaign, no other client');
  // Two are submitted, but the story's only link is a script URL: nothing safe to review.
  assert.deepEqual(list.body[0].deliverables, { total: 3, awaitingReview: 1, published: 0, nextDue: new Date('2026-11-10').toISOString() });

  const sara = await ctx.session('client', ctx.rival, 'sara@sidr.test');
  assert.equal((await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(sara)).status, 404);
  assert.equal((await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.archived.id}`).set(omar)).status, 404);
  assert.equal((await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.rivalCampaign.id}`).set(omar)).status, 404);
});

test('the campaign shows confirmed influencers and content only once it is submitted', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(omar);
  assert.equal(body.status, 'active');
  assert.deepEqual(body.influencers, [{ name: 'Lina Haddad', handle: '@lina.eats' }], 'a planned, unconfirmed influencer is not shown');
  const byTitle = Object.fromEntries(body.deliverables.map((d) => [d.title, d]));
  assert.equal(byTitle.Dropped, undefined, 'cancelled deliverables are hidden');
  assert.equal(byTitle['Reel 1'].status, 'ready_for_review');
  assert.equal(byTitle['Reel 1'].contentUrl, 'https://instagram.com/p/reel1');
  assert.equal(byTitle['Reel 1'].influencer, 'Lina Haddad');
  assert.equal(byTitle['Reel 2'].contentUrl, null, 'a draft link is not shown while in progress');
  assert.equal(byTitle.Story.contentUrl, null, 'a script URL never reaches the client');
});

test('no campaign response carries budgets, rates, costs, notes or expenses', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const bodies = [
    (await request(ctx.server).get('/portal-api/client/campaigns').set(omar)).body,
    (await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(omar)).body,
    (await review(ctx, omar, ctx.reel.id, { decision: 'approved' })).body,
  ];
  bodies.forEach((body, i) => {
    const json = JSON.stringify(body);
    for (const secret of POISON) assert.equal(json.includes(secret), false, `response ${i} leaked ${secret}`);
  });
});

test('approving records the review, tells the owner, and leaves the status to staff', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test', 'Omar Al Noor');
  const res = await review(ctx, omar, ctx.reel.id, { decision: 'approved' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.review.decision, res.body.review.by], ['approved', 'Omar Al Noor']);
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'Submitted', 'staff still decide the status');
  assert.equal(ctx.store.listNotifications(ctx.owner.id).filter((n) => /approved/.test(n.title)).length, 1);

  assert.equal((await review(ctx, omar, ctx.reel.id, { decision: 'approved' })).status, 409, 'one review per version');
});

test('asking for changes needs a comment and gives the owner a follow-up carrying it', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await review(ctx, omar, ctx.reel.id, { decision: 'changes_requested' })).status, 400);
  assert.equal((await review(ctx, omar, ctx.reel.id, { decision: 'maybe' })).status, 400);
  const res = await review(ctx, omar, ctx.reel.id, { decision: 'changes_requested', comment: 'Please show the gift box in the first 3 seconds.' });
  assert.equal(res.status, 200);
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { entityType: 'opportunity', entityId: ctx.opportunity.id });
  assert.ok(followups.some((f) => (f.notes ?? '').includes('gift box in the first 3 seconds')));
});

test('a new version can be reviewed again once staff submit a new link', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  await review(ctx, omar, ctx.reel.id, { decision: 'changes_requested', comment: 'Brighter please.' });
  ctx.store.updateCampaignDeliverable(ctx.reel.id, { contentUrl: 'https://instagram.com/p/reel1-v2' });
  const second = await review(ctx, omar, ctx.reel.id, { decision: 'approved' });
  assert.equal(second.status, 200);
  const { body } = await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(omar);
  assert.equal(body.deliverables.find((d) => d.title === 'Reel 1').review.decision, 'approved', 'the current version shows its own review');
});

test('only submitted content with a real link can be reviewed, and only by its own client', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await review(ctx, omar, ctx.draft.id, { decision: 'approved' })).status, 409, 'still in progress');
  assert.equal((await review(ctx, omar, ctx.hostile.id, { decision: 'approved' })).status, 409, 'no safe link to review');
  assert.equal((await review(ctx, omar, ctx.rivalDeliverable.id, { decision: 'approved' })).status, 404, 'deliverable is not in this campaign');
  assert.equal((await review(ctx, omar, ctx.rivalDeliverable.id, { decision: 'approved' }, ctx.rivalCampaign.id)).status, 404, 'another client’s campaign');

  const influencer = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await request(ctx.server).get('/portal-api/client/campaigns').set(influencer)).status, 401);
});
