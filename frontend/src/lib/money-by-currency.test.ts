import assert from 'node:assert/strict';
import test from 'node:test';
import { sumByCurrency } from './money-by-currency';

test('amounts add up within a currency, never across', () => {
  const rows = [
    { companyId: 'a', v: 10 }, { companyId: 'b', v: 5 }, { companyId: 'a', v: 2.5 }, { companyId: 'c', v: 1 },
  ];
  const currency = (id: string) => (id === 'b' ? 'OMR' : 'USD');
  assert.deepEqual(sumByCurrency(rows, (r) => currency(r.companyId), (r) => r.v), [
    { currencyCode: 'USD', value: 13.5 },
    { currencyCode: 'OMR', value: 5 },
  ]);
});

test('nothing to add is one zero in the given currency', () => {
  assert.deepEqual(sumByCurrency([], () => 'USD', () => 0, 'OMR'), [{ currencyCode: 'OMR', value: 0 }]);
});
