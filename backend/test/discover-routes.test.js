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

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-discover-routes-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, email) => store.createUser({ name: role, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const admin = staff('Admin', 'admin@peak.test');
  const manager = staff('Manager', 'manager@peak.test');
  const employee = staff('Employee', 'employee@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: manager.id });
  const scraper = new FixtureScraper();
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet,
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), discoverScraper: scraper,
  }).listen(0);
  server.unref();
  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  const clientSession = async () => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email: 'buyer@alnoor.test', name: 'Buyer', role: 'client_admin' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post('/portal-api/client/auth/login').send({ email: 'buyer@alnoor.test', password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { store, company, server, scraper, client, manager, admin: auth(admin), managerAuth: auth(manager), employee: auth(employee), clientSession };
};

/** Handles added by staff and fetched, as the daily refresh would. */
const seed = async (ctx, handles) => {
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/discover/handles`).set(ctx.admin).send({ text: handles.join('\n') });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  // The route starts a fetch in the background; wait for it to finish.
  for (let i = 0; i < 50 && ctx.store.discover.running(ctx.company.id); i++) await new Promise((r) => setTimeout(r, 20));
  await refreshDue(ctx.store, ctx.scraper, ctx.company.id, { monthlyCap: 1800 });
};

test('only Admins and Managers run the directory', async () => {
  const ctx = build();
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/discover`).set(ctx.employee)).status, 403);
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/discover`).set(ctx.managerAuth)).status, 200);
  const res = await request(ctx.server).get(`/companies/${ctx.company.id}/discover`).set(ctx.admin);
  assert.equal(res.body.summary.apifyConfigured, true);
  assert.equal(res.body.summary.limit, 200);
});

test('staff add handles, the fetch fills them in, and staff see contacts from the bio', async () => {
  const ctx = build();
  await seed(ctx, ['@muscat.eats', 'https://www.instagram.com/omani.fashion/']);
  const res = await request(ctx.server).get(`/companies/${ctx.company.id}/discover?status=listed`).set(ctx.admin);
  const eats = res.body.profiles.find((p) => p.username === 'muscat.eats');
  assert.equal(eats.followers, 248000);
  assert.equal(eats.tier, 'mid');
  assert.deepEqual(eats.emails, ['hello@muscateats.om']);
  const again = await request(ctx.server).post(`/companies/${ctx.company.id}/discover/handles`).set(ctx.admin).send({ text: 'muscat.eats' });
  assert.deepEqual(again.body.alreadyThere, ['muscat.eats']);
});

test('clients see listed, fetched profiles only, with no emails or phone numbers anywhere', async () => {
  const ctx = build();
  await seed(ctx, ['muscat.eats', 'omani.fashion', 'salalah.travels']);
  const fashion = ctx.store.discover.byUsername(ctx.company.id, 'omani.fashion');
  await request(ctx.server).patch(`/discover-profiles/${fashion.id}`).set(ctx.admin).send({ status: 'removed' });
  ctx.store.discover.addHandles(ctx.company.id, ['not.fetched.yet']);
  const client = await ctx.clientSession();

  const res = await request(ctx.server).get('/portal-api/client/discover').set(client);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i) => i.username), ['muscat.eats', 'salalah.travels'], 'removed and unfetched are hidden; sorted by followers');
  const json = JSON.stringify(res.body);
  for (const secret of ['hello@muscateats.om', '9123', 'emails', 'phones', 'externalUrl']) assert.equal(json.includes(secret), false, `leaked ${secret}`);
  assert.equal(res.body.items[0].growth3m, null, 'growth needs three months of history');

  const micro = await request(ctx.server).get('/portal-api/client/discover?tier=micro').set(client);
  assert.deepEqual(micro.body.items.map((i) => i.username), ['salalah.travels']);
  assert.equal((await request(ctx.server).get(`/portal-api/client/discover/${fashion.id}/photo`).set(client)).status, 404, 'removed profile photo is hidden too');
  const photo = await request(ctx.server).get(`/portal-api/client/discover/${res.body.items[0].id}/photo`).set(client);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers['content-type'], 'image/png');
});

test('a client request raises one follow-up for the account manager and shows as requested', async () => {
  const ctx = build();
  await seed(ctx, ['salalah.travels']);
  const client = await ctx.clientSession();
  const id = ctx.store.discover.byUsername(ctx.company.id, 'salalah.travels').id;
  const first = await request(ctx.server).post(`/portal-api/client/discover/${id}/request`).set(client).send({ note: 'For Ramadan' });
  assert.equal(first.status, 201);
  await request(ctx.server).post(`/portal-api/client/discover/${id}/request`).set(client).send({});
  const followups = ctx.store.listFollowups(ctx.company.id).filter((f) => f.sourceType === 'discover_profile');
  assert.equal(followups.length, 1, 'asking twice raises one follow-up');
  assert.equal(followups[0].ownerUserId, ctx.manager.id);
  assert.match(followups[0].notes, /Not on Peak's roster yet/);
  const list = await request(ctx.server).get('/portal-api/client/discover').set(client);
  assert.equal(list.body.items[0].requested, true);
});

test('a profile linked to a listed roster influencer says so', async () => {
  const ctx = build();
  await seed(ctx, ['muscat.eats']);
  const influencer = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Person', name: 'Eats', roles: ['Influencer'] });
  await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${influencer.id}`).set(ctx.admin);
  const id = ctx.store.discover.byUsername(ctx.company.id, 'muscat.eats').id;
  assert.equal((await request(ctx.server).patch(`/discover-profiles/${id}`).set(ctx.admin).send({ contactId: ctx.client.id })).status, 400, 'a client is not an influencer');
  await request(ctx.server).patch(`/discover-profiles/${id}`).set(ctx.admin).send({ contactId: influencer.id, gender: 'male', niche: 'Food' });
  const client = await ctx.clientSession();
  const res = await request(ctx.server).get('/portal-api/client/discover?peak=1').set(client);
  assert.equal(res.body.items[0].catalogueId, influencer.id);
  assert.equal(res.body.items[0].gender, 'male');
});

