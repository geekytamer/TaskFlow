import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueQuery, formatCompact, formatDate, formatDateTime, formatFileSize, formatMoney, formatPercent } from './format';

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

test('a reviewed deliverable shows the client’s own answer, otherwise its status', async () => {
  const { deliverableView } = await import('./campaigns');
  assert.equal(deliverableView({ status: 'ready_for_review', review: null }), 'ready_for_review');
  assert.equal(deliverableView({ status: 'ready_for_review', review: { decision: 'approved' } }), 'you_approved');
  assert.equal(deliverableView({ status: 'ready_for_review', review: { decision: 'changes_requested' } }), 'changes_requested');
  assert.equal(deliverableView({ status: 'published', review: { decision: 'approved' } }), 'published', 'staff progress wins once it moves on');
});

test('lists are separated with the comma of the page language', async () => {
  const { listSep } = await import('./format');
  assert.equal(['a', 'b'].join(listSep('en')), 'a, b');
  assert.equal(['أ', 'ب'].join(listSep('ar')), 'أ، ب');
});

test('times are shown in the business zone, and file sizes read naturally', () => {
  // 20:30 UTC is 00:30 the next day in Muscat.
  assert.match(formatDateTime('2026-09-30T20:30:00Z', 'en'), /Oct 1, 2026.*12:30/);
  assert.equal(formatDateTime(null, 'en'), '-');
  assert.equal(formatFileSize(512, 'en'), '512 B');
  assert.equal(formatFileSize(1536, 'en'), '1.5 KB');
  assert.equal(formatFileSize(10 * 1024 * 1024, 'en'), '10 MB');
  assert.match(formatFileSize(1536, 'ar'), /1\.5/);
});
