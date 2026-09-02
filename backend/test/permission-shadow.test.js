const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { routeToPermission, recordDivergence } = require('../dist/permissions/shadow');
const { makeTmpDir } = require('./helpers/tmp');

const freshStore = () => {
  const dir = makeTmpDir('taskflow-shadow-');
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

const entry = (over = {}) => ({
  userId: 'u1', companyId: 'c1', module: 'invoices', action: 'create',
  route: 'POST /companies/:companyId/invoices',
  legacyAllowed: true, openfgaAllowed: false, ...over,
});

test('routeToPermission resolves an express route to a catalogue entry', () => {
  const mapped = routeToPermission('POST', '/companies/:companyId/documents');
  assert.ok(mapped, 'the documents create route must be in the matrix');
  assert.equal(mapped.module, 'documents');
  assert.equal(mapped.action, 'create');
});

test('routeToPermission resolves a sub-resource-qualified action', () => {
  const mapped = routeToPermission('POST', '/companies/:companyId/custom-fields');
  assert.ok(mapped);
  assert.equal(mapped.module, 'settings');
  assert.equal(mapped.action, 'custom-fields.create',
    'a split permission must keep its qualified action');
});

test('routeToPermission is case-insensitive on the method', () => {
  assert.deepEqual(
    routeToPermission('post', '/companies/:companyId/documents'),
    routeToPermission('POST', '/companies/:companyId/documents'),
  );
});

test('routeToPermission ignores ungated routes', () => {
  assert.equal(routeToPermission('GET', '/health'), undefined,
    'an ungated route must not be shadow-compared');
});

test('routeToPermission returns undefined for an unmapped route', () => {
  assert.equal(routeToPermission('GET', '/totally/unknown'), undefined);
});

test('recordDivergence writes a row that names both answers', () => {
  const store = freshStore();
  recordDivergence(store, entry());
  const rows = store.listAuthzDivergences();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacyAllowed, 1);
  assert.equal(rows[0].openfgaAllowed, 0);
  assert.equal(rows[0].module, 'invoices');
  assert.equal(rows[0].route, 'POST /companies/:companyId/invoices');
});

test('recordDivergence writes nothing when both engines agree', () => {
  const store = freshStore();
  recordDivergence(store, entry({ openfgaAllowed: true }));
  recordDivergence(store, entry({ legacyAllowed: false, openfgaAllowed: false }));
  assert.equal(store.listAuthzDivergences().length, 0);
});

test('recordDivergence captures the opposite direction too', () => {
  const store = freshStore();
  recordDivergence(store, entry({ legacyAllowed: false, openfgaAllowed: true }));
  const rows = store.listAuthzDivergences();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacyAllowed, 0);
  assert.equal(rows[0].openfgaAllowed, 1);
});
