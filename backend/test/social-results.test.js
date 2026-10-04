const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { FixtureMetaClient } = require('../dist/social/meta-client');
const { sealToken } = require('../dist/social/crypto');
const { sweepMediaResults } = require('../dist/social/results');
const { makeTmpDir } = require('./helpers/tmp');

/** M2: a published post from a connected account gets real results at 24h, 7d and 30d. */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const HOUR = 3600_000;
const FIXTURES = path.join(__dirname, 'fixtures', 'meta');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-results-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor', roles: ['Client'] });
  const rivalClient = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'] });
  const noel = store.createContact({ companyId: company.id, kind: 'Person', name: 'Noel', roles: ['Influencer'] });
  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan', status: 'Active', visibility: 'Public' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', status: 'Confirmed' });
  const publishedAt = new Date(Date.now() - 30 * HOUR);
  const reel = store.createCampaignDeliverable({ companyId: company.id, campaignId: campaign.id, title: 'Reel', status: 'Published', fulfillment: 'External', vendorContactId: lina.id, contentUrl: 'https://www.instagram.com/reel/AbC123/', publishedAt });
  const unconnected = store.createCampaignDeliverable({ companyId: company.id, campaignId: campaign.id, title: 'Noel story', status: 'Published', fulfillment: 'External', vendorContactId: noel.id, contentUrl: 'https://www.instagram.com/p/XyZ789/', publishedAt });
  store.social.upsertAccount({ companyId: company.id, contactId: lina.id, externalId: '17841400000000001', username: 'lina.eats', accountType: 'MEDIA_CREATOR', tokenSealed: sealToken('fixture-token'), expiresAt: new Date(Date.now() + 50 * 24 * HOUR).toISOString() });
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy', portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }) }).listen(0);
  server.unref();
  const session = async (audience, contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    return { Authorization: `Bearer ${(await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD })).body.token}` };
  };
  return { server, store, company, client, rivalClient, lina, campaign, reel, unconnected, publishedAt, session, meta: new FixtureMetaClient(FIXTURES) };
};

test('checkpoints are taken once each, only when due, only for connected accounts', async () => {
  const ctx = build();
  await sweepMediaResults(ctx.store, ctx.meta, ctx.company.id, new Date());
  assert.deepEqual(ctx.store.social.mediaResults(ctx.reel.id).map((r) => r.checkpoint), ['24h'], '30 hours after publishing: only 24h is due');
  await sweepMediaResults(ctx.store, ctx.meta, ctx.company.id, new Date());
  assert.equal(ctx.store.social.mediaResults(ctx.reel.id).length, 1, 'once');
  await sweepMediaResults(ctx.store, ctx.meta, ctx.company.id, new Date(ctx.publishedAt.getTime() + 8 * 24 * HOUR));
  assert.deepEqual(ctx.store.social.mediaResults(ctx.reel.id).map((r) => r.checkpoint), ['24h', '7d']);
  assert.equal(ctx.store.social.mediaResults(ctx.unconnected.id).length, 0, 'no connection, no guessing');
});

test('the client sees verified results for their own campaign only, without internal ids', async () => {
  const ctx = build();
  await sweepMediaResults(ctx.store, ctx.meta, ctx.company.id, new Date());
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(omar);
  const reel = body.deliverables.find((d) => d.title === 'Reel');
  assert.deepEqual(reel.results, { checkpoint: '24h', views: 88412, likes: 6120, comments: 431, saves: 902, shares: 377, verified: true });
  assert.equal(body.deliverables.find((d) => d.title === 'Noel story').results, null);
  assert.deepEqual(body.results, { posts: 1, views: 88412, likes: 6120, comments: 431, saves: 902, shares: 377 });
  const json = JSON.stringify(body);
  for (const secret of ['18000000000000011', 'mediaId', 'accountId', '17841400000000001']) assert.equal(json.includes(secret), false, `leaked ${secret}`);
  const sara = await ctx.session('client', ctx.rivalClient, 'sara@sidr.test');
  assert.equal((await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(sara)).status, 404);
});

test('the influencer sees results on their own published work', async () => {
  const ctx = build();
  await sweepMediaResults(ctx.store, ctx.meta, ctx.company.id, new Date());
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const work = (await request(ctx.server).get('/portal-api/influencer/assignments').set(lina)).body[0].deliverables[0];
  assert.equal(work.results.views, 88412);
});
