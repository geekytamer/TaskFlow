const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DataStore } = require('../dist/data/store');
const { FixtureScraper } = require('../dist/discover/apify');
const { refreshDue, discoverNew, discoverTick } = require('../dist/discover/jobs');
const { makeTmpDir } = require('./helpers/tmp');

const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-discover-'), 'taskflow.db'), seedOnEmpty: true });
  return { store, scraper: new FixtureScraper(), companyId: '1' };
};

test('discovery keeps only Omani public accounts over the threshold, as candidates with photos and staff-only contacts', async () => {
  const { store, scraper, companyId } = setup();
  store.discover.setSettings(companyId, { hashtags: ['muscat'], minFollowers: 60_000, perHashtag: 50 });
  const run = await discoverNew(store, scraper, companyId, { monthlyCap: 1800 });
  assert.equal(run.status, 'done', run.message);
  const candidates = store.discover.list(companyId, 'candidate').map((p) => p.username).sort();
  // nizwa.cars is under 60k; dubai.lifestyle is not Omani.
  assert.deepEqual(candidates, ['muscat.eats', 'omani.fashion', 'salalah.travels']);
  const eats = store.discover.byUsername(companyId, 'muscat.eats');
  assert.equal(eats.hasPhoto, true);
  assert.deepEqual(eats.emails, ['hello@muscateats.om']);
  assert.equal(eats.location, 'Muscat');
  assert.ok(eats.engagementRate > 0);
  assert.ok(run.results > 0, 'billed results are counted');
});

test('discovery never re-suggests a removed or rejected account', async () => {
  const { store, scraper, companyId } = setup();
  store.discover.setSettings(companyId, { hashtags: ['muscat'], minFollowers: 10_000, perHashtag: 50 });
  store.discover.addHandles(companyId, ['muscat.eats'], 'removed');
  await discoverNew(store, scraper, companyId, { monthlyCap: 1800 });
  assert.equal(store.discover.byUsername(companyId, 'muscat.eats').status, 'removed');
});

test('refresh fetches profiles older than a week, records a snapshot and marks missing accounts', async () => {
  const { store, scraper, companyId } = setup();
  store.discover.addHandles(companyId, ['salalah.travels', 'gone.account']);
  const run = await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });
  assert.equal(run.status, 'done');
  const p = store.discover.byUsername(companyId, 'salalah.travels');
  assert.equal(p.followers, 96_500);
  assert.equal(store.discover.snapshots(p.id).length, 1);
  assert.match(store.discover.byUsername(companyId, 'gone.account').fetchError, /not found/i);
  assert.equal(await refreshDue(store, scraper, companyId, { monthlyCap: 1800 }), null, 'nothing due a day later');
});

test('a run that would pass the monthly budget is refused before Apify is called', async () => {
  const { store, scraper, companyId } = setup();
  store.discover.addHandles(companyId, ['salalah.travels', 'muscat.eats', 'nizwa.cars']);
  const run = await refreshDue(store, scraper, companyId, { monthlyCap: 2 });
  assert.equal(run.status, 'refused');
  assert.match(run.message, /budget/i);
  assert.equal(scraper.calls.length, 0);
});

test('the daily tick refreshes what is due and discovers once a month, never two runs at once', async () => {
  const { store, scraper, companyId } = setup();
  store.discover.setSettings(companyId, { hashtags: ['muscat'], minFollowers: 10_000, perHashtag: 50 });
  const first = await discoverTick(store, scraper, companyId, { monthlyCap: 1800 });
  assert.deepEqual(first.map((r) => r.kind), ['discovery']);
  const second = await discoverTick(store, scraper, companyId, { monthlyCap: 1800 });
  assert.deepEqual(second, [], 'discovery is monthly and the new candidates were just fetched');
});

const influencer = (store, name, accounts, extra = {}) => store.createContact({
  companyId: '1', kind: 'Person', name, roles: ['Influencer'], influencerAccounts: accounts, ...extra,
});

