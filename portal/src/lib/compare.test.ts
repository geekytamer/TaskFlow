import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRows, costPerThousand, readCompareIds, winsBy } from './compare';
import type { CatalogueEntry } from './catalogue';

const e = (over: Partial<CatalogueEntry>): CatalogueEntry => ({
  id: 'x', name: 'x', niche: null, location: null, languages: [], availability: null, platforms: [],
  price: { kind: 'on_request' }, photoAt: null, bio: null, gender: null,
  followers: 0, engagementRate: null, growth3m: null, tier: 'micro', activity: null, ...over,
});

const sara = e({ id: 's', followers: 184_000, engagementRate: 4.6, growth3m: 8, activity: { perMonth: 24, days: 30 }, price: { kind: 'range', min: 504, max: 936, currency: 'OMR' } });
const noor = e({ id: 'n', followers: 312_000, engagementRate: 5.1, growth3m: 3, activity: { perMonth: 13, days: 30 }, price: { kind: 'range', min: 924, max: 1716, currency: 'OMR' } });

test('higher wins for reach, activity, growth and engagement; lower wins for price and cost', () => {
  const rows = Object.fromEntries(compareRows([sara, noor]).map((r) => [r.key, r.best]));
  assert.deepEqual(rows, { followers: [1], activity: [0], growth: [0], engagement: [1], price: [0], costPerK: [0] });
});

test('a missing figure never wins, and a row needs two figures to mark anyone', () => {
  const onRequest = e({ id: 'o', followers: 900_000 });
  const rows = Object.fromEntries(compareRows([sara, onRequest]).map((r) => [r.key, r.best]));
  assert.deepEqual(rows.price, []);
  assert.deepEqual(rows.followers, [1]);
});

test('all equal marks no one; a tie for best marks both', () => {
  const a = e({ id: 'a', followers: 100 });
  const b = e({ id: 'b', followers: 100 });
  const c = e({ id: 'c', followers: 50 });
  assert.deepEqual(compareRows([a, b]).find((r) => r.key === 'followers')!.best, []);
  assert.deepEqual(compareRows([a, b, c]).find((r) => r.key === 'followers')!.best, [0, 1]);
});

test('wins are counted per creator', () => {
  assert.deepEqual(winsBy(compareRows([sara, noor]), 2), [4, 2]);
});

test('cost per thousand uses the middle of the range', () => {
  assert.equal(costPerThousand(sara), 3.9);
  assert.equal(costPerThousand(e({})), null);
});

test('ids from the URL: known only, no repeats, three at most, comma lists allowed', () => {
  const known = new Set(['a', 'b', 'c', 'd']);
  assert.deepEqual(readCompareIds(['a', 'z', 'a', 'b,c', 'd'], known), ['a', 'b', 'c']);
  assert.deepEqual(readCompareIds(undefined, known), []);
});
