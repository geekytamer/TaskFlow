const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-permstore-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

/**
 * Detaches the built-in role group that createUser assigns automatically, so a
 * test can measure only the custom group it set up.
 */
const isolate = (store, user, companyId) => {
  for (const group of store.listUserGroupAssignments(user.id, companyId)) {
    if (group.isSystem) store.removeUserFromGroup(user.id, companyId, group.id);
  }
};

const makeUser = (store, companyIds, role, email) =>
  store.createUser({
    name: email,
    email,
    role,
    companyIds,
    companyRoles: companyIds.map((companyId) => ({ companyId, role })),
    password: 'x',
  });

test('a group grants exactly the permissions it is given', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const group = store.createPermissionGroup({ companyId: co.id, key: 'clerk', name: 'Clerk' });
  store.setGroupPermissions(group.id, [
    { module: 'invoices', action: 'read' },
    { module: 'invoices', action: 'create' },
  ]);
  const user = makeUser(store, [co.id], 'Employee', 'sara@acme.test');
  isolate(store, user, co.id);
  store.assignUserToGroup(user.id, co.id, group.id);

  assert.deepEqual(
    store.getEffectivePermissions(user.id, co.id).sort(),
    ['invoices:create', 'invoices:read'],
  );
});

test('a user with no group assignment has no permissions', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [co.id], 'Employee', 'nobody@acme.test');
  isolate(store, user, co.id);
  assert.deepEqual(store.getEffectivePermissions(user.id, co.id), []);
});

test('permissions are inherited transitively through implications', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const base = store.createPermissionGroup({ companyId: co.id, key: 'base', name: 'Base' });
  const mid = store.createPermissionGroup({ companyId: co.id, key: 'mid', name: 'Mid' });
  const top = store.createPermissionGroup({ companyId: co.id, key: 'top', name: 'Top' });

  store.setGroupPermissions(base.id, [{ module: 'invoices', action: 'read' }]);
  store.setGroupPermissions(mid.id, [{ module: 'invoices', action: 'create' }]);
  store.setGroupPermissions(top.id, [{ module: 'invoices', action: 'delete' }]);

  store.addGroupImplication(top.id, mid.id);
  store.addGroupImplication(mid.id, base.id);

  const user = makeUser(store, [co.id], 'Manager', 'ali@acme.test');
  isolate(store, user, co.id);
  store.assignUserToGroup(user.id, co.id, top.id);

  assert.deepEqual(
    store.getEffectivePermissions(user.id, co.id).sort(),
    ['invoices:create', 'invoices:delete', 'invoices:read'],
  );
});

test('inheritance does not flow upward from child to parent', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const parent = store.createPermissionGroup({ companyId: co.id, key: 'p', name: 'Parent' });
  const child = store.createPermissionGroup({ companyId: co.id, key: 'c', name: 'Child' });
  store.setGroupPermissions(parent.id, [{ module: 'settings', action: 'write' }]);
  store.setGroupPermissions(child.id, [{ module: 'tasks', action: 'create' }]);
  store.addGroupImplication(parent.id, child.id);

  const user = makeUser(store, [co.id], 'Employee', 'child@acme.test');
  isolate(store, user, co.id);
  store.assignUserToGroup(user.id, co.id, child.id);

  assert.deepEqual(store.getEffectivePermissions(user.id, co.id), ['tasks:create'],
    'a child group member must not inherit the parent group rights');
});

test('an implication cycle terminates instead of hanging', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const a = store.createPermissionGroup({ companyId: co.id, key: 'a', name: 'A' });
  const b = store.createPermissionGroup({ companyId: co.id, key: 'b', name: 'B' });
  store.setGroupPermissions(a.id, [{ module: 'tasks', action: 'create' }]);
  store.addGroupImplication(a.id, b.id);
  store.addGroupImplication(b.id, a.id);

  const user = makeUser(store, [co.id], 'Employee', 'cycle@acme.test');
  isolate(store, user, co.id);
  store.assignUserToGroup(user.id, co.id, a.id);

  assert.deepEqual(store.getEffectivePermissions(user.id, co.id), ['tasks:create']);
});

test('permissions do not leak across companies', () => {
  const store = freshStore();
  const co1 = store.createCompany({ name: 'One', website: '', address: '' });
  const co2 = store.createCompany({ name: 'Two', website: '', address: '' });
  const g1 = store.createPermissionGroup({ companyId: co1.id, key: 'clerk', name: 'Clerk' });
  store.setGroupPermissions(g1.id, [{ module: 'invoices', action: 'read' }]);

  const user = makeUser(store, [co1.id, co2.id], 'Employee', 'multi@acme.test');
  isolate(store, user, co1.id);
  isolate(store, user, co2.id);
  store.assignUserToGroup(user.id, co1.id, g1.id);

  assert.deepEqual(store.getEffectivePermissions(user.id, co1.id), ['invoices:read']);
  assert.deepEqual(store.getEffectivePermissions(user.id, co2.id), []);
});

test('setGroupPermissions replaces rather than accumulates', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const g = store.createPermissionGroup({ companyId: co.id, key: 'g', name: 'G' });
  store.setGroupPermissions(g.id, [{ module: 'invoices', action: 'read' }]);
  store.setGroupPermissions(g.id, [{ module: 'tasks', action: 'create' }]);

  const user = makeUser(store, [co.id], 'Employee', 'replace@acme.test');
  isolate(store, user, co.id);
  store.assignUserToGroup(user.id, co.id, g.id);
  assert.deepEqual(store.getEffectivePermissions(user.id, co.id), ['tasks:create']);
});

test('bumpAuthzVersion increases monotonically and every mutation bumps it', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });

  const v0 = store.getAuthzVersion();
  const g = store.createPermissionGroup({ companyId: co.id, key: 'g', name: 'G' });
  assert.ok(store.getAuthzVersion() > v0, 'creating a group must bump the version');

  const v1 = store.getAuthzVersion();
  store.setGroupPermissions(g.id, [{ module: 'tasks', action: 'create' }]);
  assert.ok(store.getAuthzVersion() > v1, 'changing grants must bump the version');

  const v2 = store.getAuthzVersion();
  const user = makeUser(store, [co.id], 'Employee', 'bump@acme.test');
  store.assignUserToGroup(user.id, co.id, g.id);
  assert.ok(store.getAuthzVersion() > v2, 'assigning a user must bump the version');
});

test('listPermissionGroups returns only the requested company groups', () => {
  const store = freshStore();
  const co1 = store.createCompany({ name: 'One', website: '', address: '' });
  const co2 = store.createCompany({ name: 'Two', website: '', address: '' });
  store.createPermissionGroup({ companyId: co1.id, key: 'a', name: 'A' });
  store.createPermissionGroup({ companyId: co2.id, key: 'b', name: 'B' });

  const custom = store.listPermissionGroups(co1.id).filter((g) => !g.isSystem);
  assert.deepEqual(custom.map((g) => g.key), ['a']);
  assert.equal(store.listPermissionGroups(co1.id).length, 5, 'four built-ins plus the custom one');
});
