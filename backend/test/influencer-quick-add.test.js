const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { FixtureScraper } = require('../dist/discover/apify');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };

/** A company with an Admin; `portal` makes it the portal company with a fixture scraper. */
const build = ({ portal = false } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-influencer-add-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, email) => store.createUser({ name: role, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const admin = staff('Admin', 'admin@peak.test');
  const employee = staff('Employee', 'employee@peak.test');
  const scraper = portal ? new FixtureScraper() : null;
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    ...(portal ? { portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }) } : {}),
    discoverScraper: scraper,
  }).listen(0);
  server.unref();
  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  return { store, company, server, scraper, admin: auth(admin), employee: auth(employee) };
};

const influencer = (ctx, name, accounts, extra = {}) => ctx.store.createContact({
  companyId: ctx.company.id, kind: 'Person', name, roles: ['Influencer'],
  influencerAccounts: accounts.map(([platform, handle], i) => ({ id: `${name}-${i}`, platform, handle })), ...extra,
});

const waitForRuns = async (ctx) => {
  for (let i = 0; i < 100 && ctx.store.discover.running(ctx.company.id); i++) await new Promise((r) => setTimeout(r, 20));
};

test('creating an influencer with a handle another influencer has is refused, naming that record', async () => {
  const ctx = build();
  const ahmed = influencer(ctx, 'Ahmed', [['Instagram', 'ahmed.om']]);
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts`).set(ctx.admin).send({
    kind: 'Person', name: 'Ahmed again', roles: ['Influencer'],
    influencerAccounts: [{ platform: 'Instagram', url: 'https://www.instagram.com/Ahmed.OM/' }],
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, 'duplicate_handle');
  assert.deepEqual(res.body.duplicateOf, { id: ahmed.id, name: 'Ahmed' });
  assert.match(res.body.message, /@ahmed\.om on Instagram is already on Ahmed's record/);

  const single = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts`).set(ctx.admin).send({
    kind: 'Person', name: 'Typed old way', roles: ['Influencer'], influencerPlatform: 'Instagram', influencerHandle: '@ahmed.om',
  });
  assert.equal(single.status, 409, 'the single-platform fields are checked too');

  const client = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts`).set(ctx.admin).send({
    kind: 'Organization', name: 'A shop', roles: ['Client'], influencerAccounts: [{ platform: 'Instagram', handle: 'ahmed.om' }],
  });
  assert.equal(client.status, 201, 'only influencers are checked');
});

test('an update is refused only for a handle it adds, so records that already clash stay editable', async () => {
  const ctx = build();
  influencer(ctx, 'Ahmed', [['Instagram', 'ahmed.om']]);
  const twin = influencer(ctx, 'Ahmed twin', [['Instagram', 'ahmed.om']]);
  const sara = influencer(ctx, 'Sara', [['TikTok', 'sara.tt']]);

  const keep = await request(ctx.server).put(`/contacts/${twin.id}`).set(ctx.admin).send({ name: 'Ahmed (old record)', influencerAccounts: twin.influencerAccounts });
  assert.equal(keep.status, 200, JSON.stringify(keep.body));

  const steal = await request(ctx.server).put(`/contacts/${sara.id}`).set(ctx.admin).send({
    influencerAccounts: [...sara.influencerAccounts, { platform: 'Instagram', handle: '@AHMED.OM' }],
  });
  assert.equal(steal.status, 409);
  assert.equal(steal.body.duplicateOf.name, 'Ahmed');
  assert.equal(ctx.store.getContactById(sara.id).influencerAccounts.length, 1, 'nothing saved');
});

test('quick add: one influencer per line, existing handles answer with their record, junk is reported', async () => {
  const ctx = build();
  const ahmed = influencer(ctx, 'Ahmed', [['Instagram', 'ahmed.om']]);
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({
    text: 'Sara Al Harthy instagram.com/sara.om https://www.tiktok.com/@sara.tt\n@ahmed.om\nhttps://example.com/nobody\n@new.one',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.results.map((r) => r.status), ['created', 'existing', 'invalid', 'created']);
  assert.deepEqual(res.body.results[1].contact, { id: ahmed.id, name: 'Ahmed' });
  assert.equal(res.body.fetching, false, 'no directory here');

  const sara = ctx.store.getContactById(res.body.results[0].contact.id);
  assert.equal(sara.name, 'Sara Al Harthy');
  assert.equal(sara.kind, 'Person');
  assert.deepEqual(sara.roles, ['Influencer']);
  assert.deepEqual(sara.influencerAccounts.map((a) => `${a.platform}:${a.handle}`), ['Instagram:sara.om', 'TikTok:sara.tt']);
  assert.equal(sara.influencerPlatform, 'Instagram');
  assert.equal(sara.influencerHandle, 'sara.om');
  assert.equal(ctx.store.getContactById(res.body.results[3].contact.id).name, '@new.one', 'no name given: the handle stands in');

  const again = await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: 'tiktok.com/@sara.tt' });
  assert.equal(again.body.results[0].status, 'existing', 'any account of a record matches');
  assert.equal(ctx.store.listContacts(ctx.company.id, 'Influencer').length, 3);
});

test('quick add: the same handle twice in one paste creates one record', async () => {
  const ctx = build();
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: '@twice\ninstagram.com/twice' });
  assert.deepEqual(res.body.results.map((r) => r.status), ['created', 'existing']);
  assert.equal(res.body.results[0].contact.id, res.body.results[1].contact.id);
});

test('quick add: limits and permission', async () => {
  const ctx = build();
  const tooMany = Array.from({ length: 101 }, (_, i) => `@h${i}`).join('\n');
  assert.equal((await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: tooMany })).status, 400);
  assert.equal((await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: '  ' })).status, 400);
  assert.equal((await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.employee).send({ text: '@x' })).status, 403);
});

test('quick add on the portal company: Instagram figures and the full name arrive by themselves', async () => {
  const ctx = build({ portal: true });
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: '@muscat.eats\nKeep My Name instagram.com/salalah.travels' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.fetching, true);
  await waitForRuns(ctx);
  const [eats, travels] = res.body.results.map((r) => ctx.store.getContactById(r.contact.id));
  assert.equal(eats.name, 'Muscat Eats', 'the @handle placeholder takes the Instagram name');
  assert.equal(eats.influencerAccounts[0].followers, 248000);
  assert.ok(eats.influencerAccounts[0].syncedAt);
  assert.equal(travels.name, 'Keep My Name', 'a typed name is kept');
  assert.equal(travels.influencerAccounts[0].followers, 96500);
  assert.equal(ctx.store.discover.byUsername(ctx.company.id, 'muscat.eats').isRoster, true);
});

const seedDirectory = async (ctx, handles) => {
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/discover/handles`).set(ctx.admin).send({ text: handles.join('\n') });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  await waitForRuns(ctx);
};

