const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { listRoutes, buildRouteListingApp } = require('../dist/scripts/list-routes');
const { ROUTES, routeDecl, DECLARATION_KINDS, HANDLER_CHECKED } = require('../dist/authz/route-registry');
const { OLD_TO_NEW, OLD_TO_FIELDS } = require('../dist/authz/legacy-map');
const { isPermissionKey, allPermissionKeys } = require('../dist/authz/catalogue');
const { templateGrants } = require('../dist/authz/templates');
const { allPermissions } = require('../dist/permissions/catalogue');
const { RECORD_RULES } = require('../dist/permissions/record-rules');
const { makeTmpDir } = require('./helpers/tmp');

const ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'];
const TEMPLATE_OF = { Admin: 'admin', Manager: 'manager', Accountant: 'accountant', Employee: 'employee' };
const id = (r) => `${r.method} ${r.path}`;

const MATRIX = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv'), 'utf8')
  .trim().split('\n').slice(1).map((line) => {
    // No field contains a comma; the roles field is quoted.
    const [method, route, module, action, roles] = line.split(',').map((c) => c.replace(/^"|"$/g, ''));
    return { method, path: route, old: `${module}:${action}`, roles: roles ? roles.split(' ').filter(Boolean) : [] };
  });

test('every route the app answers is declared exactly once, and every declaration is a real route', () => {
  const app = buildRouteListingApp(makeTmpDir('taskflow-route-registry-'));
  const live = listRoutes(app).map(id);
  assert.ok(live.length > 500, `expected the full route set, got ${live.length}`);

  const declared = ROUTES.map(id);
  const dupes = declared.filter((k, i) => declared.indexOf(k) !== i);
  assert.deepEqual(dupes, [], 'declared twice');

  const declaredSet = new Set(declared);
  const liveSet = new Set(live);
  const undeclared = live.filter((k) => !declaredSet.has(k));
  const stale = declared.filter((k) => !liveSet.has(k));
  assert.deepEqual(undeclared, [], `undeclared routes (${undeclared.length}):\n${undeclared.join('\n')}`);
  assert.deepEqual(stale, [], `declared but not routed (${stale.length}):\n${stale.join('\n')}`);
});

test('every declaration names a catalogue permission or a declaration kind, with sound legacy roles', () => {
  for (const d of ROUTES) {
    assert.ok(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(d.method), id(d));
    assert.ok(isPermissionKey(d.permission) || DECLARATION_KINDS.includes(d.permission), `${id(d)}: ${d.permission}`);
    if (d.legacyRoles) {
      assert.ok(d.legacyRoles.length > 0, `${id(d)}: empty legacyRoles`);
      for (const r of d.legacyRoles) assert.ok(ROLES.includes(r), `${id(d)}: role ${r}`);
    }
    if (['public', 'self', 'portal', 'super_admin'].includes(d.permission)) {
      assert.equal(d.legacyRoles, undefined, `${id(d)}: ${d.permission} routes are not role-gated`);
    }
    if (d.permission === 'per_record') assert.ok(d.note, `${id(d)}: per_record needs a note saying how`);
  }
  assert.equal(routeDecl('get', '/companies/:companyId/sales-orders')?.permission, 'sales.view');
  assert.equal(routeDecl('GET', '/no/such/route'), undefined);
});

test('legacy roles copy the gate matrix, except where a note says why', () => {
  for (const row of MATRIX) {
    const d = routeDecl(row.method, row.path);
    assert.ok(d, `matrix route ${row.method} ${row.path} not declared`);
    if (!row.roles.length) continue;
    const same = d.legacyRoles && [...d.legacyRoles].sort().join() === [...row.roles].sort().join();
    assert.ok(same || d.note, `${id(d)}: legacyRoles ${d.legacyRoles} vs matrix ${row.roles} with no note`);
  }
});

test('equivalence: every system template answers each role-gated route exactly as the legacy role list', () => {
  const diffs = [];
  for (const d of ROUTES) {
    if (!d.legacyRoles || !isPermissionKey(d.permission)) continue;
    for (const role of ROLES) {
      const legacy = d.legacyRoles.includes(role);
      const now = templateGrants(TEMPLATE_OF[role], d.permission) !== undefined;
      if (legacy !== now) diffs.push({ route: id(d), permission: d.permission, role, legacy, template: now });
    }
  }
  if (diffs.length) console.table(diffs);
  assert.equal(diffs.length, 0, `${diffs.length} differences between templates and legacy roles`);
});

test('every catalogue action is enforced by a route or named as checked inside a handler', () => {
  const used = new Set(ROUTES.map((d) => d.permission));
  for (const key of Object.keys(HANDLER_CHECKED)) assert.ok(isPermissionKey(key), `HANDLER_CHECKED ${key}`);
  const orphans = allPermissionKeys().filter((k) => !used.has(k) && !(k in HANDLER_CHECKED));
  assert.deepEqual(orphans, [], 'catalogue actions no route enforces');
});

test('OLD_TO_NEW maps every old permission to new catalogue keys', () => {
  assert.deepEqual(Object.keys(OLD_TO_NEW).sort(), allPermissions().sort());
  for (const [old, keys] of Object.entries(OLD_TO_NEW)) {
    assert.ok(keys.length > 0 || (OLD_TO_FIELDS[old] ?? []).length > 0, `${old} maps to nothing`);
    for (const k of keys) assert.ok(isPermissionKey(k), `${old} → unknown ${k}`);
  }
  // Each record rule maps to the keys it feeds.
  const rule = (name) => OLD_TO_NEW[`${RECORD_RULES[name].module}:${RECORD_RULES[name].action}`];
  assert.ok(rule('PORTAL_ACCESS_MANAGE').includes('influencers.review'));
  assert.ok(rule('ADMINISTRATION').includes('settings.manage_approvals'));
  assert.ok(rule('CRM_ALL_WRITE').includes('crm.delete'));
  assert.ok(rule('GAMES_MANAGE').includes('games.view'));
});

test('a converted permission group keeps every route its old permission opened', () => {
  // Task 3 converts custom groups with OLD_TO_NEW: nobody may lose a route they have today.
  const lost = [];
  for (const row of MATRIX) {
    if (!(row.old in OLD_TO_NEW)) continue; // ungated modules (auth, public, ...) were never grantable
    const d = routeDecl(row.method, row.path);
    if (!isPermissionKey(d.permission)) continue;
    // A handler that also demanded more than the matrix gate (noted, stricter legacyRoles) was never opened by the old key alone.
    if (row.roles.length && [...d.legacyRoles].sort().join() !== [...row.roles].sort().join()) continue;
    if (!OLD_TO_NEW[row.old].includes(d.permission)) lost.push(`${id(d)}: ${row.old} → ${OLD_TO_NEW[row.old]} lacks ${d.permission}`);
  }
  assert.deepEqual(lost, []);
});
