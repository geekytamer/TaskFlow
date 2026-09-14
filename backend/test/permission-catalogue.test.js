const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MODULES,
  isValidPermission,
  permissionKey,
  allPermissions,
} = require('../dist/permissions/catalogue');
const { RECORD_RULES } = require('../dist/permissions/record-rules');

test('every module declares a label key, a sidebar group and at least one action', () => {
  assert.ok(MODULES.length > 0);
  for (const mod of MODULES) {
    assert.ok(mod.key, 'module needs a key');
    assert.ok(mod.labelKey, `module ${mod.key} needs a labelKey`);
    assert.ok(mod.group, `module ${mod.key} needs a sidebar group`);
    assert.ok(mod.actions.length > 0, `module ${mod.key} needs actions`);
  }
});

test('module keys are unique', () => {
  const keys = MODULES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('isValidPermission rejects unknown modules and actions', () => {
  assert.equal(isValidPermission('invoices', 'read'), true);
  assert.equal(isValidPermission('invoices', 'teleport'), false);
  assert.equal(isValidPermission('not-a-module', 'read'), false);
});

test('permissionKey formats as module:action', () => {
  assert.equal(permissionKey('invoices', 'create'), 'invoices:create');
});

test('allPermissions returns one entry per module-action pair', () => {
  const expected = MODULES.reduce((sum, m) => sum + m.actions.length, 0);
  assert.equal(allPermissions().length, expected);
});

test('catalogue covers every enforced permission in the gate matrix', () => {
  const csvPath = path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  const rows = fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
  const missing = new Set();
  for (const row of rows) {
    const [, , module, action, , , gate] = row.split(',');
    if (gate === 'none') continue;
    if (!isValidPermission(module, action)) missing.add(`${module}:${action}`);
  }
  assert.deepEqual([...missing], [], `catalogue is missing: ${[...missing].join(', ')}`);
});

test('the catalogue grants nothing the gate matrix does not enforce', () => {
  const csvPath = path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  const rows = fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
  const enforced = new Set();
  for (const row of rows) {
    const [, , module, action, , , gate] = row.split(',');
    if (gate !== 'none') enforced.add(`${module}:${action}`);
  }
  // Record rules are enforced inside handlers; record-rules.test.js checks that.
  for (const rule of Object.values(RECORD_RULES)) enforced.add(`${rule.module}:${rule.action}`);
  const unenforced = allPermissions().filter((p) => !enforced.has(p));
  assert.deepEqual(unenforced, [],
    `catalogue promises permissions no route enforces: ${unenforced.join(', ')}`);
});