test('a Discover profile joins the roster in one step, with its figures, and leaves the 200', async () => {
  const ctx = build({ portal: true });
  await seedDirectory(ctx, ['muscat.eats']);
  const profile = ctx.store.discover.byUsername(ctx.company.id, 'muscat.eats');
  ctx.store.discover.update(profile.id, { niche: 'Food', location: 'Muscat' });
  const before = ctx.store.discover.countActive(ctx.company.id);

  const res = await request(ctx.server).post(`/discover-profiles/${profile.id}/add-to-roster`).set(ctx.admin);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const contact = ctx.store.getContactById(res.body.contact.id);
  assert.equal(contact.name, 'Muscat Eats');
  assert.deepEqual(contact.roles, ['Influencer']);
  assert.equal(contact.kind, 'Person');
  assert.equal(contact.influencerNiche, 'Food');
  assert.equal(contact.location, 'Muscat');
  assert.equal(contact.email, 'hello@muscateats.om', 'bio contacts are staff-only, like the record');
  const [ig] = contact.influencerAccounts;
  assert.equal(ig.platform, 'Instagram');
  assert.equal(ig.handle, 'muscat.eats');
  assert.equal(ig.followers, 248000);
  assert.ok(ig.syncedAt);

  const linked = ctx.store.discover.get(profile.id);
  assert.equal(linked.isRoster, true);
  assert.equal(linked.contactId, contact.id);
  assert.equal(ctx.store.discover.countActive(ctx.company.id), before - 1, 'roster entries do not use the 200');

  const again = await request(ctx.server).post(`/discover-profiles/${profile.id}/add-to-roster`).set(ctx.admin);
  assert.equal(again.status, 409, 'already on the roster');
});

