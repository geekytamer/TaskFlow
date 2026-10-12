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
