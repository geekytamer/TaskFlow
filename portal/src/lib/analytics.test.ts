import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, rangeFrom } from './analytics';

test('range presets count back from today; all time has no start', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  assert.equal(rangeFrom('30d', now), '2026-09-05');
  assert.equal(rangeFrom('90d', now), '2026-07-07');
  assert.equal(rangeFrom('year', now), '2026-01-01');
  assert.equal(rangeFrom('all', now), null);
});

test('an unknown range falls back to 90 days', () => {
  assert.equal(parseRange('7y'), '90d');
  assert.equal(parseRange(undefined), '90d');
  assert.equal(parseRange('all'), 'all');
});
