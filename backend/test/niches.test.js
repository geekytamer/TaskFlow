const test = require('node:test');
const assert = require('node:assert/strict');
const { splitNiches, normalizeNiches } = require('../dist/niches');

test('splitNiches splits on every separator people type', () => {
  assert.deepEqual(splitNiches('Food, Lifestyle'), ['Food', 'Lifestyle']);
  assert.deepEqual(splitNiches('Food، سفر'), ['Food', 'سفر'], 'Arabic comma');
  assert.deepEqual(splitNiches('a;b/c|d\ne\r\nf'), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('splitNiches trims, drops empties and de-duplicates case-insensitively keeping the first spelling', () => {
  assert.deepEqual(splitNiches(' food ,Food;  travel'), ['food', 'travel']);
  assert.deepEqual(splitNiches(' , ;; '), []);
  assert.deepEqual(splitNiches('Beauty'), ['Beauty']);
});

test('splitNiches accepts nothing', () => {
  assert.deepEqual(splitNiches(null), []);
  assert.deepEqual(splitNiches(undefined), []);
  assert.deepEqual(splitNiches(''), []);
});

test('normalizeNiches stores one canonical string, null when empty, and passes undefined through', () => {
  assert.equal(normalizeNiches(' food ,Food;  travel'), 'food, travel');
  assert.equal(normalizeNiches(' ; '), null);
  assert.equal(normalizeNiches(null), null);
  assert.equal(normalizeNiches(undefined), undefined);
});
