const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { diffTuples, syncTuples } = require('../dist/permissions/sync');
const { tuplesForStore } = require('../dist/permissions/tuples');
const { makeTmpDir } = require('./helpers/tmp');

const key = (t) => `${t.user}|${t.relation}|${t.object}`;

const freshStore = () => {
  const dir = makeTmpDir('taskflow-sync-');
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

test('a company delta writes only what changed, and reads nothing back', async () => {
  const store = freshStore();
  const a = store.createCompany({ name: 'Alpha', website: '', address: '' });
  const b = store.createCompany({ name: 'Beta', website: '', address: '' });

  const { projectCompanyDelta } = require('../dist/permissions/sync');
  const writes = [];
  const writer = {
    reads: 0,
    async write(req) { writes.push(req); },
    async readAll() { this.reads += 1; return []; },
  };

  const before = tuplesForStore(store, a.id);
  const group = store.createPermissionGroup({ companyId: a.id, key: 'delta', name: 'Delta' });
  store.setGroupPermissions(group.id, [{ module: 'invoices', action: 'read' }]);

  const result = await projectCompanyDelta(store, a.id, before, writer);

  assert.equal(writer.reads, 0, 'a delta must not read the tuple store back');
  assert.ok(result.written > 0, 'the new grant must be published');
  assert.equal(result.deleted, 0);

  const published = writes.flatMap((w) => w.writes ?? []);
  assert.ok(published.every((t) => !t.object.includes(b.id)),
    'the other company must not appear in the delta');
});

test('a company delta publishes removals as deletes', async () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Gamma', website: '', address: '' });
  const group = store.createPermissionGroup({ companyId: co.id, key: 'temp', name: 'Temp' });
  store.setGroupPermissions(group.id, [{ module: 'invoices', action: 'delete' }]);

  const { projectCompanyDelta } = require('../dist/permissions/sync');
  const writer = { calls: [], async write(req) { this.calls.push(req); } };

  const before = tuplesForStore(store, co.id);
  store.setGroupPermissions(group.id, []);
  const result = await projectCompanyDelta(store, co.id, before, writer);

  assert.ok(result.deleted > 0, 'revoked grants must be deleted');
  assert.equal(result.written, 0);
});

test('an unchanged company produces no traffic at all', async () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Delta Co', website: '', address: '' });
  const { projectCompanyDelta } = require('../dist/permissions/sync');
  const writer = { calls: 0, async write() { this.calls += 1; } };

  const before = tuplesForStore(store, co.id);
  const result = await projectCompanyDelta(store, co.id, before, writer);

  assert.deepEqual(result, { written: 0, deleted: 0 });
  assert.equal(writer.calls, 0);
});

test('the delta cost does not grow with the number of other companies', () => {
  const store = freshStore();
  const target = store.createCompany({ name: 'Target', website: '', address: '' });
  const oneCompany = tuplesForStore(store, target.id).length;

  for (let i = 0; i < 10; i += 1) {
    store.createCompany({ name: `Filler ${i}`, website: '', address: '' });
  }
  assert.equal(tuplesForStore(store, target.id).length, oneCompany,
    'scoping must ignore other companies');
  assert.ok(tuplesForStore(store).length > oneCompany * 10,
    'while the unscoped set does grow with them');
});
