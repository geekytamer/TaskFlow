import assert from 'node:assert/strict';
import test from 'node:test';
import { opportunityRefusal } from './opportunity-refusal';

test('names what blocks the delete in English, with counts and plurals', () => {
  assert.equal(
    opportunityRefusal({ commissions: 1, quotations: 2 }, 'en'),
    "It still has 1 commission and 2 quotations. Cancel it instead, or remove those first.",
  );
  assert.equal(opportunityRefusal({ wonSalesOrder: 1 }, 'en'), "It still has 1 won sales order. Cancel it instead, or remove those first.");
});

test('says the same in Arabic', () => {
  assert.equal(
    opportunityRefusal({ commissions: 1, acceptedProposals: 2 }, 'ar'),
    'ما زالت مرتبطة بـ: عمولات (1)، عروض مقبولة (2). ألغِ الفرصة بدلاً من ذلك، أو احذف هذه السجلات أولاً.',
  );
});

test('returns null when the refusal carries nothing it knows', () => {
  assert.equal(opportunityRefusal(undefined, 'en'), null);
  assert.equal(opportunityRefusal({ somethingNew: 3 }, 'ar'), null);
  assert.equal(opportunityRefusal('x', 'en'), null);
});
