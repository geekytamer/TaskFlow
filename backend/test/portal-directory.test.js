const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { FixtureScraper } = require('../dist/discover/apify');
const { refreshDue } = require('../dist/discover/jobs');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

/**
 * The client portal's one directory: Peak's influencers (shown unless hidden)
 * and approved Discover profiles, in one shape that never says which is which.
 */
const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-directory-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const admin = store.createUser({ name: 'Admin', email: 'admin@peak.test', password: 'x', role: 'Admin', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Admin' }] });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: admin.id });
  const lina = store.createContact({
    companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'], rateCardAmount: 1000, influencerNiche: 'Travel',
    influencerAccounts: [{ id: 'a1', platform: 'Instagram', handle: '@salalah.travels', followers: 1 }], email: 'lina@private.test',
  });
  const hidden = store.createContact({ companyId: company.id, kind: 'Person', name: 'Hidden One', roles: ['Influencer'] });
  const scraper = new FixtureScraper();
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet,
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), discoverScraper: scraper,
  }).listen(0);
  server.unref();
  const staff = { Authorization: `Bearer ${store.issueToken(admin.id)}` };
  // Approved Discover profiles: muscat.eats listed, omani.fashion a candidate only.
  store.discover.addHandles(company.id, ['muscat.eats']);
  store.discover.addHandles(company.id, ['omani.fashion'], 'candidate');
  await refreshDue(store, scraper, company.id, { monthlyCap: 1800 });
  await request(server).delete(`/companies/${company.id}/portal-catalogue/${hidden.id}`).set(staff);
  await request(server).put(`/companies/${company.id}/pricing-profiles/${client.id}`).set(staff).send({ mode: 'markup', markupPercent: 0 });
  const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email: 'buyer@alnoor.test', name: 'Buyer', role: 'client_admin' });
  store.portal.acceptInvitation(token, PASSWORD);
  const login = await request(server).post('/portal-api/client/auth/login').send({ email: 'buyer@alnoor.test', password: PASSWORD });
  return { store, company, server, staff, lina, hidden, session: { Authorization: `Bearer ${login.body.token}` } };
};

test('one list: shown roster and approved Discover profiles, each once, in the same shape', async () => {
  const ctx = await build();
  const res = await request(ctx.server).get('/portal-api/client/directory').set(ctx.session);
  assert.equal(res.status, 200);
  const names = res.body.items.map((i) => i.name).sort();
  assert.deepEqual(names, ['Lina', 'Muscat Eats'].sort(), 'hidden and candidate profiles stay out; Lina once although Discover also tracks her');
  const [a, b] = res.body.items;
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), 'nothing in the shape tells roster from Discover');
  const json = JSON.stringify(res.body);
  for (const secret of ['lina@private.test', 'hello@muscateats.om', 'rateCardAmount', 'isRoster', 'catalogueId', 'contactId']) {
    assert.equal(json.includes(secret), false, `leaked ${secret}`);
  }
  const lina = res.body.items.find((i) => i.name === 'Lina');
  assert.equal(lina.followers, 96_500, 'scraped figures');
  assert.deepEqual(lina.price, { kind: 'range', min: 700, max: 1300, currency: lina.price.currency });
  assert.equal(res.body.items.find((i) => i.name === 'Muscat Eats').price.kind, 'on_request');
});

test('sorting and filtering happen on the server', async () => {
  const ctx = await build();
  const names = async (q) => (await request(ctx.server).get(`/portal-api/client/directory${q}`).set(ctx.session)).body.items.map((i) => i.name);
  assert.deepEqual(await names('?sort=name'), ['Lina', 'Muscat Eats']);
  assert.deepEqual(await names('?sort=followers'), ['Muscat Eats', 'Lina']);
  assert.deepEqual(await names('?minFollowers=100000'), ['Muscat Eats']);
  assert.deepEqual(await names('?maxPrice=800'), ['Lina'], 'budget keeps ranges starting at or below it');
  assert.deepEqual(await names('?q=salalah'), ['Lina'], 'search covers handles');
  assert.deepEqual(await names('?niche=Travel'), ['Lina']);
});

