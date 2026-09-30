const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The client catalogue: which influencers a client may browse, what they may see
 * about each, and what price they are shown. The poison fixture carries every
 * field a client must never receive; no response may contain any of it.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const POISON = {
  rateCardAmount: 4321,
  email: 'secret-inbox@poison.test',
  phone: '+968 9999 0000',
  address: 'Poison Street 13',
  notes: 'INTERNAL-NOTE-POISON',
  tags: ['poison-tag'],
  taxNumber: 'TAX-POISON',
};
const POISON_ACCOUNT = { notes: 'ACCOUNT-NOTE-POISON', estimatedAvg: 777777 };
const POISON_STRINGS = [
  '4321', 'secret-inbox@poison.test', '9999 0000', 'Poison Street', 'INTERNAL-NOTE-POISON',
  'poison-tag', 'TAX-POISON', 'ACCOUNT-NOTE-POISON', '777777', 'ownerUserId', 'rateCard',
];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-catalogue-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Agency', website: '', address: '' });
  const staff = (role, email) => store.createUser({
    name: role, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const admin = staff('Admin', 'admin@peak.test');
  const employee = staff('Employee', 'employee@peak.test');

  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const otherClient = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const influencer = (name, extra = {}, companyId = company.id) => store.createContact({
    companyId, kind: 'Person', name, roles: ['Influencer'], ownerUserId: admin.id, ...extra,
  });
  const lina = influencer('Lina Haddad', {
    ...POISON,
    influencerNiche: 'Food',
    location: 'Muscat',
    languages: ['Arabic', 'English'],
    availabilityStatus: 'Available',
    influencerAccounts: [
      { id: 'a1', platform: 'Instagram', handle: '@lina.eats', url: 'https://instagram.com/lina.eats', followers: 184000, avgViews: 52000, engagementRate: 4.2, ...POISON_ACCOUNT },
      { id: 'a2', platform: 'TikTok', handle: '@lina', followers: 91000, engagementRate: 6.1 },
    ],
  });
  const omar = influencer('Omar Fitness', {
    influencerNiche: 'Fitness', availabilityStatus: 'Unavailable', rateCardAmount: 1000,
    influencerPlatform: 'YouTube', influencerHandle: '@omarfit', followerCount: 40000, engagementRate: 3,
  });
  const unlisted = influencer('Unlisted Person', { rateCardAmount: 500 });
  const foreign = influencer('Foreign Creator', { rateCardAmount: 900 }, other.id);

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();

  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  const portalSession = async (audience, contact, email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name: email,
      role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };

  return {
    server, store, company, other, client, otherClient, lina, omar, unlisted, foreign,
    admin: auth(admin), employee: auth(employee), portalSession,
  };
};

const list = (ctx) => (entries) => Promise.all(entries.map((id) =>
  request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${id}`).set(ctx.admin)));

const assertNoPoison = (body, label) => {
  const json = JSON.stringify(body);
  for (const secret of POISON_STRINGS) assert.equal(json.includes(secret), false, `${label} leaked ${secret}`);
};

test('only listed influencers of this company appear, and only while they hold the role', async () => {
  const ctx = build();
  await list(ctx)([ctx.lina.id, ctx.omar.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');

  const res = await request(ctx.server).get('/portal-api/client/catalogue').set(client);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i) => i.name), ['Lina Haddad', 'Omar Fitness']);

  ctx.store.removeContactRole(ctx.omar.id, 'Influencer');
  const after = await request(ctx.server).get('/portal-api/client/catalogue').set(client);
  assert.deepEqual(after.body.items.map((i) => i.name), ['Lina Haddad'], 'a former influencer drops out');
  assert.equal((await request(ctx.server).get(`/portal-api/client/catalogue/${ctx.omar.id}`).set(client)).status, 404);
});

test('an influencer from another company cannot be listed here', async () => {
  const ctx = build();
  const res = await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${ctx.foreign.id}`).set(ctx.admin);
  assert.equal(res.status, 404);
  assert.equal((await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${ctx.client.id}`).set(ctx.admin)).status, 400, 'a client is not an influencer');
});

test('unlisted and foreign influencers 404 on the detail route', async () => {
  const ctx = build();
  await list(ctx)([ctx.lina.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');
  for (const id of [ctx.unlisted.id, ctx.foreign.id, ctx.client.id, 'no-such-id']) {
    assert.equal((await request(ctx.server).get(`/portal-api/client/catalogue/${id}`).set(client)).status, 404, id);
  }
  assert.equal((await request(ctx.server).get(`/portal-api/client/catalogue/${ctx.lina.id}`).set(client)).status, 200);
});

test('no response ever carries a rate, contact details or internal notes', async () => {
  const ctx = build();
  await list(ctx)([ctx.lina.id, ctx.omar.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');
  await request(ctx.server).put(`/companies/${ctx.company.id}/pricing-profiles/${ctx.client.id}`).set(ctx.admin)
    .send({ mode: 'markup', markupPercent: 25 });

  const listing = await request(ctx.server).get('/portal-api/client/catalogue').set(client);
  assertNoPoison(listing.body, 'list');
  const detail = await request(ctx.server).get(`/portal-api/client/catalogue/${ctx.lina.id}`).set(client);
  assertNoPoison(detail.body, 'detail');

  assert.deepEqual(Object.keys(detail.body).sort(),
    ['availability', 'id', 'languages', 'location', 'name', 'niche', 'platforms', 'price']);
  assert.deepEqual(Object.keys(detail.body.platforms[0]).sort(),
    ['avgViews', 'engagementRate', 'followers', 'handle', 'platform', 'url']);
});

test('the price follows the client’s own pricing profile and never reveals the rate', async () => {
  const ctx = build();
  await list(ctx)([ctx.omar.id, ctx.unlisted.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');
  const other = await ctx.portalSession('client', ctx.otherClient, 'sara@sidr.test');
  const price = async (session) =>
    (await request(ctx.server).get(`/portal-api/client/catalogue/${ctx.omar.id}`).set(session)).body.price;

  assert.deepEqual(await price(client), { kind: 'on_request' }, 'no profile yet');

  const profile = (contact, body) =>
    request(ctx.server).put(`/companies/${ctx.company.id}/pricing-profiles/${contact.id}`).set(ctx.admin).send(body);
  assert.equal((await profile(ctx.client, { mode: 'markup', markupPercent: 25 })).status, 200);
  assert.equal((await profile(ctx.otherClient, { mode: 'retainer' })).status, 200);

  const currency = ctx.store.getCompanyFinanceSettings(ctx.company.id).currencyCode;
  assert.deepEqual(await price(client), { kind: 'indicative', amount: 1250, currency });
  assert.deepEqual(await price(other), { kind: 'retainer' }, 'each client sees only their own terms');

  ctx.store.updateContact(ctx.omar.id, { rateCardAmount: null });
  assert.deepEqual(await price(client), { kind: 'on_request' }, 'no rate on file');
});

test('pricing profiles are validated and only apply to this company’s clients', async () => {
  const ctx = build();
  const put = (contact, body) =>
    request(ctx.server).put(`/companies/${ctx.company.id}/pricing-profiles/${contact.id}`).set(ctx.admin).send(body);
  for (const bad of [{ mode: 'pass_through' }, { mode: 'markup' }, { mode: 'markup', markupPercent: -5 }, { mode: 'markup', markupPercent: 501 }]) {
    assert.equal((await put(ctx.client, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await put(ctx.lina, { mode: 'retainer' })).status, 400, 'an influencer has no client pricing');
  assert.equal((await put(ctx.foreign, { mode: 'retainer' })).status, 404);

  const saved = await put(ctx.client, { mode: 'markup', markupPercent: 30 });
  assert.equal(saved.body.markupPercent, 30);
  const read = await request(ctx.server).get(`/companies/${ctx.company.id}/pricing-profiles/${ctx.client.id}`).set(ctx.admin);
  assert.deepEqual([read.body.mode, read.body.markupPercent], ['markup', 30]);
  const retainer = await put(ctx.client, { mode: 'retainer', markupPercent: 30 });
  assert.equal(retainer.body.markupPercent, null, 'retainer ignores a markup');
});

test('filters narrow the list server-side', async () => {
  const ctx = build();
  await list(ctx)([ctx.lina.id, ctx.omar.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');
  const names = async (query) =>
    (await request(ctx.server).get(`/portal-api/client/catalogue${query}`).set(client)).body.items.map((i) => i.name);

  assert.deepEqual(await names('?platform=TikTok'), ['Lina Haddad']);
  assert.deepEqual(await names('?platform=YouTube'), ['Omar Fitness'], 'legacy single-platform fields count');
  assert.deepEqual(await names('?niche=fitness'), ['Omar Fitness']);
  assert.deepEqual(await names('?availability=Available'), ['Lina Haddad']);
  assert.deepEqual(await names('?minFollowers=100000'), ['Lina Haddad']);
  assert.deepEqual(await names('?q=lina.eats'), ['Lina Haddad'], 'search covers handles');
  assert.deepEqual(await names('?q=nobody'), []);
});

test('influencers and staff tokens cannot reach the catalogue; staff controls need the permission', async () => {
  const ctx = build();
  await list(ctx)([ctx.lina.id]);
  const influencer = await ctx.portalSession('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await request(ctx.server).get('/portal-api/client/catalogue').set(influencer)).status, 401);
  assert.equal((await request(ctx.server).get('/portal-api/influencer/catalogue').set(influencer)).status, 404);
  assert.equal((await request(ctx.server).get('/portal-api/client/catalogue').set(ctx.admin)).status, 401);

  assert.equal((await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${ctx.omar.id}`).set(ctx.employee)).status, 403);
  assert.equal((await request(ctx.server).put(`/companies/${ctx.company.id}/pricing-profiles/${ctx.client.id}`).set(ctx.employee).send({ mode: 'retainer' })).status, 403);

  const ids = await request(ctx.server).get(`/companies/${ctx.company.id}/portal-catalogue`).set(ctx.admin);
  assert.deepEqual(ids.body, [ctx.lina.id]);
  assert.equal((await request(ctx.server).delete(`/companies/${ctx.company.id}/portal-catalogue/${ctx.lina.id}`).set(ctx.admin)).status, 200);
  assert.deepEqual((await request(ctx.server).get(`/companies/${ctx.company.id}/portal-catalogue`).set(ctx.admin)).body, []);
});

