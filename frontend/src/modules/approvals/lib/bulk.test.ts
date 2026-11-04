import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { approveEach, totalsByCurrency } from './bulk';

describe('bulk approve', () => {
  it('approves one at a time and reports each failure without stopping', async () => {
    const order: string[] = [];
    const result = await approveEach(['a', 'b', 'c'], async (id) => {
      order.push(id);
      if (id === 'b') throw new Error('Over your limit');
    });
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.deepEqual(result.done, ['a', 'c']);
    assert.deepEqual(result.failed, [{ item: 'b', message: 'Over your limit' }]);
  });

  it('reports progress after each one', async () => {
    const seen: number[] = [];
    await approveEach([1, 2], async () => {}, (n) => seen.push(n));
    assert.deepEqual(seen, [1, 2]);
  });

  it('adds amounts per currency, leave days apart', () => {
    const rows = [
      { amount: 10, currency: 'OMR', days: false },
      { amount: 5.5, currency: 'OMR', days: false },
      { amount: 100, currency: 'USD', days: false },
      { amount: 3, currency: 'OMR', days: true },
      { amount: 0, currency: 'OMR', days: false },
    ];
    assert.deepEqual(totalsByCurrency(rows), { money: { OMR: 15.5, USD: 100 }, days: 3 });
  });
});