test('a price range keeps influencers whose range overlaps it; price on request drops out', async () => {
  const ctx = await build();
  const names = async (q) => (await request(ctx.server).get(`/portal-api/client/directory${q}`).set(ctx.session)).body.items.map((i) => i.name);
  // Lina charges 700-1300; Muscat Eats is price on request.
  assert.deepEqual(await names('?minPrice=1000'), ['Lina'], 'her range reaches 1000');
  assert.deepEqual(await names('?minPrice=1500'), [], 'her range tops out below');
  assert.deepEqual(await names('?minPrice=500&maxPrice=800'), ['Lina']);
  assert.deepEqual(await names('?minPrice=1400&maxPrice=2000'), []);
  assert.deepEqual(await names('?minPrice=800&maxPrice=100'), ['Lina'], 'min above max is read as 100-800');
});

test('comma-separated niches are separate niches for filters and facets', async () => {
  const ctx = await build();
  ctx.store.updateContact(ctx.lina.id, { influencerNiche: 'Food, Lifestyle' });
  const get = (q) => request(ctx.server).get(`/portal-api/client/directory${q}`).set(ctx.session);
  assert.deepEqual((await get('?niche=food')).body.items.map((i) => i.name), ['Lina']);
  assert.deepEqual((await get('?niche=Lifestyle')).body.items.map((i) => i.name), ['Lina']);
  assert.deepEqual((await get('?niche=Food%2C%20Lifestyle')).body.items.map((i) => i.name), [], 'the whole string is not a niche');
  const niches = (await get('')).body.facets.niches;
  assert.ok(niches.includes('Food') && niches.includes('Lifestyle'));
  assert.equal(niches.includes('Food, Lifestyle'), false);
});

test('a niche is stored in one canonical form when staff save it', async () => {
  const ctx = await build();
  const res = await request(ctx.server).put(`/contacts/${ctx.lina.id}`).set(ctx.staff).send({ influencerNiche: ' food ,Food;  travel' });
  assert.equal(res.status, 200);
  assert.equal(ctx.store.getContactById(ctx.lina.id).influencerNiche, 'food, travel');
});

test('detail and photo work for both kinds; hidden ones 404', async () => {
  const ctx = await build();
  const list = (await request(ctx.server).get('/portal-api/client/directory').set(ctx.session)).body.items;
  for (const e of list) {
    assert.equal((await request(ctx.server).get(`/portal-api/client/directory/${e.id}`).set(ctx.session)).status, 200);
    assert.equal((await request(ctx.server).get(`/portal-api/client/directory/${e.id}/photo`).set(ctx.session)).status, 200, e.name);
  }
  assert.equal((await request(ctx.server).get(`/portal-api/client/directory/${ctx.hidden.id}`).set(ctx.session)).status, 404);
  assert.equal((await request(ctx.server).get('/portal-api/client/directory').set(ctx.staff)).status, 401, 'staff tokens are not client sessions');
});

test('a request can shortlist both kinds; only staff learn who is not on the roster', async () => {
  const ctx = await build();
  const items = (await request(ctx.server).get('/portal-api/client/directory').set(ctx.session)).body.items;
  const res = await request(ctx.server).post('/portal-api/client/requests').set(ctx.session)
    .send({ title: 'Ramadan', objective: 'Awareness for the Ramadan box', platforms: ['Instagram'], influencerIds: items.map((i) => i.id) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.influencers.map((i) => i.name).sort(), ['Lina', 'Muscat Eats'].sort());
  assert.equal(JSON.stringify(res.body).includes('not on the roster'), false);
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  assert.match(opportunity.notes, /Muscat Eats \[not on the roster yet\]/);
  const bad = await request(ctx.server).post('/portal-api/client/requests').set(ctx.session)
    .send({ title: 'x', objective: 'Awareness for the Ramadan box', platforms: ['Instagram'], influencerIds: [ctx.hidden.id] });
  assert.equal(bad.status, 400, 'hidden influencers cannot be requested');
});
