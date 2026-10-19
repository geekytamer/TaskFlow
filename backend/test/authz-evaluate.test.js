const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { effective, effectiveLegacy, clearEffectiveCache, KEY_MODULES, CACHE_LIMIT } = require('../dist/authz/evaluate');
const { teamOf } = require('../dist/authz/team');
const { can, scopeOf } = require('../dist/authz/can');
const { TEMPLATES } = require('../dist/authz/templates');
const { allPermissionKeys } = require('../dist/authz/catalogue');
const { MODULES } = require('../dist/permissions/catalogue');
const { makeTmpDir } = require('./helpers/tmp');

const freshStore = () =>
  new DataStore({ dbPath: path.join(makeTmpDir('taskflow-authz-eval-'), 'taskflow.db'), seedOnEmpty: false });

let seq = 0;
const makeUser = (store, companyIds, role) =>
  store.createUser({
    name: `u${++seq}`,
    email: `u${seq}@eval.test`,
    role,
    companyIds,
    companyRoles: companyIds.map((companyId) => ({ companyId, role })),
    password: 'x',
  });

const addOn = (store, companyId, name, grants, fields = []) =>
  store.authz.saveRole(companyId, { name, grants, fields }, null);

const mainRoleId = (store, userId, companyId) => store.authz.assignments(userId, companyId).find((a) => a.isMain).roleId;

const giveAddOns = (store, userId, companyId, roleIds) =>
  store.authz.setAssignments(userId, companyId, { mainRoleId: mainRoleId(store, userId, companyId), addOnRoleIds: roleIds }, null);

/** A temporary assignment, as delegation will write it (Task 3 has no writer for one yet). */
const temporary = (store, userId, companyId, roleId, startsAt, endsAt) => {
  store.db
    .prepare('INSERT INTO user_group_assignments (userId, companyId, groupId, isMain, isActive, startsAt, endsAt) VALUES (?, ?, ?, 0, 1, ?, ?)')
    .run(userId, companyId, roleId, startsAt, endsAt);
  store.bumpAuthzVersion();
};

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const HOUR = 3600_000;

test('main role and add-ons union; the widest scope wins; sources name each role', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const clerk = makeUser(store, [acme.id], 'Employee');
  const wide = addOn(store, acme.id, 'All tasks', [{ key: 'tasks.view', scope: 'company' }, { key: 'sales.view' }]);
  giveAddOns(store, clerk.id, acme.id, [wide.id]);

  const eff = effective(store, clerk.id);
  const company = eff.byCompany.get(acme.id);
  const tasks = company.grants.get('tasks.view');
  assert.equal(tasks.scope, 'company');
  assert.deepEqual(tasks.sources.map((s) => s.kind).sort(), ['addon', 'main']);
  assert.equal(tasks.sources.find((s) => s.kind === 'addon').roleName, 'All tasks');
  assert.ok(company.grants.has('sales.view'), 'add-on only grant present');
  assert.ok(company.grants.has('tasks.create'), 'main role grant present');
  assert.equal(scopeOf(eff, 'tasks.view', acme.id), 'company');
  assert.equal(scopeOf(eff, 'sales.view', acme.id), 'company', 'unscoped grant reads as company-wide');
  assert.equal(scopeOf(eff, 'payroll.view', acme.id), null);
  // Fields OR across roles.
  const salaryRole = addOn(store, acme.id, 'Salary viewer', [{ key: 'payroll.view' }], [{ key: 'salary', view: true, edit: false }]);
  giveAddOns(store, clerk.id, acme.id, [wide.id, salaryRole.id]);
  const eff2 = effective(store, clerk.id);
  assert.deepEqual(
    { view: eff2.byCompany.get(acme.id).fields.get('salary').view, edit: eff2.byCompany.get(acme.id).fields.get('salary').edit },
    { view: true, edit: false },
  );
});

