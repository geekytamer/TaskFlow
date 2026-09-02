const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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
    dbPath, seedOnEmpty: false, allowSeedReset: false,
    authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  });
  const admin = store.listUsers().find((u) => u.role === 'Admin');
  const employee = store.listUsers().find((u) => u.role === 'Employee');
  const companyId = (admin.companyRoles?.[0]?.companyId) ?? admin.companyIds[0];
  return {
    app, store, admin, employee, companyId,
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

test('listing groups returns the four built-ins with member counts', async () => {
  const { app, adminAuth, companyId } = build();
  const res = await request(app)
    .get(`/companies/${companyId}/permission-groups`).set('Authorization', adminAuth);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((g) => g.key).sort(), ['accountant', 'admin', 'employee', 'manager']);
  assert.ok(res.body.every((g) => g.isSystem === true));
  assert.ok(res.body.find((g) => g.key === 'admin').memberCount >= 1);
  assert.ok(res.body.find((g) => g.key === 'admin').permissions.length > 0);
});

test('an admin can create a group and grant it permissions', async () => {
  const { app, adminAuth, companyId } = build();
  const created = await request(app)
    .post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth)
    .send({ name: 'Warehouse Clerk', nameAr: 'أمين المخزن' });
  assert.equal(created.status, 201);
  assert.equal(created.body.key, 'warehouse-clerk');
  assert.equal(created.body.isSystem, 0);

  const granted = await request(app)
    .put(`/permission-groups/${created.body.id}/permissions`)
    .set('Authorization', adminAuth)
    .send({ permissions: ['inventory:read', 'inventory:create'] });
  assert.equal(granted.status, 200);
  assert.deepEqual(granted.body.permissions.sort(), ['inventory:create', 'inventory:read']);
});

test('an unknown permission is rejected rather than stored', async () => {
  const { app, adminAuth, companyId } = build();
  const created = await request(app)
    .post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Bogus' });

  const res = await request(app)
    .put(`/permission-groups/${created.body.id}/permissions`)
    .set('Authorization', adminAuth)
    .send({ permissions: ['inventory:teleport'] });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Unknown permission/);
});

test('duplicate group keys are rejected', async () => {
  const { app, adminAuth, companyId } = build();
  await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Dispatch' });
  const second = await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Dispatch' });
  assert.equal(second.status, 409);
});

test('built-in groups cannot be deleted', async () => {
  const { app, adminAuth, companyId, store } = build();
  const builtIn = store.getPermissionGroupByKey(companyId, 'manager');
  const res = await request(app)
    .delete(`/permission-groups/${builtIn.id}`).set('Authorization', adminAuth);
  assert.equal(res.status, 409);
  assert.match(res.body.message, /Built-in groups cannot be deleted/);
});

test('a group with members cannot be deleted without force', async () => {
  const { app, adminAuth, companyId, store, employee } = build();
  const created = await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Temp Group' });
  store.assignUserToGroup(employee.id, companyId, created.body.id);

  const blocked = await request(app)
    .delete(`/permission-groups/${created.body.id}`).set('Authorization', adminAuth);
  assert.equal(blocked.status, 409);

  const forced = await request(app)
    .delete(`/permission-groups/${created.body.id}?force=true`).set('Authorization', adminAuth);
  assert.equal(forced.status, 204);
});

test('inheritance can be set and is reflected in effective permissions', async () => {
  const { app, adminAuth, companyId, store, employee } = build();
  const child = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Base Access' })).body;
  const parent = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Senior Access' })).body;

  await request(app).put(`/permission-groups/${child.id}/permissions`)
    .set('Authorization', adminAuth).send({ permissions: ['inventory:read'] });
  await request(app).put(`/permission-groups/${parent.id}/permissions`)
    .set('Authorization', adminAuth).send({ permissions: ['inventory:delete'] });

  const implied = await request(app).put(`/permission-groups/${parent.id}/implications`)
    .set('Authorization', adminAuth).send({ impliedGroupIds: [child.id] });
  assert.equal(implied.status, 200);

  store.setUserGroups(employee.id, companyId, [parent.id]);
  assert.deepEqual(
    store.getEffectivePermissions(employee.id, companyId).sort(),
    ['inventory:delete', 'inventory:read'],
  );
});

test('a group cannot inherit from itself', async () => {
  const { app, adminAuth, companyId } = build();
  const g = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Selfish' })).body;
  const res = await request(app).put(`/permission-groups/${g.id}/implications`)
    .set('Authorization', adminAuth).send({ impliedGroupIds: [g.id] });
  assert.equal(res.status, 400);
});

test('a group cannot inherit from another company group', async () => {
  const { app, adminAuth, companyId, store } = build();
  const other = store.listCompanies().find((c) => c.id !== companyId);
  const foreign = store.getPermissionGroupByKey(other.id, 'manager');
  const g = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Crosser' })).body;

  const res = await request(app).put(`/permission-groups/${g.id}/implications`)
    .set('Authorization', adminAuth).send({ impliedGroupIds: [foreign.id] });
  assert.equal(res.status, 400);
});

