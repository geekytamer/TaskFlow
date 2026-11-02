const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const build = () => {
  const dir = makeTmpDir('taskflow-admin-');
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    // Share this test's connection: writes arrive through the server and are
    // read back through `store`, and two connections on one file make that
    // visibility question needlessly delicate.
    store,
    dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  });
  const server = app.listen(0);
  server.unref();
  const admin = store.listUsers().find((u) => u.role === 'Admin');
  const employee = store.listUsers().find((u) => u.role === 'Employee');
  const companyId = (admin.companyRoles?.[0]?.companyId) ?? admin.companyIds[0];
  return {
    app: server, store, admin, employee, companyId,
    adminAuth: `Bearer ${store.issueToken(admin.id)}`,
    employeeAuth: employee ? `Bearer ${store.issueToken(employee.id)}` : undefined,
  };
};

test('the catalogue lists modules with their actions', async () => {
  const { app, adminAuth } = build();
  const res = await request(app).get('/permissions/catalogue').set('Authorization', adminAuth);
  assert.equal(res.status, 200);
  assert.ok(res.body.modules.length >= 19);
  assert.ok(res.body.modules.every((m) => m.key && m.group && m.actions.length));
});

test('a user can read their own effective permissions', async () => {
  const { app, adminAuth, companyId, store, admin } = build();
  const res = await request(app)
    .get(`/auth/permissions?companyId=${companyId}`)
    .set('Authorization', adminAuth);
  assert.equal(res.status, 200);
  assert.equal(res.body.companyId, companyId);
  assert.ok(res.body.version > 0);
  assert.deepEqual(res.body.permissions, store.getEffectivePermissions(admin.id, companyId).sort());
});

test('the permission feed requires a companyId', async () => {
  const { app, adminAuth } = build();
  const res = await request(app).get('/auth/permissions').set('Authorization', adminAuth);
  assert.equal(res.status, 400);
});

test('a built-in group deleted in the old screen stays deleted: seeding does not bring it back', async () => {
  const { companyId, store } = build();
  const accountant = store.getPermissionGroupByKey(companyId, 'accountant');
  assert.equal(store.countGroupMembers(accountant.id), 0, 'fixture: Accountant starts empty');

  store.deletePermissionGroup(accountant.id); // data from before the old group screen was removed

  store.backfillPermissionGroups(); // what startup and authz:repair run
  assert.equal(store.getPermissionGroupByKey(companyId, 'accountant'), undefined);
  assert.equal(store.isRoleAvailable(companyId, 'Accountant'), false);
  assert.equal(store.isRoleAvailable(companyId, 'Manager'), true);
});

test('the permission feed says which engine decides, so the UI can match the server', async () => {
  const { app, adminAuth, companyId } = build();
  const res = await request(app).get(`/auth/permissions?companyId=${companyId}`).set('Authorization', adminAuth);
  assert.equal(res.status, 200);
  assert.equal(res.body.engine, process.env.PERMISSIONS_ENGINE || 'legacy');
  assert.ok(res.body.permissions.includes('settings:administration.write'));
});

test('editing an unrelated user field does not undo a deliberate role choice', () => {
  const { companyId, store, employee } = build();
  const bespoke = store.authz.saveRole(companyId, { name: 'Bespoke', grants: [{ key: 'inventory.view' }], fields: [] }, null);
  store.authz.setAssignments(employee.id, companyId, { mainRoleId: bespoke.id, addOnRoleIds: [] }, null);
  store.updateUser(employee.id, { name: 'Renamed Person' });
  assert.deepEqual(store.listUserGroupAssignments(employee.id, companyId).map((g) => g.name), ['Bespoke'],
    'renaming a user must not resurrect the standard role an admin replaced');
});

test('an actual role change still moves the user to the matching standard role', () => {
  const { companyId, store, employee } = build();
  const extra = store.authz.saveRole(companyId, { name: 'Extra', grants: [{ key: 'inventory.view' }], fields: [] }, null);
  store.authz.setAssignments(employee.id, companyId, { mainRoleId: extra.id, addOnRoleIds: [] }, null);
  store.updateUser(employee.id, { role: 'Manager', companyRoles: [{ companyId, role: 'Manager' }] });
  const main = store.authz.assignments(employee.id, companyId).find((a) => a.isMain);
  assert.equal(main.roleKey, 'manager', 'a real role change must apply the role');
});

test('a role whose built-in group was deleted cannot be newly assigned, but existing holders stay editable', async () => {
  const { app, adminAuth, companyId, store, employee } = build();
  const keeper = store.createUser({
    name: 'Keeps Role', email: 'keeps.role@taskflow.test', password: 'x', role: 'Accountant',
    companyIds: [companyId], companyRoles: [{ companyId, role: 'Accountant' }],
  });
  // Data from before the old group screen was removed: the Accountant group was deleted there.
  store.setUserGroups(keeper.id, companyId, [store.getPermissionGroupByKey(companyId, 'employee').id]);
  store.deletePermissionGroup(store.getPermissionGroupByKey(companyId, 'accountant').id);

  const renamed = await request(app).put(`/users/${keeper.id}`)
    .set('Authorization', adminAuth).send({ name: 'Keeps Role Renamed' });
  assert.equal(renamed.status, 200, 'an unchanged role must not block editing');

  const created = await request(app).post('/users').set('Authorization', adminAuth).send({
    name: 'Blocked Hire', email: 'blocked.hire@taskflow.test', password: 'password',
    role: 'Accountant', companyRoles: [{ companyId, role: 'Accountant' }],
  });
  assert.equal(created.status, 400);
  assert.match(created.body.message, /no longer offered/);

  const promoted = await request(app).put(`/users/${employee.id}`).set('Authorization', adminAuth)
    .send({ role: 'Accountant', companyRoles: [{ companyId, role: 'Accountant' }] });
  assert.equal(promoted.status, 400);
});
