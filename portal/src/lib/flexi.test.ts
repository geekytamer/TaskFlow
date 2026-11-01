import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flexiCardState, type FlexiData } from './flexi';

const balance = (enabled: boolean, state: FlexiData['balance']['state'] = enabled ? 'active' : null): FlexiData['balance'] => ({ enabled, state, balance: enabled ? 850 : 0, used: 0, available: enabled && state !== 'frozen' ? 850 : 0, upfrontPct: 40, maxMonths: 6 });
const app = (kind: 'activation' | 'increase', status: 'new' | 'approved' | 'rejected' | 'withdrawn') => ({
  id: `${kind}-${status}`, kind, status, requestedAmount: null, approvedAmount: null, reviewNote: status === 'rejected' ? 'Unreadable copy' : null, createdAt: '2026-10-31T00:00:00Z', reviewedAt: null, files: [],
});
const terms = { version: 1, ar: 'شروط', en: 'Terms' };
const data = (enabled: boolean, open: ReturnType<typeof app> | null, last: ReturnType<typeof app> | null, state?: FlexiData['balance']['state']): FlexiData => ({ balance: balance(enabled, state), currency: 'OMR', open, last, terms, standardAmount: 850 });

test('no balance and nothing asked: offer activation', () => {
  assert.equal(flexiCardState(data(false, null, null)), 'none');
  assert.equal(flexiCardState(data(false, null, app('activation', 'withdrawn'))), 'none', 'a withdrawn request starts over');
});

test('an open activation is pending', () => {
  assert.equal(flexiCardState(data(false, app('activation', 'new'), app('activation', 'new'))), 'pending');
});

test('a rejected activation shows the reason', () => {
  assert.equal(flexiCardState(data(false, null, app('activation', 'rejected'))), 'rejected');
});

test('an enabled balance wins, even with an increase under review or rejected', () => {
  assert.equal(flexiCardState(data(true, null, app('activation', 'approved'))), 'enabled');
  assert.equal(flexiCardState(data(true, app('increase', 'new'), app('increase', 'new'))), 'enabled');
  assert.equal(flexiCardState(data(true, null, app('increase', 'rejected'))), 'enabled');
});

test('a frozen account shows the paused face, an active one the balance', () => {
  assert.equal(flexiCardState(data(true, null, app('activation', 'approved'), 'frozen')), 'frozen');
  assert.equal(flexiCardState(data(true, null, app('activation', 'approved'), 'active')), 'enabled');
});
