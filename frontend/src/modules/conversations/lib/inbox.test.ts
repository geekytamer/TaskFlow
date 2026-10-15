import assert from 'node:assert/strict';
import test from 'node:test';
import { INBOX_PERMISSION, nextWeekAt8, tomorrowAt8, waitingCount } from './inbox';
import { navPermission } from '@/modules/layout/lib/nav-permissions';
import { moduleForPath } from '@/modules/companies/lib/company-modules';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

test('tomorrow is 08:00 local the next calendar day, even late at night', () => {
  assert.deepEqual(tomorrowAt8(at(2026, 10, 14, 10, 30)), at(2026, 10, 15, 8));
  assert.deepEqual(tomorrowAt8(at(2026, 10, 14, 23, 59)), at(2026, 10, 15, 8));
  assert.deepEqual(tomorrowAt8(at(2026, 10, 31, 9)), at(2026, 11, 1, 8));
});

test('next week is the next Sunday 08:00, strictly after now', () => {
  // 2026-10-14 is a Wednesday; next Sunday is the 18th.
  assert.deepEqual(nextWeekAt8(at(2026, 10, 14, 10)), at(2026, 10, 18, 8));
  // Thursday and Friday/Saturday roll to the coming Sunday.
  assert.deepEqual(nextWeekAt8(at(2026, 10, 15, 9)), at(2026, 10, 18, 8));
  assert.deepEqual(nextWeekAt8(at(2026, 10, 17, 9)), at(2026, 10, 18, 8));
  // Sunday before 08:00 still means the following Sunday, never today.
  assert.deepEqual(nextWeekAt8(at(2026, 10, 18, 7)), at(2026, 10, 25, 8));
  assert.deepEqual(nextWeekAt8(at(2026, 10, 18, 12)), at(2026, 10, 25, 8));
});

test('waiting count is mine plus unassigned and never negative or NaN', () => {
  assert.equal(waitingCount({ mine: 3, unassigned: 4, all: 20 }), 7);
  assert.equal(waitingCount(null), 0);
  assert.equal(waitingCount({ mine: -2, unassigned: 1, all: 1 }), 1);
});

test('the inbox needs contacts:read in the nav, the sidebar badge and the page guard', () => {
  assert.equal(INBOX_PERMISSION, 'contacts:read');
  assert.equal(navPermission('/inbox'), INBOX_PERMISSION);
  // A company with contacts switched off hides the inbox too.
  assert.equal(moduleForPath('/inbox'), 'contacts');
});
