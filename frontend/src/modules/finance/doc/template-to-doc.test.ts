import assert from 'node:assert/strict';
import test from 'node:test';

test('letter templates start as letters rather than invoices', async () => {
  const module = await import('./template-to-doc');
  const doc = module.templateToDoc({
    docType: 'letter',
    name: 'Client Letter',
    primaryColor: '#111827',
    accentColor: '#2563eb',
  } as never);

  assert.equal(doc.body.some((block) => block.type === 'lineItems'), false);
  assert.equal(doc.body.some((block) => block.type === 'totals'), false);
  assert.equal(
    doc.body.some((block) => block.type === 'heading' && /letter/i.test(block.content)),
    true,
  );
  assert.equal(JSON.stringify(doc).includes('{{invoice.'), false);
});

test('generic document tokens resolve through the existing preview context', async () => {
  const module = await import('./tokens');
  const context = {
    invoice: {
      invoiceNumber: 'DOC-42',
      issueDate: new Date('2026-07-27T00:00:00.000Z'),
    },
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    formatMoney: (value: number) => String(value),
    publicUrl: '',
  } as never;

  assert.equal(module.resolveToken('document.number', context), 'DOC-42');
  assert.notEqual(module.resolveToken('document.date', context), '');
});
