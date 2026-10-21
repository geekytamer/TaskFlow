import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsOf, planPackages } from './planner';
import type { CatalogueEntry } from './catalogue';

const c = (name: string, max: number, followers: number, er: number | null = 3, availability: string | null = null): CatalogueEntry => ({
  id: name, name, niche: null, location: null, languages: [], availability, platforms: [],
  price: { kind: 'range', min: Math.round(max * 0.8), max, currency: 'OMR' }, photoAt: null, bio: null, gender: null,
  followers, engagementRate: er, growth3m: null, tier: 'micro',
});

const ids = (p: { items: CatalogueEntry[] }) => p.items.map((e) => e.id).sort();

test('every package fits the budget at the top of each price range, with exactly the count asked', () => {
  const items = [c('a', 500, 900_000, 1), c('b', 400, 300_000, 6), c('c', 300, 200_000, 5), c('d', 100, 20_000, 2), c('e', 150, 50_000, 8)];
  const plan = planPackages(items, { budget: 800, count: 2 });
  assert.equal(plan.status, 'ok');
  for (const p of plan.packages) {
    assert.equal(p.items.length, 2);
    assert.ok(p.costMax <= 800, `${p.kind} costs ${p.costMax}`);
  }
});

test('reach maximises followers, engagement maximises the average rate, value is the cheapest', () => {
  const items = [c('a', 500, 900_000, 1), c('b', 400, 300_000, 6), c('c', 300, 200_000, 5), c('d', 100, 20_000, 2), c('e', 150, 50_000, 8)];
  const plan = planPackages(items, { budget: 800, count: 2 });
  const by = Object.fromEntries(plan.packages.map((p) => [p.kind, p]));
  assert.deepEqual(ids(by.reach), ['a', 'c']);
  assert.deepEqual(ids(by.engagement), ['b', 'e']);
  assert.deepEqual(ids(by.value), ['d', 'e']);
});

test('unavailable creators and prices on request are left out; the count on request is reported', () => {
  const onRequest: CatalogueEntry = { ...c('x', 1, 5_000_000), price: { kind: 'on_request' } };
  const items = [c('a', 100, 10_000), c('b', 100, 9_000_000, 3, 'Unavailable'), onRequest, c('d', 100, 20_000)];
  const plan = planPackages(items, { budget: 1_000, count: 2 });
  assert.equal(plan.onRequest, 1);
  for (const p of plan.packages) assert.deepEqual(ids(p), ['a', 'd']);
});

test('a budget below the cheapest group says how much the count needs', () => {
  const plan = planPackages([c('a', 300, 1), c('b', 200, 1), c('c', 400, 1)], { budget: 400, count: 2 });
  assert.equal(plan.status, 'over-budget');
  assert.equal(plan.minBudget, 500);
});

test('asking for more creators than can be priced says how many there are', () => {
  const plan = planPackages([c('a', 100, 1), c('b', 100, 1)], { budget: 10_000, count: 3 });
  assert.equal(plan.status, 'too-few');
  assert.equal(plan.available, 2);
});

test('identical packages are shown once', () => {
  const plan = planPackages([c('a', 100, 1_000, 9), c('b', 100, 900, 8)], { budget: 200, count: 2 });
  assert.equal(plan.packages.length, 1);
});

test('group counts are exact when small and capped when huge', () => {
  assert.equal(groupsOf(5, 2), 10);
  assert.equal(groupsOf(3, 4), 0);
  assert.equal(groupsOf(200, 6), 1_000_000);
});
