const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { diffTuples, syncTuples } = require('../dist/permissions/sync');
const { tuplesForStore } = require('../dist/permissions/tuples');

const key = (t) => `${t.user}|${t.relation}|${t.object}`;

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-sync-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

/** In-memory stand-in for OpenFGA's tuple store. */
const fakeTupleStore = (initial = []) => ({
  tuples: [...initial],
  async readAll() { return [...this.tuples]; },
  async write({ writes = [], deletes = [] }) {
    const gone = new Set(deletes.map(key));
    this.tuples = this.tuples.filter((t) => !gone.has(key(t)));
    this.tuples.push(...writes);
  },
});

test('diffTuples reports what to add and what to remove', () => {
  const { toWrite, toDelete } = diffTuples(
    [{ user: 'user:a', relation: 'direct_member', object: 'group:g1' },
     { user: 'user:b', relation: 'direct_member', object: 'group:g1' }],
    [{ user: 'user:b', relation: 'direct_member', object: 'group:g1' },
     { user: 'user:c', relation: 'direct_member', object: 'group:g1' }],
  );
  assert.deepEqual(toWrite.map(key), ['user:a|direct_member|group:g1']);
  assert.deepEqual(toDelete.map(key), ['user:c|direct_member|group:g1']);
});

test('diffTuples is a no-op when both sides match', () => {
  const tuples = [{ user: 'user:a', relation: 'granted', object: 'permission:c1/invoices/read' }];
  const { toWrite, toDelete } = diffTuples(tuples, [...tuples]);
  assert.deepEqual(toWrite, []);
  assert.deepEqual(toDelete, []);
});

test('a dry run reports the delta without writing anything', async () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  store.createUser({
    name: 'A', email: 'a@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }], password: 'x',
  });

  const fake = fakeTupleStore();
  const result = await syncTuples(store, { dryRun: true, tupleStore: fake });
  assert.ok(result.toWrite.length > 0);
  assert.equal(result.written, 0);
  assert.equal(fake.tuples.length, 0, 'a dry run must not write');
});

test('sync brings an empty tuple store fully up to date, and is idempotent', async () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  store.createUser({
    name: 'A', email: 'a@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }], password: 'x',
  });

  const fake = fakeTupleStore();
  const first = await syncTuples(store, { tupleStore: fake });
  assert.equal(first.written, tuplesForStore(store).length);
  assert.equal(first.deleted, 0);

  const second = await syncTuples(store, { tupleStore: fake });
  assert.equal(second.written, 0, 'second run must write nothing');
  assert.equal(second.deleted, 0, 'second run must delete nothing');
});

test('sync removes tuples that SQL no longer implies', async () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const fake = fakeTupleStore([
    { user: 'user:ghost', relation: 'direct_member', object: 'group:deleted' },
  ]);

  const result = await syncTuples(store, { tupleStore: fake });
  assert.equal(result.deleted, 1, 'a stale tuple must be removed');
  assert.ok(!fake.tuples.some((t) => t.user === 'user:ghost'));
});

test('sync repairs drift after a group is revoked', async () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const g = store.createPermissionGroup({ companyId: co.id, key: 'temp', name: 'Temp' });
  store.setGroupPermissions(g.id, [{ module: 'invoices', action: 'delete' }]);

  const fake = fakeTupleStore();
  await syncTuples(store, { tupleStore: fake });
  const before = fake.tuples.length;

  store.setGroupPermissions(g.id, []);
  const result = await syncTuples(store, { tupleStore: fake });

  assert.ok(result.deleted > 0, 'revoking a grant must delete its tuples');
  assert.ok(fake.tuples.length < before);
  // Scoped to this group: the built-in Admin/Manager/Accountant groups also
  // hold invoices:delete, so those tuples legitimately remain.
  assert.ok(
    !fake.tuples.some((t) => t.user === `group:${g.id}#member` && t.object.includes('invoices/delete')),
    'the revoked group must no longer grant invoices:delete',
  );
});
