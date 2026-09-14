import assert from 'node:assert/strict';
import test from 'node:test';

const templates = [
  { id: 'first', isDefault: false },
  { id: 'default', isDefault: true },
] as never[];

test('template selection keeps a compatible choice and otherwise uses the type default', async () => {
  const mod = await import('./template-selection').catch(() => ({}));
  const chooseTemplateId = Reflect.get(mod, 'chooseTemplateId');

  assert.equal(chooseTemplateId?.(templates, 'first'), 'first');
  assert.equal(chooseTemplateId?.(templates, 'other-company'), 'default');
  assert.equal(chooseTemplateId?.(templates, ''), 'default');
  assert.equal(chooseTemplateId?.([], 'first'), '');
});