test('highest limit wins and no limit beats any number', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const buyer = makeUser(store, [acme.id], 'Employee');
  const small = addOn(store, acme.id, 'Small', [{ key: 'purchasing.approve', limit: 1000 }]);
  const big = addOn(store, acme.id, 'Big', [{ key: 'purchasing.approve', limit: 5000 }]);
  giveAddOns(store, buyer.id, acme.id, [small.id, big.id]);
  let eff = effective(store, buyer.id);
  assert.equal(eff.byCompany.get(acme.id).grants.get('purchasing.approve').limit, 5000);
  assert.deepEqual(can(eff, 'purchasing.approve', { companyId: acme.id, amount: 4000 }), { allowed: true });
  assert.deepEqual(can(eff, 'purchasing.approve', { companyId: acme.id, amount: 6000 }), { allowed: false, reason: 'over_limit' });

  const open = addOn(store, acme.id, 'Open', [{ key: 'purchasing.approve' }]);
  giveAddOns(store, buyer.id, acme.id, [small.id, big.id, open.id]);
  eff = effective(store, buyer.id);
  assert.equal(eff.byCompany.get(acme.id).grants.get('purchasing.approve').limit, undefined);
  assert.equal(can(eff, 'purchasing.approve', { companyId: acme.id, amount: 1e9 }).allowed, true);
});

test('temporary assignments count only inside their window; the cache notices expiry', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const payroll = addOn(store, acme.id, 'Payroll cover', [{ key: 'payroll.view' }]);
  const hr = addOn(store, acme.id, 'Sales cover', [{ key: 'sales.view' }]);
  const finance = addOn(store, acme.id, 'Finance cover', [{ key: 'finance.view' }]);
  temporary(store, user.id, acme.id, payroll.id, iso(-2 * HOUR), iso(-HOUR)); // expired
  temporary(store, user.id, acme.id, hr.id, iso(HOUR), iso(2 * HOUR)); // not started
  const until = iso(HOUR);
  temporary(store, user.id, acme.id, finance.id, null, until); // active

  const now = new Date();
  const eff = effective(store, user.id, { now });
  const grants = eff.byCompany.get(acme.id).grants;
  assert.equal(grants.has('payroll.view'), false, 'expired ignored');
  assert.equal(grants.has('sales.view'), false, 'future ignored');
  assert.deepEqual(grants.get('finance.view').sources, [{ kind: 'temporary', roleId: finance.id, roleName: 'Finance cover', until }]);

  // Same version, later clock: the temporary role has ended, so the cached answer must not be served.
  const later = effective(store, user.id, { now: new Date(Date.now() + 90 * 60_000) });
  assert.equal(later.byCompany.get(acme.id).grants.has('finance.view'), false);
  assert.equal(later.byCompany.get(acme.id).grants.has('sales.view'), true, 'started in the meantime');
});

test('inactive assignments and roles needing review grant nothing', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const role = addOn(store, acme.id, 'Payroll', [{ key: 'payroll.view' }]);
  giveAddOns(store, user.id, acme.id, [role.id]);
  assert.ok(effective(store, user.id).byCompany.get(acme.id).grants.has('payroll.view'));
  store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(role.id);
  store.bumpAuthzVersion();
  assert.equal(effective(store, user.id).byCompany.get(acme.id).grants.has('payroll.view'), false);
  store.db.prepare('UPDATE permission_groups SET needsReview = 0 WHERE id = ?').run(role.id);
  store.db.prepare('UPDATE user_group_assignments SET isActive = 0 WHERE groupId = ?').run(role.id);
  store.bumpAuthzVersion();
  assert.equal(effective(store, user.id).byCompany.get(acme.id).grants.has('payroll.view'), false);
});

test('a holding assignment reaches every company of the group, including one attached later', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const outside = store.createCompany({ name: 'Outside', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);

  let eff = effective(store, ceo.id);
  const tasks = eff.byCompany.get(acme.id).grants.get('tasks.view');
  assert.equal(tasks.scope, 'group', 'owner holding wins over the employee main role');
  assert.ok(tasks.sources.some((s) => s.kind === 'holding'));
  assert.equal(eff.byCompany.has(beta.id), false);

  store.authz.attachCompany(group.id, beta.id, null);
  eff = effective(store, ceo.id);
  assert.ok(eff.byCompany.has(beta.id), 'company attached after the assignment');
  assert.ok(eff.byCompany.get(beta.id).grants.has('finance.view'));
  assert.equal(eff.byCompany.get(beta.id).grants.get('tasks.view').sources[0].kind, 'holding');
  assert.equal(eff.byCompany.has(outside.id), false);
  assert.deepEqual(can(eff, 'tasks.view', { companyId: beta.id, ownerUserId: 'someone-else' }), { allowed: true });
});

