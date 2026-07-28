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
