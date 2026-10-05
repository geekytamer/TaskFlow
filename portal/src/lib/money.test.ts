import test from 'node:test';
import assert from 'node:assert/strict';
import { sumByCurrency } from './money';

test('sums per currency, never across currencies, sorted, rounded to cents', () => {
  assert.deepEqual(sumByCurrency([
    { currency: 'OMR', amount: 1250.1 }, { currency: 'AED', amount: 10 }, { currency: 'OMR', amount: 0.2 }, { currency: 'AED', amount: 0 },
  ]), [{ currency: 'AED', amount: 10 }, { currency: 'OMR', amount: 1250.3 }]);
  assert.deepEqual(sumByCurrency([]), []);
});

test('drops currencies whose total is zero', () => {
  assert.deepEqual(sumByCurrency([{ currency: 'OMR', amount: 0 }]), []);
});