test('a holding role key missing in a company falls back to the group-level role', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.db
    .prepare(`INSERT INTO permission_groups (id, companyId, key, name, isSystem, isActive, createdAt, holdingGroupId, needsReview)
              VALUES ('grp-auditor', NULL, 'auditor', 'Group auditor', 0, 1, ?, ?, 0)`)
    .run(new Date().toISOString(), group.id);
  store.db.prepare(`INSERT INTO role_permissions (groupId, key, scope, limitAmount) VALUES ('grp-auditor', 'finance.view', NULL, NULL)`).run();
  store.authz.setHoldingAssignment(group.id, user.id, { mainRoleKey: null, addOnRoleKeys: ['auditor'] }, null);
  const grant = effective(store, user.id).byCompany.get(acme.id).grants.get('finance.view');
  assert.deepEqual(grant.sources, [{ kind: 'holding', roleId: 'grp-auditor', roleName: 'Group auditor' }]);
});

test('module switches lock a key only when every module gating its routes is off', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const admin = makeUser(store, [acme.id], 'Admin');
  assert.ok(effective(store, admin.id).byCompany.get(acme.id).grants.has('sales.view'));
  store.updateCompany(acme.id, { disabledModules: ['sales', 'contacts'] });
  for (const fn of [effective, effectiveLegacy]) {
    const grants = fn(store, admin.id).byCompany.get(acme.id).grants;
    const allowed = (key) => can({ userId: admin.id, byCompany: new Map([[acme.id, { grants, fields: new Map() }]]), team: () => new Set() }, key, { companyId: acme.id }).allowed;
    assert.equal(allowed('sales.view'), false, `${fn.name}: a 1:1 area is locked`);
    assert.equal(allowed('tasks.view'), true, `${fn.name}: tasks module still on`);
    assert.equal(allowed('sales.cancel'), true, `${fn.name}: no route, area has an ungated route → never locked here`);
    assert.equal(allowed('logistics.print'), false, `${fn.name}: delivery notes are sales-gated only`);
    assert.equal(allowed('logistics.view'), true, `${fn.name}: shipments (inventory) still open with sales off`);
    assert.equal(allowed('logistics.create'), true, `${fn.name}: shipments create still open`);
    assert.equal(allowed('influencers.review'), true, `${fn.name}: influencer review has no module gate today`);
    assert.equal(allowed('influencers.export'), false, `${fn.name}: influencer export is contacts-gated`);
    assert.equal(allowed('sales.delete'), true, `${fn.name}: DELETE /sales-orders/:id has no module gate today`);
    assert.ok(allowed('settings.view'), `${fn.name}: settings never switch off`);
    assert.ok(allowed('purchasing.view'), `${fn.name}: other modules untouched`);
  }
  store.updateCompany(acme.id, { disabledModules: ['sales', 'contacts', 'inventory', 'tasks'] });
  const after = effective(store, admin.id).byCompany.get(acme.id).grants;
  assert.equal(after.has('logistics.view'), false, 'both owning modules off');
  assert.equal(after.has('tasks.view'), false, 'a key with no route follows its fully gated area');
});

test('KEY_MODULES covers every catalogue key with valid module keys or null', () => {
  const moduleKeys = new Set(MODULES.map((m) => m.key));
  for (const key of allPermissionKeys()) {
    assert.ok(Object.prototype.hasOwnProperty.call(KEY_MODULES, key), `missing ${key}`);
    const mods = KEY_MODULES[key];
    assert.ok(mods === null || (mods.length > 0 && mods.every((m) => moduleKeys.has(m))), `${key} → ${mods}`);
  }
  assert.deepEqual(KEY_MODULES['logistics.view'], ['inventory', 'sales']);
  assert.equal(KEY_MODULES['influencers.review'], null);
  assert.equal(KEY_MODULES['academy.view'], null);
});