test('roster influencers with an Instagram handle join the directory, outside the 200, and their figures flow back', async () => {
  const { store, scraper, companyId } = setup();
  const lina = influencer(store, 'Lina', [
    { id: 'a1', platform: 'Instagram', handle: '@Salalah.Travels', followers: 50_000, engagementRate: 1 },
    { id: 'a2', platform: 'TikTok', handle: '@lina', followers: 9_000 },
  ]);
  const legacy = influencer(store, 'Omar', [], { influencerPlatform: 'Instagram', influencerHandle: 'https://instagram.com/nizwa.cars', followerCount: 1 });
  influencer(store, 'No Instagram', [{ id: 'b1', platform: 'TikTok', handle: '@x' }]);

  await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });

  const p = store.discover.byUsername(companyId, 'salalah.travels');
  assert.equal(p.contactId, lina.id);
  assert.equal(p.isRoster, true);
  assert.equal(p.status, 'listed');
  assert.equal(store.discover.countActive(companyId), 0, 'roster profiles do not use the 200');

  const after = store.getContactById(lina.id);
  const ig = after.influencerAccounts.find((a) => a.platform === 'Instagram');
  assert.equal(ig.followers, 96_500, 'followers written back');
  assert.ok(ig.engagementRate > 1, 'engagement written back');
  assert.ok(ig.syncedAt, 'marked as synced');
  assert.equal(after.influencerAccounts.find((a) => a.platform === 'TikTok').followers, 9_000, 'other platforms untouched');
  assert.equal(store.getContactById(legacy.id).followerCount, 54_300, 'single-platform records update too');
});

test('a changed handle on the record moves the link; a former influencer is unlinked', async () => {
  const { store, scraper, companyId } = setup();
  const lina = influencer(store, 'Lina', [{ id: 'a1', platform: 'Instagram', handle: 'salalah.travels' }]);
  await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });
  store.updateContact(lina.id, { influencerAccounts: [{ id: 'a1', platform: 'Instagram', handle: 'muscat.eats' }] });
  await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });
  assert.equal(store.discover.byUsername(companyId, 'muscat.eats').contactId, lina.id);
  const old = store.discover.byUsername(companyId, 'salalah.travels');
  assert.equal(old.contactId, null);
  assert.equal(old.isRoster, false);
});

test('an account already in the directory writes its figures back as soon as it joins the roster', async () => {
  const { store, scraper, companyId } = setup();
  store.discover.addHandles(companyId, ['nizwa.cars']);
  await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });
  const omar = influencer(store, 'Omar', [{ id: 'a1', platform: 'Instagram', handle: 'nizwa.cars', followers: 1 }]);
  assert.equal(await refreshDue(store, scraper, companyId, { monthlyCap: 1800 }), null, 'nothing due to fetch');
  const ig = store.getContactById(omar.id).influencerAccounts[0];
  assert.equal(ig.followers, 54_300);
  assert.ok(ig.syncedAt);
  const stamp = String(store.getContactById(omar.id).updatedAt);
  await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });
  assert.equal(String(store.getContactById(omar.id).updatedAt), stamp, 'no rewrite when nothing changed');
});

test('an influencer with a working Instagram connection is never scraped; a broken connection falls back to scraping', async () => {
  const { store, scraper, companyId } = setup();
  const lina = influencer(store, 'Lina', [{ id: 'a1', platform: 'Instagram', handle: 'salalah.travels', followers: 1 }]);
  const account = store.social.upsertAccount({ companyId, contactId: lina.id, externalId: 'ext-lina', username: 'salalah.travels', accountType: 'MEDIA_CREATOR', tokenSealed: 'v1:x', expiresAt: null });
  // Older than a week, so only the exclusion keeps it from being scraped.
  store.social.addSnapshot({ accountId: account.id, takenOn: new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10), followers: 97_000, views: 0, reach: 0, engagedAccounts: 0, demographics: null });

  await refreshDue(store, scraper, companyId, { monthlyCap: 1800 });
  const asked = () => scraper.calls.flatMap((c) => c.usernames ?? []);
  assert.equal(asked().includes('salalah.travels'), false, 'connected account not sent to Apify');
  const p = store.discover.byUsername(companyId, 'salalah.travels');
  assert.equal(p.isRoster, true, 'still in the directory');
  assert.equal(p.followers, 97_000, 'directory figures come from the connection');
  assert.equal(store.getContactById(lina.id).influencerAccounts[0].followers, 1, 'record not overwritten by scraping');

  store.social.updateAccount(account.id, { status: 'needs_reconnect' });
  await refreshDue(store, scraper, companyId, { monthlyCap: 1800, now: new Date(Date.now() + 8 * 86400_000) });
  assert.ok(asked().includes('salalah.travels'), 'sent to Apify once the connection broke');
  assert.equal(store.getContactById(lina.id).influencerAccounts[0].followers, 96_500, 'scraped figures reach the record');
});
