const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { currentEvents } = require('../dist/portal/alerts');
const { makeTmpDir } = require('./helpers/tmp');

/** One piece of content as the client reviews it, and the alert that brings them there. */

const PASSWORD = 'correct horse battery';

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-content-review-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const owner = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const other = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Other Brand', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'] });
  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', ownerUserId: owner.id, visibility: 'Public' });
  store.influencer.setCampaignBrief(company.id, { campaignId: campaign.id, influencerBrief: 'Brief', requireClientApproval: true });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', agreedRate: 1500, status: 'Confirmed' });
  const reel = store.createCampaignDeliverable({ companyId: company.id, campaignId: campaign.id, title: 'Reel 1', platform: 'Instagram', status: 'Planned', fulfillment: 'External', vendorContactId: lina.id });
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy', portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }) }).listen(0);
  server.unref();
  const session = async (audience, contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  const ownerAuth = { Authorization: `Bearer ${store.issueToken(owner.id)}` };
  const submit = (s, contentUrl) => request(server).post(`/portal-api/influencer/deliverables/${reel.id}/submissions`).set(s).send({ contentUrl, caption: 'x' });
  const staffReview = (submissionId, body) => request(server).post(`/companies/${company.id}/campaign-deliverables/${reel.id}/submissions/${submissionId}/review`).set(ownerAuth).send(body);
  const clientReview = (s, body) => request(server).post(`/portal-api/client/campaigns/${campaign.id}/deliverables/${reel.id}/review`).set(s).send(body);
  const content = (s) => request(server).get(`/portal-api/client/campaigns/${campaign.id}/deliverables/${reel.id}`).set(s);
  return { store, company, client, other, lina, campaign, reel, session, submit, staffReview, clientReview, content };
};

test('the content page shows what the client reviewed, their comment, and the new version', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const v1 = (await ctx.submit(lina, 'https://drive.example/reel-v1')).body;
  assert.equal((await ctx.content(omar)).status, 404, 'not before the team approves it');

  await ctx.staffReview(v1.id, { decision: 'approved' });
  const first = await ctx.content(omar);
  assert.equal(first.status, 200);
  assert.equal(first.body.contentUrl, 'https://drive.example/reel-v1');
  assert.equal(first.body.campaign.name, 'Ramadan launch');
  assert.equal(first.body.previous, null);

  await ctx.clientReview(omar, { decision: 'changes_requested', comment: 'Make the logo bigger' });
  await ctx.staffReview(v1.id, { decision: 'changes_requested', comment: 'Logo bigger please' });
  const v2 = (await ctx.submit(lina, 'https://drive.example/reel-v2')).body;
  await ctx.staffReview(v2.id, { decision: 'approved' });

  const second = (await ctx.content(omar)).body;
  assert.equal(second.contentUrl, 'https://drive.example/reel-v2');
  assert.equal(second.status, 'ready_for_review');
  assert.equal(second.previous.contentUrl, 'https://drive.example/reel-v1');
  assert.equal(second.previous.comment, 'Make the logo bigger');
  assert.ok(second.previous.at);
});

test("another client's content is not found", async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const stranger = await ctx.session('client', ctx.other, 'x@other.test');
  const v1 = (await ctx.submit(lina, 'https://drive.example/reel-v1')).body;
  await ctx.staffReview(v1.id, { decision: 'approved' });
  assert.equal((await ctx.content(stranger)).status, 404);
});

test('a review alert comes once per version, only once the team approved it, and links to the content page', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const user = ctx.store.portal.listUsers(ctx.company.id).find((u) => u.audience === 'client');
  const reviews = () => currentEvents(ctx.store, user).filter((e) => e.event === 'review');

  const v1 = (await ctx.submit(lina, 'https://drive.example/reel-v1')).body;
  assert.deepEqual(reviews(), [], 'nothing before the team approves');
  await ctx.staffReview(v1.id, { decision: 'approved' });
  const first = reviews();
  assert.equal(first.length, 1);
  assert.equal(first[0].path, `/campaigns/${ctx.campaign.id}/content/${ctx.reel.id}`);

  await ctx.clientReview(omar, { decision: 'changes_requested', comment: 'Make the logo bigger' });
  assert.deepEqual(reviews(), [], 'reviewed: nothing waits on them');
  await ctx.staffReview(v1.id, { decision: 'changes_requested', comment: 'Logo bigger please' });
  const v2 = (await ctx.submit(lina, 'https://drive.example/reel-v2')).body;
  await ctx.staffReview(v2.id, { decision: 'approved' });
  const second = reviews();
  assert.equal(second.length, 1);
  assert.notEqual(second[0].refId, first[0].refId, 'a new version is a new alert');
});
