import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyItemRow, emptySectionRow, formDiscountTotals, formItemsTotal, formOptionalTotal, itemsToForm, prepareItems } from './sales-line-items';

const rows = [
  { ...emptySectionRow(), description: 'Package A' },
  { ...emptyItemRow(), description: 'Workshop', quantity: '2', unitPrice: '100', unit: 'day', details: 'Half days' },
  { ...emptyItemRow(), description: 'Extra', quantity: '1', unitPrice: '50', optional: true },
];

test('totals skip sections and optional rows; optional rows have their own total', () => {
  assert.equal(formItemsTotal(rows), 200);
  assert.equal(formDiscountTotals(rows).gross, 200);
  assert.equal(formOptionalTotal(rows), 50);
});

test('prepared lines keep sections and the new fields, and round-trip', () => {
  const items = prepareItems(rows, new Map());
  assert.deepEqual(items[0], { lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, lineTotal: 0 });
  assert.equal(items[1].unit, 'day');
  assert.equal(items[1].details, 'Half days');
  assert.equal(items[2].optional, true);
  const back = itemsToForm(items);
  assert.equal(back[0].lineType, 'section');
  assert.equal(back[2].optional, true);
});

test('plain rows get no new keys and empty sections are dropped', () => {
  const items = prepareItems([{ ...emptyItemRow(), description: 'A', unitPrice: '5' }, emptySectionRow()], new Map());
  assert.equal(items.length, 1);
  for (const key of ['lineType', 'optional', 'details', 'unit']) assert.equal(key in items[0], false);
});