test('effectiveLegacy equals the template of each legacy role, with no add-ons', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  for (const role of ['Admin', 'Manager', 'Accountant', 'Employee']) {
    const user = makeUser(store, [acme.id], role);
    // An add-on must not leak into the legacy answer.
    giveAddOns(store, user.id, acme.id, [addOn(store, acme.id, `Extra ${role}`, [{ key: 'payroll.create' }]).id]);
    const company = effectiveLegacy(store, user.id).byCompany.get(acme.id);
    const template = TEMPLATES[role.toLowerCase()];
    const got = [...company.grants].map(([key, g]) => ({ key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined ? { limit: g.limit } : {}) }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const want = template.grants.map((g) => ({ ...g })).sort((a, b) => a.key.localeCompare(b.key));
    assert.deepEqual(got, want, role);
    const gotFields = [...company.fields].filter(([, f]) => f.view || f.edit).map(([key, f]) => ({ key, view: f.view, edit: f.edit }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const wantFields = template.fields.filter((f) => f.view || f.edit).sort((a, b) => a.key.localeCompare(b.key));
    assert.deepEqual(gotFields, wantFields, `${role} fields`);
    assert.ok([...company.grants.values()].every((g) => g.sources.length === 1 && g.sources[0].kind === 'main'));
  }
});

test('team line: three levels down, cycles terminate, unlinked users are a team of one, edits invalidate', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const [a, b, c, d, x, y, loner] = Array.from({ length: 7 }, () => makeUser(store, [acme.id], 'Employee'));
  const ea = store.createEmployee({ companyId: acme.id, userId: a.id, name: 'A' });
  const eb = store.createEmployee({ companyId: acme.id, userId: b.id, name: 'B', managerId: ea.id });
  const unlinked = store.createEmployee({ companyId: acme.id, userId: null, name: 'No login', managerId: eb.id });
  const ec = store.createEmployee({ companyId: acme.id, userId: c.id, name: 'C', managerId: unlinked.id });
  const ed = store.createEmployee({ companyId: acme.id, userId: d.id, name: 'D', managerId: ec.id });

  assert.deepEqual([...teamOf(store, acme.id, a.id)].sort(), [a.id, b.id, c.id, d.id].sort());
  assert.deepEqual([...teamOf(store, acme.id, c.id)].sort(), [c.id, d.id].sort());
  assert.deepEqual([...teamOf(store, acme.id, d.id)], [d.id]);
  assert.deepEqual([...teamOf(store, acme.id, loner.id)], [loner.id]);

  const ex = store.createEmployee({ companyId: acme.id, userId: x.id, name: 'X' });
  const ey = store.createEmployee({ companyId: acme.id, userId: y.id, name: 'Y', managerId: ex.id });
  store.updateEmployee(ex.id, { managerId: ey.id });
  assert.deepEqual([...teamOf(store, acme.id, x.id)].sort(), [x.id, y.id].sort());

  store.updateEmployee(ed.id, { managerId: null });
  assert.deepEqual([...teamOf(store, acme.id, a.id)].sort(), [a.id, b.id, c.id].sort(), 'edit invalidates the cache');
  store.deleteEmployee(ec.id);
  assert.deepEqual([...teamOf(store, acme.id, a.id)].sort(), [a.id, b.id].sort(), 'delete invalidates the cache');
  // Raw writes elsewhere (deleting a user unlinks their employee) are seen too.
  store.db.prepare('UPDATE employees SET userId = NULL WHERE id = ?').run(eb.id);
  assert.deepEqual([...teamOf(store, acme.id, a.id)], [a.id]);
});

test('can() applies own, team and company scope to a record', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const [boss, worker, stranger] = ['Employee', 'Employee', 'Employee'].map((r) => makeUser(store, [acme.id], r));
  const eb = store.createEmployee({ companyId: acme.id, userId: boss.id, name: 'Boss' });
  store.createEmployee({ companyId: acme.id, userId: worker.id, name: 'Worker', managerId: eb.id });

  let eff = effective(store, boss.id);
  assert.equal(scopeOf(eff, 'tasks.view', acme.id), 'own');
  const ctx = (ownerUserId, sharedWith) => ({ companyId: acme.id, ownerUserId, sharedWith });
  assert.deepEqual(can(eff, 'tasks.view', ctx(boss.id)), { allowed: true });
  assert.deepEqual(can(eff, 'tasks.view', ctx(worker.id)), { allowed: false, reason: 'out_of_scope' });
  assert.deepEqual(can(eff, 'tasks.view', ctx(worker.id, [boss.id])), { allowed: true }, 'shared with me');
  assert.deepEqual(can(eff, 'tasks.view', ctx(null)), { allowed: false, reason: 'out_of_scope' }, 'unowned record, own scope');
  assert.deepEqual(can(eff, 'tasks.view', { companyId: acme.id }), { allowed: true }, 'no record: permission only');
  assert.deepEqual(can(eff, 'payroll.view', { companyId: acme.id }), { allowed: false, reason: 'no_permission' });
  assert.deepEqual(can(eff, 'tasks.view', { companyId: 'elsewhere' }), { allowed: false, reason: 'no_permission' });

  const teamRole = addOn(store, acme.id, 'Team lead', [{ key: 'tasks.view', scope: 'team' }]);
  giveAddOns(store, boss.id, acme.id, [teamRole.id]);
  eff = effective(store, boss.id);
  assert.deepEqual(can(eff, 'tasks.view', ctx(worker.id)), { allowed: true });
  assert.deepEqual(can(eff, 'tasks.view', ctx(stranger.id)), { allowed: false, reason: 'out_of_scope' });
});