test('an admin cannot strip their own administrative access', async () => {
  const { app, adminAuth, companyId, admin, store } = build();
  const employeeGroup = store.getPermissionGroupByKey(companyId, 'employee');
  const res = await request(app)
    .put(`/companies/${companyId}/users/${admin.id}/groups`)
    .set('Authorization', adminAuth)
    .send({ groupIds: [employeeGroup.id] });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /your own administrative access/);
});

test('a non-admin cannot create groups', async () => {
  const ctx = build();
  if (!ctx.employeeAuth) return;
  const res = await request(ctx.app)
    .post(`/companies/${ctx.companyId}/permission-groups`)
    .set('Authorization', ctx.employeeAuth)
    .send({ name: 'Sneaky' });
  assert.equal(res.status, 403);
});

test('group assignments can be replaced wholesale', async () => {
  const { app, adminAuth, companyId, store, employee } = build();
  const g = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Replacement' })).body;
  await request(app).put(`/permission-groups/${g.id}/permissions`)
    .set('Authorization', adminAuth).send({ permissions: ['inventory:read'] });

  const res = await request(app)
    .put(`/companies/${companyId}/users/${employee.id}/groups`)
    .set('Authorization', adminAuth).send({ groupIds: [g.id] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.groups.map((x) => x.key), ['replacement']);
  assert.deepEqual(store.getEffectivePermissions(employee.id, companyId), ['inventory:read']);
});

test('a rejected lockout change is not persisted', async () => {
  const { app, adminAuth, companyId, store, admin } = build();
  const employeeGroup = store.getPermissionGroupByKey(companyId, 'employee');
  const before = store.listUserGroupAssignments(admin.id, companyId).map((g) => g.key).sort();

  const res = await request(app)
    .put(`/companies/${companyId}/users/${admin.id}/groups`)
    .set('Authorization', adminAuth)
    .send({ groupIds: [employeeGroup.id] });
  assert.equal(res.status, 409);

  const after = store.listUserGroupAssignments(admin.id, companyId).map((g) => g.key).sort();
  assert.deepEqual(after, before,
    'a refused change must leave the database untouched, not save and then complain');
});

test('stripping the last admin-capable user is refused and rolled back', async () => {
  const { app, adminAuth, companyId, store } = build();
  // A group that grants nothing, applied to every non-super-admin in the company.
  const empty = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', adminAuth).send({ name: 'Nothing' })).body;

  const holders = store.listUsersByCompany(companyId).filter((u) => !u.isSuperAdmin);
  assert.ok(holders.length > 0);

  let refusedAtLeastOnce = false;
  for (const user of holders) {
    const before = store.getEffectivePermissions(user.id, companyId).length;
    const res = await request(app)
      .put(`/companies/${companyId}/users/${user.id}/groups`)
      .set('Authorization', adminAuth)
      .send({ groupIds: [empty.id] });
    if (res.status === 409) {
      refusedAtLeastOnce = true;
      assert.equal(store.getEffectivePermissions(user.id, companyId).length, before,
        'the refused change must have been rolled back');
    }
  }
  assert.ok(refusedAtLeastOnce, 'emptying every user must eventually hit the lockout guard');
});

test('the company-lockout guard rolls back rather than saving and complaining', async () => {
  const { app, companyId, store } = build();

  // A super-admin can strip other people's groups without tripping the
  // self-lockout pre-check, which is the only path that reaches the
  // company-wide guard.
  const root = store.createUser({
    name: 'Root', email: 'root@platform.test', role: 'Admin',
    companyIds: [companyId], companyRoles: [{ companyId, role: 'Admin' }],
    password: 'x', isSuperAdmin: true,
  });
  const rootAuth = `Bearer ${store.issueToken(root.id)}`;
  const empty = (await request(app).post(`/companies/${companyId}/permission-groups`)
    .set('Authorization', rootAuth).send({ name: 'Void' })).body;

  const guarded = ['settings:write', 'settings:users.read'];
  const holders = store.listUsersByCompany(companyId).filter((u) => {
    if (u.isSuperAdmin) return false;
    const perms = new Set(store.getEffectivePermissions(u.id, companyId));
    return guarded.every((p) => perms.has(p));
  });
  assert.ok(holders.length > 0, 'need at least one admin-capable user to strip');

  let sawRefusal = false;
  for (const user of holders) {
    const before = store.getEffectivePermissions(user.id, companyId).sort();
    const res = await request(app)
      .put(`/companies/${companyId}/users/${user.id}/groups`)
      .set('Authorization', rootAuth)
      .send({ groupIds: [empty.id] });

    if (res.status === 409) {
      sawRefusal = true;
      assert.deepEqual(
        store.getEffectivePermissions(user.id, companyId).sort(), before,
        'a refused change must be rolled back, not committed before the guard runs',
      );
    } else {
      assert.equal(res.status, 200);
    }
  }
  assert.ok(sawRefusal, 'stripping every admin-capable user must trip the lockout guard');
});
