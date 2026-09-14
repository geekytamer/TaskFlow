const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { RECORD_RULES } = require('../dist/permissions/record-rules');
const { isValidPermission } = require('../dist/permissions/catalogue');
const { SEED_MATRIX } = require('../dist/permissions/seed-matrix');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const ROLES = ['Admin', 'Manager', 'Employee', 'Accountant'];
const key = (rule) => `${rule.module}:${rule.action}`;

test('every record rule is grantable and seeded for exactly the roles that held it', () => {
  for (const [name, rule] of Object.entries(RECORD_RULES)) {
    assert.ok(isValidPermission(rule.module, rule.action), `${name} is not in the catalogue`);
    for (const role of ROLES) {
      assert.equal(SEED_MATRIX[role].includes(key(rule)), rule.roles.includes(role), `${name} seeded wrongly for ${role}`);
    }
  }
});

test('no record rule reuses a permission a gate already enforces', () => {
  const csv = path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  const gated = new Set(fs.readFileSync(csv, 'utf8').trim().split('\n').slice(1)
    .map((line) => line.split(',')).filter((cols) => cols[6] !== 'none').map((cols) => `${cols[2]}:${cols[3]}`));
  for (const [name, rule] of Object.entries(RECORD_RULES)) {
    assert.equal(gated.has(key(rule)), false, `${name} collides with a gate permission`);
  }
});

test('built-in users hold each rule exactly when their role held it', () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-rules-'), 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Rules Co', website: '', address: '' });
  for (const role of ROLES) {
    const user = store.createUser({
      name: role, email: `${role.toLowerCase()}@rules.test`, password: 'x', role,
      companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
    });
    const held = new Set(store.getEffectivePermissions(user.id, company.id));
    for (const [name, rule] of Object.entries(RECORD_RULES)) {
      assert.equal(held.has(key(rule)), rule.roles.includes(role), `${role} ${name}`);
    }
  }
});

test('migration 081 grants the rules to existing built-in groups, and skips deleted ones', () => {
  const dbPath = path.join(makeTmpDir('taskflow-rules-migration-'), 'taskflow.db');
  const first = new DataStore({ dbPath, seedOnEmpty: false });
  const company = first.createCompany({ name: 'Older Co', website: '', address: '' });
  first.deletePermissionGroup(first.getPermissionGroupByKey(company.id, 'accountant').id);

  // Recreate a database from before migration 081.
  const raw = new Database(dbPath);
  for (const rule of Object.values(RECORD_RULES)) {
    raw.prepare('DELETE FROM group_permissions WHERE module = ? AND action = ?').run(rule.module, rule.action);
  }
  raw.prepare("DELETE FROM schema_migrations WHERE id = '081_record_rule_permissions'").run();
  raw.close();

  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  const manager = reopened.listGroupPermissions(reopened.getPermissionGroupByKey(company.id, 'manager').id);
  assert.ok(manager.includes('crm:all.read'));
  assert.ok(manager.includes('dashboard:operations.read'));
  assert.equal(manager.includes('dashboard:finance.read'), false);
  const employee = reopened.listGroupPermissions(reopened.getPermissionGroupByKey(company.id, 'employee').id);
  assert.equal(employee.some((p) => Object.values(RECORD_RULES).some((r) => key(r) === p)), false);
  assert.equal(reopened.getPermissionGroupByKey(company.id, 'accountant'), undefined);
});

test('every rule declared is enforced somewhere', () => {
  const read = (...parts) => require('node:fs').readFileSync(path.join(__dirname, '..', 'src', ...parts), 'utf8');
  const enforcing = read('server.ts') + read('permissions', 'routes.ts');
  for (const name of Object.keys(RECORD_RULES)) {
    assert.ok(enforcing.includes(`'${name}'`), `${name} is declared but nothing checks it`);
  }
});
