import assert from 'node:assert/strict';
import test from 'node:test';

test('the public quote keeps line kinds, extras and text for the renderer', async () => {
  const payload = {
    quotation: {
      id: 'q1', quoteNumber: 'QT-1', issueDate: '2026-11-19', validUntil: '2026-12-19', status: 'Draft', taxRate: 5, currency: 'OMR', totalAmount: 10,
      items: [{ lineType: 'section', description: 'A', quantity: 0, unitPrice: 0, lineTotal: 0 }, { description: 'x', quantity: 1, unitPrice: 10, lineTotal: 10, optional: true, unit: 'day', details: 'd' }],
      extras: { 'contact.name': { type: 'text', value: 'Sara' } }, content: { terms: 'T', fields: { port: 'Sohar', incoterm: 'FOB' } },
    },
    company: { id: '1' }, client: { id: 'c1' },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => payload })) as never;
  try {
  const { getPublicQuotation } = await import('./publicService');
  const data = await getPublicQuotation('q1');
  const lines = data.invoice.lineItems as any[];
  assert.equal(lines[0].lineType, 'section');
  assert.equal(lines[1].optional, true);
  assert.equal(lines[1].unit, 'day');
  assert.equal(lines[1].details, 'd');
  assert.deepEqual(data.extras, { 'contact.name': { type: 'text', value: 'Sara' } });
  assert.deepEqual(data.content, { terms: 'T' });
  assert.deepEqual(data.fields, { 'field.port': 'Sohar', 'field.incoterm': 'FOB' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
