import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueQuery, formatCompact, formatDate, formatMoney, formatPercent } from './format';

test('follower counts are compact, and Arabic keeps Latin digits', () => {
  assert.equal(formatCompact(184000, 'en'), '184K');
  assert.equal(formatCompact(1250000, 'en'), '1.3M');
  assert.match(formatCompact(184000, 'ar'), /184/);
  assert.equal(formatCompact(null, 'en'), '-');
});

test('engagement is a percentage with at most one decimal', () => {
  assert.equal(formatPercent(4.25, 'en'), '4.3%');
  assert.equal(formatPercent(6, 'en'), '6%');
  assert.equal(formatPercent(null, 'en'), '-');
});

test('money uses the currency, whole units, and survives an unknown code', () => {
  assert.match(formatMoney(1250, 'OMR', 'en'), /OMR\s?1,250/);
  assert.match(formatMoney(1250, 'OMR', 'ar'), /1,250|1٬250/);
  assert.equal(formatMoney(1250, 'NOT-A-CODE', 'en'), 'NOT-A-CODE 1250');
});

test('the catalogue query keeps only known, non-empty filters', () => {
  assert.equal(catalogueQuery({ q: ' lina ', platform: '', niche: 'Food', evil: 'x' }), '?q=lina&niche=Food');
  assert.equal(catalogueQuery({}), '');
  assert.equal(catalogueQuery({ q: 'a&b=c' }), '?q=a%26b%3Dc');
});

test('dates read naturally in both languages, keep Latin digits, and tolerate missing values', () => {
  assert.equal(formatDate('2026-11-01', 'en'), 'Nov 1, 2026');
  assert.match(formatDate('2026-11-01T10:00:00.000Z', 'ar'), /2026/);
  assert.equal(formatDate(null, 'en'), '-');
  assert.equal(formatDate('garbage', 'en'), '-');
});
