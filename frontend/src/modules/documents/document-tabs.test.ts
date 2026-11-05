import assert from 'node:assert/strict';
import test from 'node:test';

test('documents workspace: library first, one generic template builder', async () => {
  const tabsModule = await import('./document-tabs').catch(() => ({}));
  const documentWorkspaceTabs = Reflect.get(tabsModule, 'DOCUMENT_WORKSPACE_TABS');

  assert.ok(Array.isArray(documentWorkspaceTabs));
  assert.deepEqual(
    documentWorkspaceTabs.map((tab: { value: string }) => tab.value),
    ['library', 'templates', 'documents'],
  );
});

test('an unknown or missing tab opens the library', async () => {
  const { getDocumentWorkspaceTab } = await import('./document-tabs');
  assert.equal(getDocumentWorkspaceTab(null), 'library');
  assert.equal(getDocumentWorkspaceTab('nope'), 'library');
  assert.equal(getDocumentWorkspaceTab('templates'), 'templates');
});
