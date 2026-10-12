import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverQuery, growthLabel } from './discover';

test('the backend query keeps known filters only, drops empty ones and trims', () => {
  assert.equal(discoverQuery({ q: ' food ', tier: 'micro', peak: '', evil: 'x', sort: ['growth', 'followers'] }), '?q=food&tier=micro&sort=growth');
  assert.equal(discoverQuery({}), '');
});

test('growth shows a sign and one decimal; no history means no label', () => {
  assert.equal(growthLabel(4.25), '+4.3%');
  assert.equal(growthLabel(-1), '-1%');
  assert.equal(growthLabel(0), '0%');
  assert.equal(growthLabel(null), null);
});
