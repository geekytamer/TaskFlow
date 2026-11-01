import test from 'node:test';
import assert from 'node:assert/strict';
import { modulesForPath, presetFor } from './company-modules';

test('a feature page needs its feature on, and its permission module too', () => {
  assert.deepEqual(modulesForPath('/inbox'), ['inbox']);
  assert.deepEqual(modulesForPath('/crm/followups'), ['crm', 'followups']);
  assert.deepEqual(modulesForPath('/flexi/accounts'), ['invoices', 'flexi']);
  assert.deepEqual(modulesForPath('/academy'), ['academy']);
  assert.deepEqual(modulesForPath('/influencers/abc'), ['contacts', 'influencers']);
  assert.deepEqual(modulesForPath('/hr/payroll'), ['payroll']);
  assert.deepEqual(modulesForPath('/inboxes'), [], 'a prefix of a word is not a match');
});

test('a company shows the preset its list matches, in any order, or none', () => {
  const presets = [
    { key: 'everything', disabledModules: [] },
    { key: 'agency', disabledModules: ['inventory', 'manufacturing', 'purchasing'] },
  ];
  assert.equal(presetFor([], presets), 'everything');
  assert.equal(presetFor(['purchasing', 'inventory', 'manufacturing'], presets), 'agency');
  assert.equal(presetFor(['inventory'], presets), undefined);
});