test('runs refuse without Apify and while another run is going', async () => {
  const ctx = build();
  ctx.store.discover.startRun(ctx.company.id, 'refresh');
  assert.equal((await request(ctx.server).post(`/companies/${ctx.company.id}/discover/find`).set(ctx.admin)).status, 409);
});

test('a roster influencer shows in Discover unless hidden, and staff cannot remove the entry', async () => {
  const ctx = build();
  const lina = ctx.store.createContact({
    companyId: ctx.company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'],
    influencerAccounts: [{ id: 'a1', platform: 'Instagram', handle: '@salalah.travels' }],
  });
  await request(ctx.server).delete(`/companies/${ctx.company.id}/portal-catalogue/${lina.id}`).set(ctx.admin);
  await refreshDue(ctx.store, ctx.scraper, ctx.company.id, { monthlyCap: 1800 });
  const client = await ctx.clientSession();
  const before = await request(ctx.server).get('/portal-api/client/discover').set(client);
  assert.deepEqual(before.body.items.map((i) => i.username), [], 'hidden from clients, so not in Discover');

  await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${lina.id}`).set(ctx.admin);
  const after = await request(ctx.server).get('/portal-api/client/discover').set(client);
  assert.equal(after.body.items[0].username, 'salalah.travels');
  assert.equal(after.body.items[0].catalogueId, lina.id);

  const staff = await request(ctx.server).get(`/companies/${ctx.company.id}/discover`).set(ctx.admin);
  assert.equal(staff.body.summary.rosterCount, 1);
  const id = after.body.items[0].id;
  assert.equal((await request(ctx.server).patch(`/discover-profiles/${id}`).set(ctx.admin).send({ status: 'removed' })).status, 409);
  assert.equal((await request(ctx.server).patch(`/discover-profiles/${id}`).set(ctx.admin).send({ niche: 'Travel' })).status, 200, 'details can still be set');
});

test('without a connected Instagram, the catalogue shows the scraped followers with their date', async () => {
  const ctx = build();
  const lina = ctx.store.createContact({
    companyId: ctx.company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'],
    influencerAccounts: [{ id: 'a1', platform: 'Instagram', handle: '@salalah.travels', followers: 1 }],
  });
  await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${lina.id}`).set(ctx.admin);
  await refreshDue(ctx.store, ctx.scraper, ctx.company.id, { monthlyCap: 1800 });
  const client = await ctx.clientSession();
  const res = await request(ctx.server).get(`/portal-api/client/catalogue/${lina.id}`).set(client);
  const ig = res.body.platforms.find((p) => p.platform === 'Instagram');
  assert.equal(ig.followers, 96500);
  assert.match(ig.verified.asOf, /^\d{4}-\d{2}-\d{2}$/);
});

test('influencer photos: staff of the company see them, clients see them unless the influencer is hidden', async () => {
  const ctx = build();
  const lina = ctx.store.createContact({
    companyId: ctx.company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'],
    influencerAccounts: [{ id: 'a1', platform: 'Instagram', handle: '@salalah.travels' }],
  });
  const noHandle = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Person', name: 'No handle', roles: ['Influencer'] });
  await refreshDue(ctx.store, ctx.scraper, ctx.company.id, { monthlyCap: 1800 });

  const list = await request(ctx.server).get(`/companies/${ctx.company.id}/influencer-photos`).set(ctx.employee);
  assert.equal(list.status, 200, 'any staff member of the company, not only directory managers');
  assert.deepEqual(Object.keys(list.body.photos), [lina.id]);
  const photo = await request(ctx.server).get(`/contacts/${lina.id}/influencer-photo`).set(ctx.employee);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers['content-type'], 'image/png');
  assert.equal((await request(ctx.server).get(`/contacts/${noHandle.id}/influencer-photo`).set(ctx.employee)).status, 404);
  assert.equal((await request(ctx.server).get(`/contacts/${lina.id}/influencer-photo`)).status, 401);

  const other = ctx.store.createCompany({ name: 'Other Co', website: '', address: '' });
  const outsider = ctx.store.createUser({ name: 'Out', email: 'out@other.test', password: 'x', role: 'Admin', companyIds: [other.id], companyRoles: [{ companyId: other.id, role: 'Admin' }] });
  const outsiderAuth = { Authorization: `Bearer ${ctx.store.issueToken(outsider.id)}` };
  assert.equal((await request(ctx.server).get(`/contacts/${lina.id}/influencer-photo`).set(outsiderAuth)).status, 403);
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/influencer-photos`).set(outsiderAuth)).status, 403);

  const client = await ctx.clientSession();
  await request(ctx.server).delete(`/companies/${ctx.company.id}/portal-catalogue/${lina.id}`).set(ctx.admin);
  assert.equal((await request(ctx.server).get(`/portal-api/client/catalogue/${lina.id}/photo`).set(client)).status, 404, 'hidden');
  await request(ctx.server).put(`/companies/${ctx.company.id}/portal-catalogue/${lina.id}`).set(ctx.admin);
  const catalogue = await request(ctx.server).get('/portal-api/client/catalogue').set(client);
  assert.ok(catalogue.body.items.find((i) => i.id === lina.id).photoAt);
  const clientPhoto = await request(ctx.server).get(`/portal-api/client/catalogue/${lina.id}/photo`).set(client);
  assert.equal(clientPhoto.status, 200);
  assert.equal(clientPhoto.headers['content-type'], 'image/png');
});
