const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-influencer-csv-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const admin = store.createUser({ name: 'Admin', email: 'admin@peak.test', password: 'x', role: 'Admin', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Admin' }] });
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy', discoverScraper: null }).listen(0);
  server.unref();
  const auth = { Authorization: `Bearer ${store.issueToken(admin.id)}` };
  const importRows = (rows) => request(server).post(`/companies/${company.id}/influencers/import`).set(auth).send({ rows });
  const influencers = () => store.listContacts(company.id, 'Influencer');
  return { store, company, server, auth, importRows, influencers };
};

const accountsOf = (c) => (c.influencerAccounts ?? []).map((a) => `${a.platform}:${a.handle}:${a.followers ?? ''}`).sort();

test('a row with several platforms creates one influencer with an account each', async () => {
  const ctx = build();
  const res = await ctx.importRows([{
    name: 'Sara', email: 'sara@x.test', instagram: 'https://www.instagram.com/sara.om/', instagramFollowers: '120000',
    tiktok: '@sara.tt', tiktokFollowers: '45000', snapchat: 'sara_snap', niche: 'Beauty', rateCard: '300',
  }]);
  assert.deepEqual({ created: res.body.created, updated: res.body.updated, failed: res.body.failed }, { created: 1, updated: 0, failed: 0 }, JSON.stringify(res.body));
  const [sara] = ctx.influencers();
  assert.deepEqual(accountsOf(sara), ['Instagram:sara.om:120000', 'Snapchat:sara_snap:', 'TikTok:sara.tt:45000']);
  assert.equal(sara.influencerPlatform, 'Instagram');
  assert.equal(sara.influencerHandle, 'sara.om');
  assert.equal(sara.rateCardAmount, 300);
});

test('importing again updates by handle: empty cells keep values, new platforms are added', async () => {
  const ctx = build();
  await ctx.importRows([{ name: 'Sara', instagram: 'sara.om', instagramFollowers: '120000', niche: 'Beauty', location: 'Muscat' }]);
  const res = await ctx.importRows([{ name: '', instagram: '@SARA.OM', instagramFollowers: '125000', tiktok: 'sara.tt', location: '' }]);
  assert.deepEqual({ created: res.body.created, updated: res.body.updated, failed: res.body.failed }, { created: 0, updated: 1, failed: 0 }, JSON.stringify(res.body));
  const all = ctx.influencers();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Sara');
  assert.equal(all[0].location, 'Muscat');
  assert.equal(all[0].influencerNiche, 'Beauty');
  assert.deepEqual(accountsOf(all[0]), ['Instagram:sara.om:125000', 'TikTok:sara.tt:']);
});

test('a row with no known handle matches by email', async () => {
  const ctx = build();
  await ctx.importRows([{ name: 'Sara', email: 'Sara@X.test' }]);
  const res = await ctx.importRows([{ name: 'Sara A.', email: 'sara@x.test', youtube: 'https://youtube.com/@SaraTube' }]);
  assert.equal(res.body.updated, 1, JSON.stringify(res.body));
  const [sara] = ctx.influencers();
  assert.equal(sara.name, 'Sara A.');
  assert.deepEqual(accountsOf(sara), ['YouTube:saratube:']);
});

test('a row whose handles belong to two influencers fails and names both', async () => {
  const ctx = build();
  await ctx.importRows([{ name: 'Ahmed', instagram: 'ahmed.om' }, { name: 'Sara', tiktok: 'sara.tt' }]);
  const res = await ctx.importRows([{ name: 'Mixed', instagram: 'ahmed.om', tiktok: 'sara.tt' }]);
  assert.equal(res.body.failed, 1);
  assert.match(res.body.errors[0].error, /Ahmed/);
  assert.match(res.body.errors[0].error, /Sara/);
  assert.equal(ctx.influencers().length, 2);
});

test('a handle repeated in one file updates the record the earlier row created', async () => {
  const ctx = build();
  const res = await ctx.importRows([{ name: 'Sara', instagram: 'sara.om' }, { name: 'Sara', instagram: 'sara.om', tiktok: 'sara.tt' }]);
  assert.deepEqual({ created: res.body.created, updated: res.body.updated }, { created: 1, updated: 1 });
  assert.equal(ctx.influencers().length, 1);
});

test('old files with platform, handle and followers still import, and match on re-import', async () => {
  const ctx = build();
  const old = [{ name: 'Jane', platform: 'Instagram', handle: '@janedoe', followers: '50000', engagementRate: '3.5', languages: 'English; Arabic' }];
  assert.equal((await ctx.importRows(old)).body.created, 1);
  const again = await ctx.importRows(old);
  assert.equal(again.body.updated, 1, JSON.stringify(again.body));
  const [jane] = ctx.influencers();
  assert.equal(jane.influencerPlatform, 'Instagram');
  assert.equal(jane.followerCount, 50000);
  assert.deepEqual(jane.languages, ['English', 'Arabic']);
});

test('a new row needs a name', async () => {
  const ctx = build();
  const res = await ctx.importRows([{ instagram: 'nobody.om' }]);
  assert.equal(res.body.failed, 1);
  assert.match(res.body.errors[0].error, /name/i);
});

test('export writes a column per platform, so export then import changes nothing', async () => {
  const ctx = build();
  await ctx.importRows([{ name: 'Sara', instagram: 'sara.om', instagramFollowers: '120000', tiktok: 'sara.tt', tiktokFollowers: '45000' }]);
  const csv = await request(ctx.server).get(`/companies/${ctx.company.id}/influencers/export`).set(ctx.auth);
  const [header, row] = csv.text.trim().split('\n');
  for (const col of ['instagram', 'instagramFollowers', 'tiktok', 'tiktokFollowers', 'snapchat', 'youtube', 'x', 'facebook']) assert.ok(header.split(',').includes(col), col);
  assert.match(row, /sara\.om/);
  assert.match(row, /45000/);
  const cols = header.split(',');
  const values = row.split(',');
  const parsed = Object.fromEntries(cols.map((c, i) => [c, values[i] ?? '']));
  const res = await ctx.importRows([parsed]);
  assert.equal(res.body.updated, 1, JSON.stringify(res.body));
  assert.equal(ctx.influencers().length, 1);
  assert.deepEqual(accountsOf(ctx.influencers()[0]), ['Instagram:sara.om:120000', 'TikTok:sara.tt:45000']);
});