test('add to roster is refused when an influencer already has the handle, and needs the directory rule', async () => {
  const ctx = build({ portal: true });
  await seedDirectory(ctx, ['salalah.travels']);
  const profile = ctx.store.discover.byUsername(ctx.company.id, 'salalah.travels');
  assert.equal((await request(ctx.server).post(`/discover-profiles/${profile.id}/add-to-roster`).set(ctx.employee)).status, 403);
  ctx.store.discover.update(profile.id, { status: 'removed' });
  const owner = influencer(ctx, 'Travel Guy', [['Instagram', 'Salalah.Travels']]);
  const res = await request(ctx.server).post(`/discover-profiles/${profile.id}/add-to-roster`).set(ctx.admin);
  assert.equal(res.status, 409);
  assert.deepEqual(res.body.duplicateOf, { id: owner.id, name: 'Travel Guy' });
  assert.equal(ctx.store.listContacts(ctx.company.id, 'Influencer').length, 1);
});

test('giving a contact the Influencer role is refused when another influencer has its handle', async () => {
  const ctx = build();
  const ahmed = influencer(ctx, 'Ahmed', [['Instagram', 'ahmed.om']]);
  const shop = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Person', name: 'Shop', roles: ['Client'], influencerAccounts: [{ id: 's', platform: 'Instagram', handle: 'ahmed.om' }] });
  const res = await request(ctx.server).post(`/contacts/${shop.id}/roles`).set(ctx.admin).send({ role: 'Influencer' });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.deepEqual(res.body.duplicateOf, { id: ahmed.id, name: 'Ahmed' });
  assert.deepEqual(ctx.store.getContactById(shop.id).roles, ['Client']);
});

test('quick add refuses text too long to read whole, instead of cutting a link', async () => {
  const ctx = build();
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: `@a.b${' '.repeat(20_000)}` });
  assert.equal(res.status, 400);
  assert.equal(ctx.store.listContacts(ctx.company.id, 'Influencer').length, 0);
});

test('adding one by one fetches the Instagram profile too, not only paste links', async () => {
  const ctx = build({ portal: true });
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts`).set(ctx.admin).send({
    name: '@muscat.eats', kind: 'Person', roles: ['Influencer'],
    influencerPlatform: 'Instagram', influencerHandle: '@muscat.eats',
    influencerAccounts: [{ platform: 'Instagram', handle: '@muscat.eats' }],
  });
  assert.equal(res.status, 201, res.text);
  await waitForRuns(ctx);
  const contact = ctx.store.getContactById(res.body.id);
  assert.equal(contact.influencerAccounts[0].followers, 248000);
  assert.equal(contact.name, 'Muscat Eats');
});

test('a new influencer is fetched straight away even while a long run is going', async () => {
  const ctx = build({ portal: true });
  // A run already in progress (the weekly refresh of everyone).
  const busy = ctx.store.discover.startRun(ctx.company.id, 'refresh');
  const res = await request(ctx.server).post(`/companies/${ctx.company.id}/influencers/quick-add`).set(ctx.admin).send({ text: '@salalah.travels' });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.fetching, true, 'the new one does not wait for the long run');
  for (let i = 0; i < 100; i++) {
    if (ctx.store.getContactById(res.body.results[0].contact.id).influencerAccounts[0].followers) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(ctx.store.getContactById(res.body.results[0].contact.id).influencerAccounts[0].followers, 96500);
  ctx.store.discover.finishRun(busy.id, 'done', 0, 'test');
});

test('adding an Instagram account to an influencer in an edit fetches it', async () => {
  const ctx = build({ portal: true });
  const c = influencer(ctx, 'Travels', [['TikTok', 'travels_tt']]);
  const res = await request(ctx.server).put(`/contacts/${c.id}`).set(ctx.admin).send({
    influencerAccounts: [...c.influencerAccounts, { platform: 'Instagram', handle: 'salalah.travels' }],
  });
  assert.equal(res.status, 200, res.text);
  await waitForRuns(ctx);
  const ig = ctx.store.getContactById(c.id).influencerAccounts.find((a) => a.platform === 'Instagram');
  assert.equal(ig.followers, 96500);
});
