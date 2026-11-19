import assert from 'node:assert/strict';
import test from 'node:test';

test('page-flow blocks stay at the document root when a group is selected', async () => {
  const { insertDesignerBlock } = await import('./invoice-designer');
  const group = {
    id: 'group',
    type: 'container',
    layout: 'stack',
    children: [{ id: 'inside', type: 'text', content: 'Inside group' }],
  } as never;

  const withTable = insertDesignerBlock([group], 'group', {
    id: 'table',
    type: 'lineItems',
  } as never);
  const withBreak = insertDesignerBlock(withTable, 'group', {
    id: 'break',
    type: 'pageBreak',
  } as never);

  assert.deepEqual(
    withBreak.map((block) => block.id),
    ['group', 'table', 'break'],
  );
  assert.deepEqual(
    withBreak[0].type === 'container'
      ? withBreak[0].children.map((block) => block.id)
      : [],
    ['inside'],
  );
});

test('the proposal starter is a valid quote layout with intro, scope and terms slots', async () => {
  const { proposalDoc } = await import('../doc/presets');
  const { validateInvoiceDoc } = await import('../doc/validation');
  const doc = proposalDoc();
  assert.deepEqual(validateInvoiceDoc(doc), []);
  const slots: string[] = [];
  const walk = (blocks: any[]) => blocks.forEach((b) => { if (b.type === 'slot') slots.push(b.slot); if (b.children) walk(b.children); });
  walk(doc.body);
  assert.deepEqual(slots, ['intro', 'scope', 'terms']);
  const columns = JSON.stringify(doc.body);
  assert.ok(columns.includes('"key":"index"') && columns.includes('"key":"unit"'));
});

test('the proposal preset is listed and its words localise to Arabic', async () => {
  const { invoicePresets, proposalDoc } = await import('../doc/presets');
  const { localizeLabel, docStrings } = await import('../doc/strings');
  assert.ok(invoicePresets.some((p) => p.id === 'proposal'));
  const ar = docStrings('ar');
  const doc: any = proposalDoc();
  const slot = (name: string) => doc.body.find((b: any) => b.type === 'slot' && b.slot === name);
  assert.equal(localizeLabel(slot('scope').title, ar), 'نطاق العمل');
  assert.equal(localizeLabel(slot('intro').fallback, ar), 'شكرًا لإتاحة الفرصة. تجدون عرضنا أدناه.');
  assert.equal(localizeLabel('Attention', ar), 'عناية');
  assert.equal(localizeLabel('Prepared by', ar), 'أعدّه');
  assert.equal(localizeLabel('Unit', ar), 'سعر الوحدة');
  assert.equal(localizeLabel('Unit of measure', ar), 'الوحدة');
});
