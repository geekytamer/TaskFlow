import assert from 'node:assert/strict';
import test from 'node:test';
import { mapQuotation } from '@/services/quotationService';
import { formItemsTotal, itemsToForm, prepareItems } from './sales-line-items';
import { optionalIndexes } from './optional-lines-picker';

const payload = {
  id: 'q1',
  items: [
    { lineType: 'section', description: 'Package A', quantity: 0, unitPrice: 0, lineTotal: 0 },
    { description: 'Workshop', descriptionAr: 'ورشة', descriptionEn: 'Workshop', quantity: 2, unitPrice: 100, lineTotal: 200, unit: 'day', details: 'Half days' },
    { description: 'Extra', quantity: 1, unitPrice: 50, lineTotal: 50, optional: true },
  ],
};

test('quote lines keep sections, optional flag, unit, details and names through the form round trip', () => {
  const quote = mapQuotation(payload);
  assert.equal(quote.items[0].lineType, 'section');
  assert.equal(quote.items[1].unit, 'day');
  assert.equal(quote.items[1].details, 'Half days');
  assert.equal(quote.items[1].descriptionAr, 'ورشة');
  assert.equal(quote.items[1].descriptionEn, 'Workshop');
  assert.equal(quote.items[2].optional, true);
  assert.deepEqual(optionalIndexes(quote), [2]);
  const rows = itemsToForm(quote.items);
  assert.equal(formItemsTotal(rows), 200);
  const back = prepareItems(rows, new Map());
  assert.equal(back[0].lineType, 'section');
  assert.equal(back[1].unit, 'day');
  assert.equal(back[1].details, 'Half days');
  assert.equal(back[2].optional, true);
});

test('plain lines get no new keys', () => {
  const quote = mapQuotation({ id: 'q', items: [{ description: 'A', quantity: 1, unitPrice: 5, lineTotal: 5 }] });
  for (const k of ['lineType', 'optional', 'details', 'unit', 'descriptionAr', 'descriptionEn']) assert.equal(k in quote.items[0], false, k);
});
