import assert from 'node:assert/strict';
import test from 'node:test';
import { countedLines, itemNumbers, optionalTotal } from './quote-lines';

const lines = [
  { lineType: 'section' as const, description: 'A', quantity: 0, unitPrice: 0, amount: 0 },
  { description: 'x', quantity: 1, unitPrice: 10, amount: 10 },
  { description: 'y', quantity: 1, unitPrice: 5, amount: 5, optional: true },
  { description: 'z', quantity: 2, unitPrice: 1, amount: 2 },
];

test('only priced, non-optional lines count', () => {
  assert.deepEqual(countedLines(lines).map((l) => l.description), ['x', 'z']);
  assert.equal(optionalTotal(lines), 5);
});

test('numbering skips sections but numbers optional lines', () => {
  assert.deepEqual(itemNumbers(lines), [null, 1, 2, 3]);
});
