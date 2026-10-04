const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { FixtureMetaClient, MetaAuthError } = require('../dist/social/meta-client');
const { sweepSocial } = require('../dist/social/sync');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * M1: an influencer connects Instagram; figures sync daily and show to
 * clients as verified. Tokens never leave the server; states are single-use
 * and bound to the session; Meta's data-deletion callback purges everything.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const APP_SECRET = 'test-app-secret';
const FIXTURES = path.join(__dirname, 'fixtures', 'meta');

const build = (client = new FixtureMetaClient(FIXTURES)) => {
  const dbPath = path.join(makeTmpDir('taskflow-social-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const owner = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const lina = store.createContact({
    companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer'], ownerUserId: owner.id,
    influencerAccounts: [{ id: 'a', platform: 'Instagram', handle: '@lina.eats', followers: 120000 }],
  });
  const rival = store.createContact({ companyId: company.id, kind: 'Person', name: 'Rival', roles: ['Influencer'] });
  const client_ = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor', roles: ['Client'] });
  store.catalogue.list(company.id, lina.id);
  store.catalogue.setPricingProfile({ companyId: company.id, contactId: client_.id, mode: 'markup', markupPercent: 20 });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
    social: { client, appSecret: APP_SECRET, redirectUri: 'https://api.peak.test/social/instagram/callback', portalReturnUrl: 'https://creators.peak.test/profile' },
  }).listen(0);
  server.unref();
  const session = async (audience, contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, company, owner, lina, rival, client: client_, session };
};

const connect = async (ctx, sessionHeaders) => {
  const start = await request(ctx.server).post('/portal-api/influencer/social/instagram/connect').set(sessionHeaders);
  assert.equal(start.status, 200);
  const state = new URL(start.body.url).searchParams.get('state');
  return { state, callback: () => request(ctx.server).get(`/social/instagram/callback?code=fixture-code&state=${encodeURIComponent(state)}`) };
};

test('an influencer connects Instagram; the token is sealed and never returned', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const { callback } = await connect(ctx, lina);
  const done = await callback();
  assert.equal(done.status, 302);
  assert.equal(done.headers.location, 'https://creators.peak.test/profile?connected=instagram');
  const row = ctx.store.social.accountsFor(ctx.company.id, ctx.lina.id)[0];
  assert.equal(row.username, 'lina.eats');
  assert.equal(row.status, 'active');
  assert.match(row.tokenSealed, /^v1:/);
  assert.equal(row.tokenSealed.includes('fixture-token'), false);

  const list = await request(ctx.server).get('/portal-api/influencer/social').set(lina);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((a) => [a.platform, a.username, a.status]), [['instagram', 'lina.eats', 'active']]);
  assert.equal(JSON.stringify(list.body).match(/token|v1:/i), null, 'no token in any form');
  assert.ok(ctx.store.social.latestSnapshot(row.id), 'the first sync ran');
});

test('a state works once, only for its session, and expires', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const { callback } = await connect(ctx, lina);
  assert.equal((await callback()).status, 302);
  assert.equal((await callback()).status, 400, 'used once');
  assert.equal((await request(ctx.server).get('/social/instagram/callback?code=x&state=made-up')).status, 400);
  const second = await connect(ctx, lina);
  ctx.store.social.ageState(second.state, 11 * 60 * 1000);
  assert.equal((await second.callback()).status, 400, 'expired after 10 minutes');
});

test('a personal account cannot connect', async () => {
  const personal = new FixtureMetaClient(FIXTURES);
  personal.profile = async () => ({ id: '9', username: 'just.me', accountType: 'PERSONAL', followers: 10, mediaCount: 1 });
  const ctx = build(personal);
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const done = await (await connect(ctx, lina)).callback();
  assert.equal(done.status, 302);
  assert.equal(done.headers.location, 'https://creators.peak.test/profile?connected=instagram&error=personal_account');
  assert.equal(ctx.store.social.accountsFor(ctx.company.id, ctx.lina.id).length, 0);
});

test('clients see synced followers as verified, with the date; hand-entered ones are not', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const before = (await request(ctx.server).get(`/portal-api/client/catalogue/${ctx.lina.id}`).set(omar)).body;
  assert.equal(before.platforms[0].followers, 120000);
  assert.equal(before.platforms[0].verified, null);

  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  await (await connect(ctx, lina)).callback();
  const after = (await request(ctx.server).get(`/portal-api/client/catalogue/${ctx.lina.id}`).set(omar)).body;
  assert.equal(after.platforms[0].followers, 184230);
  assert.match(after.platforms[0].verified.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(JSON.stringify(after).includes('tokenSealed'), false);
});

test('another influencer cannot disconnect the account; the owner can, and the token is erased', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  await (await connect(ctx, lina)).callback();
  const id = ctx.store.social.accountsFor(ctx.company.id, ctx.lina.id)[0].id;
  const rival = await ctx.session('influencer', ctx.rival, 'rival@creator.test');
  assert.equal((await request(ctx.server).post(`/portal-api/influencer/social/${id}/disconnect`).set(rival)).status, 404);
  assert.equal((await request(ctx.server).post(`/portal-api/influencer/social/${id}/disconnect`).set(lina)).status, 200);
  const row = ctx.store.social.getAccount(id);
  assert.equal(row.status, 'revoked');
  assert.equal(row.tokenSealed, null);
});

test('the daily sweep writes one snapshot a day and flags a revoked token once', async () => {
  const flaky = new FixtureMetaClient(FIXTURES);
  const ctx = build(flaky);
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  await (await connect(ctx, lina)).callback();
  const id = ctx.store.social.accountsFor(ctx.company.id, ctx.lina.id)[0].id;
  const tomorrow = new Date(Date.now() + 86400_000);
  await sweepSocial(ctx.store, flaky, ctx.company.id, tomorrow);
  await sweepSocial(ctx.store, flaky, ctx.company.id, tomorrow);
  assert.equal(ctx.store.social.snapshots(id).length, 2, 'connect day and tomorrow, once each');

  flaky.accountInsights = async () => { throw new MetaAuthError('revoked'); };
  const later = new Date(Date.now() + 2 * 86400_000);
  await sweepSocial(ctx.store, flaky, ctx.company.id, later);
  await sweepSocial(ctx.store, flaky, ctx.company.id, later);
  assert.equal(ctx.store.social.getAccount(id).status, 'needs_reconnect');
  assert.equal(ctx.store.listNotifications(ctx.owner.id).filter((n) => n.title.includes('reconnect')).length, 1);
});

test("Meta's data-deletion callback needs a valid signature and purges the account", async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  await (await connect(ctx, lina)).callback();
  const sign = (payload, secret = APP_SECRET) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${sig}.${body}`;
  };
  const bad = await request(ctx.server).post('/social/meta/data-deletion').type('form').send({ signed_request: sign({ user_id: '17841400000000001', algorithm: 'HMAC-SHA256' }, 'wrong') });
  assert.equal(bad.status, 400);
  const ok = await request(ctx.server).post('/social/meta/data-deletion').type('form').send({ signed_request: sign({ user_id: '17841400000000001', algorithm: 'HMAC-SHA256' }) });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.confirmation_code);
  assert.match(ok.body.url, /deletion/);
  assert.equal(ctx.store.social.accountsFor(ctx.company.id, ctx.lina.id).length, 0);
});
