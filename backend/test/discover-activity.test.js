const test = require('node:test');
const assert = require('node:assert/strict');
const { postsPerMonth } = require('../dist/discover/discover');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(Date.UTC(2026, 9, 20));
const at = (daysAgo) => new Date(now.getTime() - daysAgo * DAY).toISOString();

test('posts per month from the oldest snapshot in the last month to the latest', () => {
  const snaps = [{ posts: 100, takenAt: at(28) }, { posts: 104, takenAt: at(21) }, { posts: 114, takenAt: at(0) }];
  assert.deepEqual(postsPerMonth(snaps, now), { perMonth: 15, days: 28 }, '14 posts over 28 days is 15 a month');
});

test('snapshots older than the month window are ignored', () => {
  const snaps = [{ posts: 0, takenAt: at(90) }, { posts: 200, takenAt: at(30) }, { posts: 206, takenAt: at(0) }];
  assert.deepEqual(postsPerMonth(snaps, now), { perMonth: 6, days: 30 });
});

test('fewer than six days of history, or one snapshot, is not enough to measure', () => {
  assert.equal(postsPerMonth([{ posts: 10, takenAt: at(0) }], now), null);
  assert.equal(postsPerMonth([{ posts: 10, takenAt: at(3) }, { posts: 12, takenAt: at(0) }], now), null);
});

test('deleted posts never make the rate negative; missing counts are skipped', () => {
  assert.deepEqual(postsPerMonth([{ posts: 50, takenAt: at(14) }, { posts: 40, takenAt: at(0) }], now), { perMonth: 0, days: 14 });
  assert.deepEqual(postsPerMonth([{ posts: null, takenAt: at(20) }, { posts: 10, takenAt: at(7) }, { posts: 17, takenAt: at(0) }], now), { perMonth: 30, days: 7 });
});
