import assert from 'node:assert/strict';
import test from 'node:test';

test('documents workspace has one generic template builder', async () => {
  const tabsModule = await import('./document-tabs').catch(() => ({}));
  const documentWorkspaceTabs = Reflect.get(tabsModule, 'DOCUMENT_WORKSPACE_TABS');

  assert.ok(Array.isArray(documentWorkspaceTabs));
  assert.deepEqual(
    documentWorkspaceTabs.map((tab: { value: string }) => tab.value),
    ['templates', 'documents'],
  );
});
