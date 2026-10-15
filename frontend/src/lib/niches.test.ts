import assert from 'node:assert/strict';
import test from 'node:test';
import { hasNiche, nicheOptions, splitNiches } from './niches';

test('splitNiches matches the backend: every separator, trimmed, de-duplicated ignoring case', () => {
  assert.deepEqual(splitNiches('Food, Lifestyle'), ['Food', 'Lifestyle']);
  assert.deepEqual(splitNiches('Food، سفر'), ['Food', 'سفر']);
  assert.deepEqual(splitNiches('a;b/c|d\ne'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(splitNiches(' food ,Food;  travel'), ['food', 'travel']);
  assert.deepEqual(splitNiches(' , '), []);
  assert.deepEqual(splitNiches(null), []);
  assert.deepEqual(splitNiches(undefined), []);
});

test('a niche filter matches any of the niches, ignoring case', () => {
  assert.equal(hasNiche('Food, Lifestyle', 'lifestyle'), true);
  assert.equal(hasNiche('Food, Lifestyle', 'Food, Lifestyle'), false);
  assert.equal(hasNiche(undefined, 'Food'), false);
});

test('nicheOptions lists single niches across the roster', () => {
  assert.deepEqual(nicheOptions(['Food, Lifestyle', 'food', undefined, 'Beauty']), ['Beauty', 'Food', 'Lifestyle']);
});
