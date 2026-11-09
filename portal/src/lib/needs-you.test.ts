import test from 'node:test';
import assert from 'node:assert/strict';
import { rankNeedsYou } from './needs-you';

test('overdue money first (most days late first), then proposals, then content to review', () => {
  const items = rankNeedsYou({
    overdue: [
      { id: 'i1', number: 'INV-1', outstanding: 300, currency: 'OMR', daysLate: 2 },
      { id: 'i2', number: 'INV-2', outstanding: 900, currency: 'OMR', daysLate: 15 },
    ],
    proposals: [{ id: 'p1', title: 'National Day push' }],
    reviews: [{ campaignId: 'c1', name: 'Ramadan launch', count: 2 }, { campaignId: 'c2', name: 'Empty', count: 0 }],
  });
  assert.deepEqual(items.map((i) => i.key), ['invoice:i2', 'invoice:i1', 'proposal:p1', 'review:c1']);
  assert.deepEqual(items[0], { key: 'invoice:i2', kind: 'overdue', href: '/billing/i2', title: 'INV-2', amount: 900, currency: 'OMR', daysLate: 15 });
  assert.deepEqual(items[3], { key: 'review:c1', kind: 'review', href: '/campaigns/c1', title: 'Ramadan launch', count: 2 });
});

test('nothing waiting gives an empty list', () => {
  assert.deepEqual(rankNeedsYou({ overdue: [], proposals: [], reviews: [] }), []);
});

test('cheques due soon sit after overdue money, soonest first', () => {
  const items = rankNeedsYou({
    overdue: [{ id: 'i1', number: 'INV-1', outstanding: 300, currency: 'OMR', daysLate: 2 }],
    proposals: [{ id: 'p1', title: 'Offer' }],
    cheques: [
      { id: 'c2', invoiceId: 'i9', number: '000125', amount: 400, currency: 'OMR', dueDate: '2026-12-09' },
      { id: 'c1', invoiceId: 'i9', number: '000124', amount: 400, currency: 'OMR', dueDate: '2026-12-05' },
    ],
    reviews: [],
  });
  assert.deepEqual(items.map((i) => i.key), ['invoice:i1', 'cheque:c1', 'cheque:c2', 'proposal:p1']);
  assert.equal(items[1].href, '/billing/i9');
});