test('profile links are http or https only, so a staff-typed script URL never reaches a client', async () => {
  const ctx = build();
  const hostile = ctx.store.createContact({
    companyId: ctx.company.id, kind: 'Person', name: 'Hostile Link', roles: ['Influencer'],
    influencerAccounts: [
      { id: 'h1', platform: 'Instagram', handle: '@a', url: 'javascript:alert(document.cookie)' },
      { id: 'h2', platform: 'TikTok', handle: '@b', url: ' JaVaScRiPt:alert(1)' },
      { id: 'h3', platform: 'YouTube', handle: '@c', url: 'data:text/html,<script>alert(1)</script>' },
      { id: 'h4', platform: 'X', handle: '@d', url: 'https://x.com/d' },
      { id: 'h5', platform: 'Other', handle: '@e', url: 'http://example.test/e' },
    ],
  });
  await list(ctx)([hostile.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');
  const detail = await request(ctx.server).get(`/portal-api/client/catalogue/${hostile.id}`).set(client);
  assert.deepEqual(detail.body.platforms.map((p) => p.url), [null, null, null, 'https://x.com/d', 'http://example.test/e']);
});

test('facets describe the whole listed catalogue, not the filtered page', async () => {
  const ctx = build();
  await list(ctx)([ctx.lina.id, ctx.omar.id]);
  const client = await ctx.portalSession('client', ctx.client, 'omar@alnoor.test');
  const res = await request(ctx.server).get('/portal-api/client/catalogue?niche=food').set(client);
  assert.deepEqual(res.body.items.map((i) => i.name), ['Lina Haddad']);
  assert.deepEqual(res.body.facets, {
    platforms: ['Instagram', 'TikTok', 'YouTube'],
    niches: ['Fitness', 'Food'],
    availability: ['Available', 'Unavailable'],
  });
  assert.equal(res.body.total, 1);
});