test('the cache serves the same answer until authz_version moves, and holds at most 500 users', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const first = effective(store, user.id);
  assert.equal(effective(store, user.id), first, 'cached');
  const role = addOn(store, acme.id, 'Payroll', [{ key: 'payroll.view' }]); // bumps the version
  giveAddOns(store, user.id, acme.id, [role.id]);
  const second = effective(store, user.id);
  assert.notEqual(second, first);
  assert.ok(second.byCompany.get(acme.id).grants.has('payroll.view'));
  assert.equal(CACHE_LIMIT, 500);
  clearEffectiveCache();
  assert.notEqual(effective(store, user.id), second);
});

test('a holding role that needs review in a company grants nothing there (no template fallback)', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.attachCompany(group.id, beta.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);
  store.db.prepare(`UPDATE permission_groups SET needsReview = 1 WHERE companyId = ? AND key = 'owner'`).run(acme.id);
  store.bumpAuthzVersion();
  const eff = effective(store, ceo.id);
  assert.equal(eff.byCompany.get(acme.id).grants.has('finance.view'), false, 'needs review: closed, not template:owner');
  assert.ok(eff.byCompany.get(acme.id).grants.has('tasks.create'), 'own main role still counts');
  assert.ok(eff.byCompany.get(beta.id).grants.has('finance.view'), 'other companies unaffected');
  // A company without the role at all still falls back to the template.
  store.db.prepare(`DELETE FROM permission_groups WHERE companyId = ? AND key = 'owner'`).run(beta.id);
  store.bumpAuthzVersion();
  const sources = effective(store, ceo.id).byCompany.get(beta.id).grants.get('finance.view').sources;
  assert.deepEqual(sources.map((s) => s.roleId), ['template:owner']);
});

test('unparseable assignment dates fail closed', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const a = addOn(store, acme.id, 'Bad start', [{ key: 'payroll.view' }]);
  const b = addOn(store, acme.id, 'Bad end', [{ key: 'finance.view' }]);
  temporary(store, user.id, acme.id, a.id, 'not-a-date', iso(HOUR));
  temporary(store, user.id, acme.id, b.id, null, 'garbage');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.db.prepare(`INSERT INTO holding_group_assignments (holdingGroupId, userId, roleKey, isMain, startsAt, endsAt) VALUES (?, ?, 'owner', 0, 'soon', NULL)`).run(group.id, user.id);
  store.bumpAuthzVersion();
  const grants = effective(store, user.id).byCompany.get(acme.id).grants;
  assert.equal(grants.has('payroll.view'), false);
  assert.equal(grants.has('finance.view'), false);
  assert.ok(!grants.get('tasks.view').sources.some((s) => s.kind === 'holding'));
});

