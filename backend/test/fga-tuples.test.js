const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { permissionObject, tuplesForStore } = require('../dist/permissions/tuples');
const { makeTmpDir } = require('./helpers/tmp');

const freshStore = () => {
  const dir = makeTmpDir('taskflow-tuples-');
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

const has = (tuples, user, relation, object) =>
  tuples.some((t) => t.user === user && t.relation === relation && t.object === object);

test('permission objects use slash separators, never a colon inside the id', () => {
  const obj = permissionObject('c-7f3a', 'invoices', 'create');
  assert.equal(obj, 'permission:c-7f3a/invoices/create');
  assert.equal(obj.split(':').length, 2, 'exactly one colon, separating type from id');
});

test('tuplesForStore emits membership, implication, grant and company tuples', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const parent = store.createPermissionGroup({ companyId: co.id, key: 'mgr2', name: 'Mgr2' });
  const child = store.createPermissionGroup({ companyId: co.id, key: 'emp2', name: 'Emp2' });
  store.setGroupPermissions(child.id, [{ module: 'tasks', action: 'create' }]);
  store.addGroupImplication(parent.id, child.id);

  const user = store.createUser({
    name: 'Sara', email: 'sara@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }],
    password: 'x',
  });
  store.assignUserToGroup(user.id, co.id, parent.id);

  const tuples = tuplesForStore(store);

  assert.ok(has(tuples, `user:${user.id}`, 'direct_member', `group:${parent.id}`),
    'missing membership tuple');
  assert.ok(has(tuples, `group:${parent.id}`, 'implied_by', `group:${child.id}`),
    'implication must point parent -> child so parent members inherit child grants');
  assert.ok(has(tuples, `group:${child.id}#member`, 'granted', permissionObject(co.id, 'tasks', 'create')),
    'missing grant tuple');
  assert.ok(has(tuples, `company:${co.id}`, 'owner', permissionObject(co.id, 'tasks', 'create')),
    'missing company ownership tuple');
});

test('the company ownership tuple is emitted once per permission object', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const g1 = store.createPermissionGroup({ companyId: co.id, key: 'x1', name: 'X1' });
  const g2 = store.createPermissionGroup({ companyId: co.id, key: 'x2', name: 'X2' });
  store.setGroupPermissions(g1.id, [{ module: 'tasks', action: 'create' }]);
  store.setGroupPermissions(g2.id, [{ module: 'tasks', action: 'create' }]);

  const object = permissionObject(co.id, 'tasks', 'create');
  const owners = tuplesForStore(store).filter(
    (t) => t.relation === 'owner' && t.object === object,
  );
  assert.equal(owners.length, 1, 'duplicate owner tuples would be a redundant write');
});

test('super admins get a company-level super_admin tuple', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const admin = store.createUser({
    name: 'Root', email: 'root@platform.test', role: 'Admin',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Admin' }],
    password: 'x', isSuperAdmin: true,
  });
  assert.ok(has(tuplesForStore(store), `user:${admin.id}`, 'super_admin', `company:${co.id}`));
});

test('a non-super-admin gets no super_admin tuple', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = store.createUser({
    name: 'Normal', email: 'normal@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }],
    password: 'x',
  });
  const tuples = tuplesForStore(store);
  assert.ok(!tuples.some((t) => t.relation === 'super_admin' && t.user === `user:${user.id}`));
});

test('every emitted tuple is well formed', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  store.createUser({
    name: 'Sara', email: 's@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }],
    password: 'x',
  });

  const tuples = tuplesForStore(store);
  assert.ok(tuples.length > 0);
  for (const t of tuples) {
    assert.match(t.user, /^(user|group|company):[^\s]+$/, `bad user: ${t.user}`);
    assert.match(t.object, /^(group|company|permission):[^\s]+$/, `bad object: ${t.object}`);
    assert.ok(!/\s/.test(t.relation), `bad relation: ${t.relation}`);
  }
});
