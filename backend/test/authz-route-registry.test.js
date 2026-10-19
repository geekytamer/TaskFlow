const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { listRoutes, buildRouteListingApp } = require('../dist/scripts/list-routes');
const { ROUTES, routeDecl, DECLARATION_KINDS, HANDLER_CHECKED, RULE_CALL_SITES } = require('../dist/authz/route-registry');
const { OLD_TO_NEW, OLD_TO_FIELDS, OLD_RULE_SCOPES } = require('../dist/authz/legacy-map');
const { isPermissionKey, allPermissionKeys, findAction, SENSITIVE_FIELDS } = require('../dist/authz/catalogue');
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
    return { method, path: route, old: `${module}:${action}`, roles: roles ? roles.split(' ').filter(Boolean) : [], gated: line.split(',')[6] !== 'none' };
  });

test('every route the app answers is declared exactly once, and every declaration is a real route', () => {
  const app = buildRouteListingApp(makeTmpDir('taskflow-route-registry-'));
  const live = listRoutes(app).map(id);
  assert.ok(live.length > 500, `expected the full route set, got ${live.length}`);
  const registeredTwice = live.filter((k, i) => live.indexOf(k) !== i);
  assert.deepEqual(registeredTwice, [], 'registered twice in Express (only the first answers)');

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

test('legacy roles copy the gate matrix, except declarations marked legacyOverride', () => {
  const sameRoles = (x, y) => [...x].sort().join() === [...y].sort().join();
  const overridden = [];
  for (const row of MATRIX) {
    const d = routeDecl(row.method, row.path);
    assert.ok(d, `matrix route ${row.method} ${row.path} not declared`);
    const differs = row.roles.length
      ? !d.legacyRoles || !sameRoles(d.legacyRoles, row.roles)
      : d.legacyRoles !== undefined; // hand-read roles on a route the matrix saw as ungated
    if (differs) {
      assert.equal(d.legacyOverride, true, `${id(d)}: legacyRoles ${d.legacyRoles} vs matrix ${row.roles} without legacyOverride`);
      overridden.push(id(d));
    } else {
      assert.equal(d.legacyOverride, undefined, `${id(d)}: legacyOverride but no difference from the matrix`);
    }
  }
  for (const d of ROUTES.filter((r) => r.legacyOverride)) assert.ok(d.note, `${id(d)}: legacyOverride needs a note saying why`);
  assert.deepEqual(overridden.sort(), [
    'DELETE /users/:id',
    'POST /users',
    'PUT /companies/:companyId/approvals/rules',
  ]);
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

test('every old permission is converted by exactly one table', () => {
  const tables = [OLD_TO_NEW, OLD_RULE_SCOPES, OLD_TO_FIELDS].map((t) => Object.keys(t));
  const all = tables.flat();
  assert.equal(new Set(all).size, all.length, 'an old permission is in two tables');
  assert.deepEqual([...all].sort(), allPermissions().sort());
  for (const [old, keys] of Object.entries(OLD_TO_NEW)) {
    assert.ok(keys.length > 0, `${old} maps to nothing`);
    for (const k of keys) assert.ok(isPermissionKey(k), `${old} → unknown ${k}`);
  }
  for (const [old, { keys, scope }] of Object.entries(OLD_RULE_SCOPES)) {
    assert.equal(scope, 'company', old);
    for (const k of keys) assert.ok(findAction(k)?.action.scoped, `${old}: ${k} is not a scoped action`);
  }
  const fieldKeys = SENSITIVE_FIELDS.map((f) => f.key);
  for (const [old, fields] of Object.entries(OLD_TO_FIELDS)) for (const f of fields) assert.ok(fieldKeys.includes(f), `${old}: ${f}`);
  // Each record rule lands where it feeds.
  const oldKey = (name) => `${RECORD_RULES[name].module}:${RECORD_RULES[name].action}`;
  assert.ok(OLD_TO_NEW[oldKey('PORTAL_ACCESS_MANAGE')].includes('influencers.review'));
  assert.ok(OLD_TO_NEW[oldKey('ADMINISTRATION')].includes('settings.manage_approvals'));
  assert.ok(OLD_TO_NEW[oldKey('GAMES_MANAGE')].includes('games.view'));
  assert.ok(OLD_RULE_SCOPES[oldKey('CRM_ALL_WRITE')].keys.includes('crm.delete'));
  assert.ok(OLD_RULE_SCOPES[oldKey('TASKS_ALL_READ')].keys.includes('tasks.edit'));
  // Scope rules never appear as grants.
  for (const name of ['TASKS_ALL_READ', 'CRM_ALL_WRITE', 'CONTACTS_PRIVATE_READ', 'WHATSAPP_PRIVATE_READ']) {
    assert.equal(OLD_TO_NEW[oldKey(name)], undefined, name);
  }
});

test('a converted permission group keeps every route its old permission opened', () => {
  // Task 3 converts custom groups with OLD_TO_NEW: nobody may lose a route they have today.
  const lost = [];
  for (const row of MATRIX) {
    if (!(row.old in OLD_TO_NEW)) continue; // ungated modules (auth, public, ...) were never grantable
    const d = routeDecl(row.method, row.path);
    if (!isPermissionKey(d.permission)) continue;
    // A handler that demanded more than the matrix gate was never opened by the old key alone.
    if (d.legacyOverride) continue;
    if (!OLD_TO_NEW[row.old].includes(d.permission)) lost.push(`${id(d)}: ${row.old} → ${OLD_TO_NEW[row.old]} lacks ${d.permission}`);
  }
  assert.deepEqual(lost, []);
});

// Routes a converted group opens that its old permission did not. Converted
// groups start inactive pending review (Ruling E); this snapshot keeps every
// widening visible: regenerate with UPDATE_SNAPSHOTS=1 and review the diff.
test('widenings from converting old permissions match the committed snapshot', () => {
  const ruleOf = Object.fromEntries(Object.entries(RECORD_RULES).map(([name, r]) => [`${r.module}:${r.action}`, name]));
  const widenings = {};
  for (const [old, keys] of Object.entries(OLD_TO_NEW).sort(([a], [b]) => a.localeCompare(b))) {
    const opened = new Set(MATRIX.filter((r) => r.gated && r.old === old).map((r) => `${r.method} ${r.path}`));
    // A record rule opened the routes whose gate (named in the note) is that rule.
    const rule = ruleOf[old];
    if (rule) for (const d of ROUTES) if (d.note && d.note.includes(rule)) opened.add(id(d));
    const now = ROUTES.filter((d) => keys.includes(d.permission)).map(id);
    const extra = now.filter((r) => !opened.has(r)).sort();
    if (extra.length) widenings[old] = extra;
  }
  const file = path.join(__dirname, 'fixtures', 'authz-widenings.json');
  if (process.env.UPDATE_SNAPSHOTS === '1') fs.writeFileSync(file, `${JSON.stringify(widenings, null, 2)}\n`);
  assert.deepEqual(widenings, JSON.parse(fs.readFileSync(file, 'utf8')));
});

test('every in-handler record-rule call site is inventoried for Task 5', () => {
  const src = path.join(__dirname, '..', 'src');
  const counted = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'authz') walk(full); continue; }
      if (!entry.name.endsWith('.ts') || entry.name === 'record-rules.ts') continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const m of text.matchAll(/(?:allowsRule|requireCompanyRule)\([^)]*'([A-Z_]+)'/g)) {
        const rel = path.relative(path.join(__dirname, '..'), full).split(path.sep).join('/');
        counted[m[1]] ??= {};
        counted[m[1]][rel] = (counted[m[1]][rel] ?? 0) + 1;
      }
    }
  };
  walk(src);
  const listed = Object.fromEntries(Object.entries(RULE_CALL_SITES).map(([rule, v]) => [rule, v.sites]));
  assert.deepEqual(listed, counted);
  for (const rule of Object.keys(RULE_CALL_SITES)) assert.ok(rule in RECORD_RULES, rule);
});
