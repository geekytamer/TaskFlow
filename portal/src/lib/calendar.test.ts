import assert from 'node:assert/strict';
import test from 'node:test';
import { addMonths, groupByDay, monthGrid } from './calendar';

test('a month grid starts on the Sunday on or before the 1st and is whole weeks', () => {
  const nov = monthGrid('2026-11');
  assert.equal(nov[0][0], '2026-11-01', 'November 2026 starts on a Sunday');
  const oct = monthGrid('2026-10');
  assert.equal(oct[0][0], '2026-09-27', 'October 1st 2026 is a Thursday');
  assert.equal(oct.length, 5);
  assert.ok(oct.every((week) => week.length === 7));
  assert.equal(oct.at(-1)!.at(-1), '2026-10-31');
});

test('months step across years', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('items group by day in date order', () => {
  const groups = groupByDay([
    { dueDate: '2026-11-10', title: 'b' },
    { dueDate: '2026-11-05', title: 'a' },
    { dueDate: '2026-11-10', title: 'c' },
  ]);
  assert.deepEqual(groups.map((g) => [g.date, g.items.map((i) => i.title)]), [['2026-11-05', ['a']], ['2026-11-10', ['b', 'c']]]);
});
