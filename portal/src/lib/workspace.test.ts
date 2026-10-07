import assert from 'node:assert/strict';
import test from 'node:test';
import { dictionaries } from './i18n';
import { DEAL_STATUSES, CONTACT_KINDS, contactKindKey, dealSort, dealStatusKey, type DealSummary } from './workspace-types';

const deal = (over: Partial<DealSummary>): DealSummary => ({
  id: 'x', source: 'own', title: 'x', amount: null, currency: 'OMR', status: 'confirmed', startDate: null, endDate: null,
  notes: null, brand: null, nextDue: null, updatedAt: '2026-10-01T00:00:00.000Z', ...over,
});

test('offers waiting for an answer come first, then live work by the soonest due date, then closed deals', () => {
  const sorted = dealSort([
    deal({ id: 'paid', status: 'paid' }),
    deal({ id: 'later', nextDue: { title: 'a', dueDate: '2026-11-20' } }),
    deal({ id: 'offer', source: 'peak', status: 'lead' }),
    deal({ id: 'soon', nextDue: { title: 'b', dueDate: '2026-11-02' } }),
    deal({ id: 'cancelled', status: 'cancelled' }),
    deal({ id: 'nodue', status: 'delivered' }),
  ]);
  assert.deepEqual(sorted.map((d) => d.id), ['offer', 'soon', 'later', 'nodue', 'paid', 'cancelled']);
});

test('an own lead is not a Peak offer: it sorts with live work', () => {
  const sorted = dealSort([deal({ id: 'own-lead', status: 'lead' }), deal({ id: 'offer', source: 'peak', status: 'lead' })]);
  assert.deepEqual(sorted.map((d) => d.id), ['offer', 'own-lead']);
});

test('every deal status and contact kind has a label in both languages', () => {
  for (const lang of ['en', 'ar'] as const) {
    for (const s of DEAL_STATUSES) assert.ok(dictionaries[lang][dealStatusKey(s)], `${lang} ${s}`);
    for (const k of CONTACT_KINDS) assert.ok(dictionaries[lang][contactKindKey(k)], `${lang} ${k}`);
  }
});
