const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { isValidPermission } = require('../dist/permissions/catalogue');

const ROLES = ['Admin', 'Manager', 'Employee', 'Accountant'];

const matrixRows = () => {
  const csvPath = path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  return fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1)
    .map((line) => {
      const [method, route, module, action, roles, lineNo, gate] = line.split(',');
      return {
        method, route, module, action, gate, line: lineNo,
        roles: roles.replace(/"/g, '').split(' ').filter(Boolean),
      };
    })
    .filter((row) => row.gate !== 'none');
};

/**
 * The backbone of the migration. For every gated route and every role, the
 * group system must answer exactly what the legacy role check answers today.
 * A failure here means somebody's access would change at cutover.
 */
test('for every gated route and every role, group permissions match legacy roles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-equiv-'));
  const store = new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Equivalence Co', website: '', address: '' });

  const users = {};
  for (const role of ROLES) {
    users[role] = store.createUser({
      name: role,
      email: `${role.toLowerCase()}@equiv.test`,
      role,
      companyIds: [company.id],
      companyRoles: [{ companyId: company.id, role }],
      password: 'x',
    });
  }

  // One resolve per role, not per row — the answer cannot change mid-test.
  const effective = {};
  for (const role of ROLES) {
    effective[role] = new Set(store.getEffectivePermissions(users[role].id, company.id));
  }

  const rows = matrixRows();
  assert.ok(rows.length > 200, `expected the full matrix, got ${rows.length} rows`);

  const mismatches = [];
  for (const row of rows) {
    if (!isValidPermission(row.module, row.action)) {
      mismatches.push(`${row.module}:${row.action} not in catalogue (${row.route})`);
      continue;
    }
    for (const role of ROLES) {
      const legacyAllowed = row.roles.includes(role);
      const newAllowed = effective[role].has(`${row.module}:${row.action}`);
      if (legacyAllowed !== newAllowed) {
        mismatches.push(
          `${row.method} ${row.route} [${role}] legacy=${legacyAllowed} new=${newAllowed} (server.ts:${row.line})`,
        );
      }
    }
  }

  assert.deepEqual(mismatches, [],
    `${mismatches.length} divergences between legacy roles and group permissions:\n` +
    mismatches.slice(0, 40).join('\n'));
});

test('the four built-in groups differ from each other', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-equiv-'));
  const store = new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Distinct Co', website: '', address: '' });

  const sizes = {};
  for (const role of ROLES) {
    const user = store.createUser({
      name: role, email: `${role.toLowerCase()}@distinct.test`, role,
      companyIds: [company.id], companyRoles: [{ companyId: company.id, role }], password: 'x',
    });
    sizes[role] = store.getEffectivePermissions(user.id, company.id).length;
  }

  // A backfill bug that granted everyone the same set would still pass the
  // equivalence test if the matrix were empty, so pin the shape too.
  assert.ok(sizes.Admin > sizes.Employee, 'Admin must outrank Employee');
  assert.ok(sizes.Manager > sizes.Employee, 'Manager must outrank Employee');
  assert.ok(sizes.Employee > 0, 'Employee must retain some access');
});
