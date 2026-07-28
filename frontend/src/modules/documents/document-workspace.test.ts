import assert from 'node:assert/strict';
import test from 'node:test';

test('document workspace is available to every backend-supported management role', async () => {
  const workspace = await import('./document-workspace').catch(() => ({}));
  const canAccessDocumentWorkspace = Reflect.get(workspace, 'canAccessDocumentWorkspace');

  assert.equal(typeof canAccessDocumentWorkspace, 'function');
  assert.equal(canAccessDocumentWorkspace('Admin'), true);
  assert.equal(canAccessDocumentWorkspace('Manager'), true);
  assert.equal(canAccessDocumentWorkspace('Accountant'), true);
  assert.equal(canAccessDocumentWorkspace('Employee'), false);
  assert.equal(canAccessDocumentWorkspace(undefined), false);
});

test('document workspace role list stays aligned with the access check', async () => {
  const workspace = await import('./document-workspace').catch(() => ({}));
  const roles = Reflect.get(workspace, 'DOCUMENT_WORKSPACE_ROLES');

  assert.deepEqual(roles, ['Admin', 'Manager', 'Accountant']);
});
