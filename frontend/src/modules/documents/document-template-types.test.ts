import assert from 'node:assert/strict';
import test from 'node:test';

test('generic template builder offers every supported document type', async () => {
  const typesModule = await import('./document-template-types').catch(() => ({}));
  const templateTypes = Reflect.get(typesModule, 'DOCUMENT_TEMPLATE_TYPES');

  assert.deepEqual(
    templateTypes?.map((item: { value: string }) => item.value),
    ['invoice', 'delivery', 'quote', 'letter', 'memo', 'certificate', 'statement', 'custom'],
  );
});

test('only transactional document types expose financial controls', async () => {
  const typesModule = await import('./document-template-types').catch(() => ({}));
  const isFinancialDocumentType = Reflect.get(typesModule, 'isFinancialDocumentType');

  assert.equal(isFinancialDocumentType?.('invoice'), true);
  assert.equal(isFinancialDocumentType?.('quote'), true);
  assert.equal(isFinancialDocumentType?.('statement'), true);
  assert.equal(isFinancialDocumentType?.('letter'), false);
  assert.equal(isFinancialDocumentType?.('certificate'), false);
});
