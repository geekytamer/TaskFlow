import assert from 'node:assert/strict';
import test from 'node:test';
import { canEdit, groupByDay } from './compose';

const created = '2026-10-14T10:00:00.000Z';
const msg = (editableUntil: string | null) => ({ editableUntil });

test('canEdit is true until editableUntil and false after or when absent', () => {
  const until = '2026-10-14T10:15:00.000Z';
  assert.equal(canEdit(msg(until), new Date('2026-10-14T10:14:59.000Z')), true);
  assert.equal(canEdit(msg(until), new Date('2026-10-14T10:15:01.000Z')), false);
  assert.equal(canEdit(msg(null), new Date(created)), false);
});

test('groupByDay splits across midnight in the given time zone', () => {
  // 23:30 and 00:30 in Muscat (UTC+4) are 19:30Z and 20:30Z: same UTC day, different Muscat days.
  const a = { id: 'a', createdAt: '2026-10-14T19:30:00.000Z' };
  const b = { id: 'b', createdAt: '2026-10-14T20:30:00.000Z' };
  const c = { id: 'c', createdAt: '2026-10-15T00:30:00.000Z' };
  const muscat = groupByDay([a, b, c], 'en', 'Asia/Muscat');
  assert.deepEqual(muscat.map((g) => g.items.map((m) => m.id)), [['a'], ['b', 'c']]);
  const utc = groupByDay([a, b, c], 'en', 'UTC');
  assert.deepEqual(utc.map((g) => g.items.map((m) => m.id)), [['a', 'b'], ['c']]);
  assert.ok(muscat[0].label.length > 0);
});
