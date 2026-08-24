const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { SEED_MATRIX } = require('../dist/permissions/seed-matrix');

const seededStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-backfill-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: true });
};

test('every company receives the four built-in groups as system groups', () => {
  const store = seededStore();
  const companies = store.listCompanies();
  assert.ok(companies.length > 0, 'seed must produce at least one company');
  for (const company of companies) {
    const groups = store.listPermissionGroups(company.id);
    assert.deepEqual(groups.map((g) => g.key).sort(),
      ['accountant', 'admin', 'employee', 'manager']);
    assert.ok(groups.every((g) => g.isSystem === 1), 'built-ins must be system groups');
  }
});

test('each seeded user gets the group matching their legacy role, in every company', () => {
  const store = seededStore();
  const users = store.listUsers();
  assert.ok(users.length > 0);

  for (const user of users) {
    const assignments = user.companyRoles?.length
      ? user.companyRoles
      : (user.companyIds || []).map((companyId) => ({ companyId, role: user.role }));

    for (const { companyId, role } of assignments) {
      const actual = store.getEffectivePermissions(user.id, companyId).sort();
      const expected = [...SEED_MATRIX[role]].sort();
      assert.deepEqual(actual, expected,
        `${user.email} (${role} in ${companyId}) does not match the seed matrix`);
    }
  }
});

test('no user is left without a group assignment', () => {
  const store = seededStore();
  for (const user of store.listUsers()) {
    const companyIds = user.companyRoles?.length
      ? user.companyRoles.map((r) => r.companyId)
      : (user.companyIds || []);
    for (const companyId of companyIds) {
      assert.ok(store.listUserGroupAssignments(user.id, companyId).length > 0,
        `${user.email} has no group in ${companyId} and would lose access at cutover`);
    }
  }
});

test('backfill leaves the legacy role columns untouched', () => {
  const store = seededStore();
  for (const user of store.listUsers()) {
    assert.ok(user.role, 'users.role must survive the backfill');
    assert.ok(Array.isArray(user.companyIds), 'users.companyIds must survive the backfill');
  }
});

test('backfill is idempotent across a second migration run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-backfill-'));
  const dbPath = path.join(dir, 'taskflow.db');
  const first = new DataStore({ dbPath, seedOnEmpty: true });
  const company = first.listCompanies()[0];
  const user = first.listUsers()[0];
  const groupsBefore = first.listPermissionGroups(company.id).length;
  const permsBefore = first.getEffectivePermissions(user.id, company.id).length;

  const second = new DataStore({ dbPath, seedOnEmpty: false });
  assert.equal(second.listPermissionGroups(company.id).length, groupsBefore);
  assert.equal(second.getEffectivePermissions(user.id, company.id).length, permsBefore);
});

test('a company created after the migration still gets its built-in groups', () => {
  const store = seededStore();
  const co = store.createCompany({ name: 'Later Co', website: '', address: '' });
  assert.deepEqual(store.listPermissionGroups(co.id).map((g) => g.key).sort(),
    ['accountant', 'admin', 'employee', 'manager'],
    'new companies must be seeded too, or their users get nothing');
});

test('a user created after the migration is assigned their role group', () => {
  const store = seededStore();
  const co = store.listCompanies()[0];
  const user = store.createUser({
    name: 'New Hire', email: 'newhire@acme.test', role: 'Accountant',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Accountant' }],
    password: 'x',
  });
  assert.deepEqual(
    store.getEffectivePermissions(user.id, co.id).sort(),
    [...SEED_MATRIX.Accountant].sort(),
  );
});

test('changing a user role moves them to the matching group', () => {
  const store = seededStore();
  const co = store.listCompanies()[0];
  const user = store.createUser({
    name: 'Promotee', email: 'promotee@acme.test', role: 'Employee',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Employee' }],
    password: 'x',
  });
  assert.deepEqual(store.getEffectivePermissions(user.id, co.id).sort(),
    [...SEED_MATRIX.Employee].sort());

  store.updateUser(user.id, {
    role: 'Manager',
    companyRoles: [{ companyId: co.id, role: 'Manager' }],
  });

  assert.deepEqual(store.getEffectivePermissions(user.id, co.id).sort(),
    [...SEED_MATRIX.Manager].sort(),
    'a promoted user must not keep their old group as well');
});

test('deleting a user removes their group assignments', () => {
  const store = seededStore();
  const co = store.listCompanies()[0];
  const user = store.createUser({
    name: 'Leaver', email: 'leaver@acme.test', role: 'Employee',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Employee' }],
    password: 'x',
  });
  assert.ok(store.listUserGroupAssignments(user.id, co.id).length > 0);
  store.deleteUser(user.id);
  assert.equal(store.listUserGroupAssignments(user.id, co.id).length, 0);
});
