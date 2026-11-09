import assert from 'node:assert/strict';
import test from 'node:test';
import { discountTotals } from './discount';

test('discount totals add up only the lines that carry a discount', () => {
  assert.deepEqual(
    discountTotals([
      { quantity: 2, unitPrice: 100, discount: 10, amount: 180 },
      { quantity: 1, unitPrice: 50, discount: 5, amount: 45 },
      // A hand-typed amount below qty × unit is not a discount.
      { quantity: 1, unitPrice: 20, amount: 15 },
    ]),
    { gross: 265, discount: 25, net: 240 },
  );
});

test('no discounted lines means no discount', () => {
  assert.deepEqual(discountTotals([{ quantity: 1, unitPrice: 10, amount: 10 }]), { gross: 10, discount: 0, net: 10 });
});