test('can() treats a non-finite amount as over the limit', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const buyer = makeUser(store, [acme.id], 'Employee');
  giveAddOns(store, buyer.id, acme.id, [addOn(store, acme.id, 'Small', [{ key: 'purchasing.approve', limit: 1000 }]).id]);
  const eff = effective(store, buyer.id);
  for (const amount of [NaN, Infinity, -Infinity, Number('x')]) {
    assert.deepEqual(can(eff, 'purchasing.approve', { companyId: acme.id, amount }), { allowed: false, reason: 'over_limit' }, String(amount));
  }
});

test('legacy role per company matches http.ts getEffectiveRole on the sanitized user', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const { getEffectiveRole } = require('../dist/http');
  const user = makeUser(store, [acme.id], 'Manager');
  const cases = [
    // companyRoles empty: every companyIds entry falls back to users.role.
    { role: 'Accountant', companyIds: [acme.id, beta.id], companyRoles: [] },
    // companyRoles non-empty: its entry decides; a stray companyIds entry gives no access (sanitizeUser).
    { role: 'Manager', companyIds: [acme.id, beta.id], companyRoles: [{ companyId: acme.id, role: 'Employee' }] },
  ];
  for (const c of cases) {
    store.db.prepare('UPDATE users SET role = ?, companyIds = ?, companyRoles = ? WHERE id = ?')
      .run(c.role, JSON.stringify(c.companyIds), JSON.stringify(c.companyRoles), user.id);
    store.bumpAuthzVersion();
    const sanitized = store.getUserById(user.id);
    const eff = effectiveLegacy(store, user.id);
    for (const company of [acme, beta]) {
      const role = getEffectiveRole(sanitized, company.id);
      const keys = eff.byCompany.has(company.id) ? [...eff.byCompany.get(company.id).grants.keys()].sort() : undefined;
      assert.deepEqual(keys, role ? TEMPLATES[role.toLowerCase()].grants.map((g) => g.key).sort() : undefined, `${c.role} ${company.name}`);
    }
  }
});

test('terminated employees are out of the team line; it still passes through them', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const [a, b, c] = Array.from({ length: 3 }, () => makeUser(store, [acme.id], 'Employee'));
  const ea = store.createEmployee({ companyId: acme.id, userId: a.id, name: 'A' });
  const eb = store.createEmployee({ companyId: acme.id, userId: b.id, name: 'B', managerId: ea.id, status: 'Terminated' });
  store.createEmployee({ companyId: acme.id, userId: c.id, name: 'C', managerId: eb.id, status: 'On Leave' });
  assert.deepEqual([...teamOf(store, acme.id, a.id)].sort(), [a.id, c.id].sort());
  assert.deepEqual([...teamOf(store, acme.id, b.id)], [b.id], 'a terminated person leads nobody');
  store.updateEmployee(eb.id, { status: 'Active' });
  assert.deepEqual([...teamOf(store, acme.id, a.id)].sort(), [a.id, b.id, c.id].sort(), 'status change invalidates');
});

test('the team version moves on line changes only, not on a name edit', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const e = store.createEmployee({ companyId: acme.id, name: 'E' });
  const v0 = store.authz.teamVersion(acme.id);
  store.updateEmployee(e.id, { name: 'E renamed' });
  assert.equal(store.authz.teamVersion(acme.id), v0, 'full-row rewrite with same line');
  const boss = store.createEmployee({ companyId: acme.id, name: 'Boss' });
  const v1 = store.authz.teamVersion(acme.id);
  assert.ok(v1 > v0);
  store.updateEmployee(e.id, { managerId: boss.id });
  assert.ok(store.authz.teamVersion(acme.id) > v1);
});
