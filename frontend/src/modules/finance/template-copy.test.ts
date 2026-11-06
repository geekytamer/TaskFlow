import assert from 'node:assert/strict';
import test from 'node:test';

const base = {
  id: 't1', companyId: 'c1', name: 'Peak invoice', docType: 'invoice', layout: 'modern', isDefault: true,
  primaryColor: '#0f766e', accentColor: '#f59e0b', logoUrl: 'data:logo', stampUrl: 'data:stamp',
  bankAccounts: [{ id: 'b1', bankName: 'Bank Muscat' }], terms: 'Pay in 15 days', watermarkEnabled: false,
  showCompanyAddress: true, showTaxId: true, createdAt: new Date(), updatedAt: new Date(),
  doc: { version: 1, page: {}, theme: {}, body: [
    { id: 'h', type: 'heading', content: 'INVOICE' },
    { id: 'row', type: 'container', children: [{ id: 'ar', type: 'heading', content: 'فاتورة' }, { id: 'txt', type: 'text', content: 'Invoice terms apply' }] },
    { id: 'items', type: 'lineItems' },
  ] },
} as never;

test('a copy keeps the whole look under a new name, never as the default', async () => {
  const { copyTemplateInput } = await import('./template-copy');
  const copy = copyTemplateInput(base, { name: '  Peak invoice — blue  ', docType: 'invoice' });
  assert.equal(copy.name, 'Peak invoice — blue');
  assert.equal(copy.docType, 'invoice');
  assert.equal(copy.isDefault, false);
  assert.equal(copy.logoUrl, 'data:logo');
  assert.deepEqual(copy.bankAccounts, [{ id: 'b1', bankName: 'Bank Muscat' }]);
  assert.equal(copy.terms, 'Pay in 15 days');
  assert.equal((copy as any).id, undefined);
  assert.equal((copy as any).companyId, undefined);
  assert.equal((copy.doc as any).body[0].content, 'INVOICE', 'same type: wording untouched');
  (copy.doc as any).body[0].content = 'changed';
  assert.equal((base as any).doc.body[0].content, 'INVOICE', 'the original design is not shared');
});

test('an invoice copied as a quotation gets the quotation heading in both languages, nothing else', async () => {
  const { copyTemplateInput } = await import('./template-copy');
  const copy = copyTemplateInput(base, { name: 'Peak quotation', docType: 'quote' });
  const body = (copy.doc as any).body;
  assert.equal(copy.docType, 'quote');
  assert.equal(body[0].content, 'QUOTATION');
  assert.equal(body[1].children[0].content, 'عرض سعر');
  assert.equal(body[1].children[1].content, 'Invoice terms apply', 'only a heading that is exactly the type word changes');
  assert.equal(body[2].type, 'lineItems');
});

test('copies stay within their family: money documents with money documents, letters with letters', async () => {
  const { copyTargets } = await import('./template-copy');
  assert.deepEqual(copyTargets('invoice'), ['invoice', 'quote', 'bill', 'statement', 'delivery']);
  assert.deepEqual(copyTargets('letter'), ['letter', 'memo', 'certificate', 'custom']);
  const { copyTemplateInput } = await import('./template-copy');
  assert.throws(() => copyTemplateInput(base, { name: 'x', docType: 'letter' }), /cannot become/);
  assert.throws(() => copyTemplateInput(base, { name: ' ', docType: 'invoice' }), /name/);
});
