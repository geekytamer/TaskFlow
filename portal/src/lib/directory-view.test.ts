import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFilterCount, activityLevel, backendQuery, effectiveSort, refineDirectory, type DirectoryParams } from './directory-view';
import type { CatalogueEntry } from './catalogue';

const entry = (over: Partial<CatalogueEntry>): CatalogueEntry => ({
  id: over.name ?? 'x', name: 'x', niche: null, location: null, languages: [], availability: null,
  platforms: [], price: { kind: 'on_request' }, photoAt: null, bio: null, gender: null,
  followers: 0, engagementRate: null, growth3m: null, tier: 'nano', ...over,
});

const p = (over: DirectoryParams = {}) => over;

test('no search and at most one filter keeps the backend order (most followers)', () => {
  assert.equal(effectiveSort(p()), 'followers');
  assert.equal(effectiveSort(p({ platform: 'Instagram' })), 'followers');
});

test('a search or two filters default to most relevant; an explicit sort always wins', () => {
  assert.equal(effectiveSort(p({ q: 'sara' })), 'relevant');
  assert.equal(effectiveSort(p({ platform: 'Instagram', niche: 'Food' })), 'relevant');
  assert.equal(effectiveSort(p({ q: 'sara', sort: 'name' })), 'name');
});

test('the active count ignores search, sort and view', () => {
  assert.equal(activeFilterCount(p({ q: 'a', sort: 'name', platform: 'TikTok', minEngagement: '3' })), 2);
});

test('engagement and growth floors drop creators below them and those without a figure', () => {
  const items = [
    entry({ name: 'a', engagementRate: 4, growth3m: 12 }),
    entry({ name: 'b', engagementRate: 2, growth3m: 30 }),
    entry({ name: 'c', engagementRate: null, growth3m: null }),
  ];
  assert.deepEqual(refineDirectory(items, p({ minEngagement: '3' })).map((e) => e.name), ['a']);
  assert.deepEqual(refineDirectory(items, p({ minGrowth: '10' })).map((e) => e.name), ['a', 'b']);
});

test('most relevant puts exact and leading name matches first, then handles, then the rest', () => {
  const items = [
    entry({ name: 'Food with Sara', followers: 900 }),
    entry({ name: 'Mona', followers: 800, platforms: [{ platform: 'Instagram', handle: '@sara.eats', url: null, followers: 1, avgViews: null, engagementRate: null, verified: null }] }),
    entry({ name: 'Sara Ali', followers: 100 }),
    entry({ name: 'sara', followers: 50 }),
    entry({ name: 'Other', followers: 5000, bio: 'friend of sara' }),
  ];
  assert.deepEqual(refineDirectory(items, p({ q: 'Sara' })).map((e) => e.name), ['sara', 'Sara Ali', 'Mona', 'Food with Sara', 'Other']);
});

test('without a search, most relevant keeps the order it was given', () => {
  const items = [entry({ name: 'b', followers: 10 }), entry({ name: 'a', followers: 20 })];
  assert.deepEqual(refineDirectory(items, p({ platform: 'X', niche: 'Y' })).map((e) => e.name), ['b', 'a']);
});

test('a follower ceiling keeps creators at or under it', () => {
  const items = [entry({ name: 'a', followers: 50_000 }), entry({ name: 'b', followers: 500_000 })];
  assert.deepEqual(refineDirectory(items, p({ maxFollowers: '100000' })).map((e) => e.name), ['a']);
});

test('a campaign goal picks the order unless a sort is chosen; it is not a filter', () => {
  assert.equal(effectiveSort(p({ goal: 'sales' })), 'engagement');
  assert.equal(effectiveSort(p({ goal: 'launch', sort: 'price' })), 'price');
  assert.equal(activeFilterCount(p({ goal: 'awareness', platform: 'X' })), 1);
});

test('active only keeps about weekly posters; most active orders by posts a month, unmeasured last', () => {
  const items = [
    entry({ name: 'a', activity: { perMonth: 2, days: 30 } }),
    entry({ name: 'b', activity: { perMonth: 20, days: 30 } }),
    entry({ name: 'c', activity: null }),
    entry({ name: 'd', activity: { perMonth: 6, days: 30 } }),
  ];
  assert.deepEqual(refineDirectory(items, p({ active: '1' })).map((e) => e.name), ['b', 'd']);
  assert.deepEqual(refineDirectory(items, p({ sort: 'activity' })).map((e) => e.name), ['b', 'd', 'a', 'c']);
});

test('activity levels: very active, active, rarely only after two weeks, else measuring', () => {
  assert.equal(activityLevel({ perMonth: 16, days: 30 }), 'high');
  assert.equal(activityLevel({ perMonth: 4, days: 30 }), 'active');
  assert.equal(activityLevel({ perMonth: 1, days: 14 }), 'low');
  assert.equal(activityLevel({ perMonth: 1, days: 7 }), 'measuring');
  assert.equal(activityLevel(null), 'measuring');
});

test('portal-only orders are not sent to the backend', () => {
  assert.equal(backendQuery(p({ sort: 'activity', platform: 'TikTok' })), '?platform=TikTok');
  assert.equal(backendQuery(p({ goal: 'sales' })), '?sort=engagement');
});
