import test from 'node:test';
import assert from 'node:assert/strict';
import { niceMax, stackedBars } from './chart';

test('niceMax rounds up to a readable axis top', () => {
  assert.equal(niceMax(0), 0);
  assert.equal(niceMax(7), 8);
  assert.equal(niceMax(43), 50);
  assert.equal(niceMax(1234), 1500);
});

test('stacked bars: segments stack bottom-up in key order, scaled to the axis top', () => {
  const geo = stackedBars([{ label: 'd1', a: 2, b: 2 }, { label: 'd2', a: 8, b: 0 }], ['a', 'b'], { width: 100, height: 80 });
  assert.equal(geo.max, 8);
  assert.deepEqual(geo.ticks, [0, 4, 8]);
  assert.equal(geo.bars.length, 2);
  const [first, second] = geo.bars;
  assert.equal(first.total, 4);
  assert.deepEqual(first.segments.map((s) => [s.key, s.value, s.height, s.y]), [['a', 2, 20, 60], ['b', 2, 20, 40]]);
  assert.deepEqual(second.segments.map((s) => [s.key, s.height, s.y]), [['a', 80, 0], ['b', 0, 0]]);
  assert.ok(second.x > first.x);
  assert.ok(first.width > 0 && first.x + first.width <= second.x);
});

test('an empty or all-zero series draws nothing and does not divide by zero', () => {
  assert.deepEqual(stackedBars([], ['a'], { width: 100, height: 80 }), { bars: [], max: 0, ticks: [] });
  const zero = stackedBars([{ label: 'd1', a: 0 }], ['a'], { width: 100, height: 80 });
  assert.equal(zero.max, 0);
  assert.equal(zero.bars[0].segments[0].height, 0);
});

test('fillWeeks adds the empty weeks between the first and last, so time is not squeezed', async () => {
  const { fillWeeks } = await import('./chart');
  assert.deepEqual(fillWeeks([{ week: '2026-08-03', views: 5 }, { week: '2026-08-17', views: 2 }], { views: 0 }), [
    { week: '2026-08-03', views: 5 }, { week: '2026-08-10', views: 0 }, { week: '2026-08-17', views: 2 },
  ]);
  assert.deepEqual(fillWeeks<{ week: string; views: number }>([], { views: 0 }), []);
});

test('lineAxis always contains the highest value, starting near the lowest', async () => {
  const { lineAxis } = await import('./chart');
  for (const [lo, hi] of [[1300, 2300], [176000, 184000], [0, 7], [5, 5], [999, 1001]]) {
    const { min, max } = lineAxis(lo, hi);
    assert.ok(min <= lo, `min ${min} <= ${lo}`);
    assert.ok(max >= hi, `max ${max} >= ${hi} (lo ${lo})`);
    assert.ok(max > min);
  }
  assert.deepEqual(lineAxis(1300, 2300), { min: 1250, max: 2750, ticks: [1250, 2000, 2750] });
});
