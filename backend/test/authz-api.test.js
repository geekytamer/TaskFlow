const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { CATALOGUE } = require('../dist/authz/catalogue');
const { TEMPLATES } = require('../dist/authz/templates');
const { summaryLines, levelOf, beyond } = require('../dist/authz/describe');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Task 9: roles, people and my-permissions API, plus the store rules it
 * relies on (Ruling Q resync, read-only standard roles, review/activate,
 * owner assignments surviving the legacy sync, needs-review main refused).
 */

const quiet = { info() {}, warn() {}, error() {} };
const sortGrants = (grants) => [...grants]
  .map((g) => ({ key: g.key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined ? { limit: g.limit } : {}) }))
  .sort((a, b) => a.key.localeCompare(b.key));

let seq = 0;
const makeUser = (store, companyIds, role) =>
  store.createUser({
    name: `api${++seq}`,
    email: `api${seq}@api.test`,
    role,
    companyIds,
    companyRoles: companyIds.map((companyId) => ({ companyId, role })),
    password: 'x',
  });

const freshStore = (dir = makeTmpDir('taskflow-authz-api-')) =>
  ({ dir, store: new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false }) });

const systemRoleOf = (store, companyId, key) => store.authz.listRoles(companyId).find((r) => r.key === key && r.isSystem);

// ── Store level ──────────────────────────────────────────────────────

test('Ruling Q: standard roles are re-synced from the templates (in process, by migrateAll and at startup)', () => {
  const { dir, store } = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const employee = systemRoleOf(store, acme.id, 'employee');
  assert.deepEqual(employee.grants, sortGrants(TEMPLATES.employee.grants));
  assert.equal(store.authz.syncSystemRoles(), 0, 'nothing to do when equal');

  // A template change in process reaches the existing role.
  TEMPLATES.employee.grants.push({ key: 'finance.view' });
  try {
    const before = store.getAuthzVersion();
    assert.ok(store.authz.syncSystemRoles() >= 1);
    assert.ok(store.authz.getRole(employee.id).grants.some((g) => g.key === 'finance.view'));
    assert.ok(store.getAuthzVersion() > before, 'bumps the version');
    assert.ok(store.authz.audit({ entity: 'role', entityId: employee.id }).some((a) => a.after?.grants?.some((g) => g.key === 'finance.view')));
    assert.equal(store.authz.syncSystemRoles(), 0, 'idempotent');
  } finally {
    TEMPLATES.employee.grants.pop();
  }
  store.authz.syncSystemRoles();
  assert.ok(!store.authz.getRole(employee.id).grants.some((g) => g.key === 'finance.view'));

  // migrateAll repairs a drifted standard role.
  const admin = systemRoleOf(store, acme.id, 'admin');
  store.db.prepare("DELETE FROM role_permissions WHERE groupId = ? AND key = 'sales.view'").run(admin.id);
  store.authz.migrateAll();
  assert.deepEqual(store.authz.getRole(admin.id).grants, sortGrants(TEMPLATES.admin.grants));

  // So does every start.
  store.db.prepare("DELETE FROM role_fields WHERE groupId = ? AND field = 'salary'").run(admin.id);
  store.db.prepare("DELETE FROM role_permissions WHERE groupId = ? AND key = 'sales.view'").run(admin.id);
  const reopened = new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
  assert.deepEqual(reopened.authz.getRole(admin.id).grants, sortGrants(TEMPLATES.admin.grants));
  assert.deepEqual(reopened.authz.getRole(admin.id).fields.find((f) => f.key === 'salary'), { key: 'salary', view: true, edit: true });
});

test('standard roles refuse saveRole and deleteRole (403 SYSTEM_ROLE); custom roles do not', () => {
  const { store } = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  for (const key of ['owner', 'admin', 'employee']) {
    const role = systemRoleOf(store, acme.id, key);
    assert.throws(() => store.authz.saveRole(acme.id, { id: role.id, name: 'Mine', grants: [], fields: [] }, null), (e) => e.status === 403 && e.details.code === 'SYSTEM_ROLE');
    assert.throws(() => store.authz.deleteRole(role.id, null), (e) => e.status === 403 && e.details.code === 'SYSTEM_ROLE');
  }
  const clerk = store.authz.saveRole(acme.id, { name: 'Clerk', grants: [{ key: 'sales.view' }], fields: [] }, null);
  store.authz.saveRole(acme.id, { id: clerk.id, name: 'Clerk 2', grants: [], fields: [] }, null);
  store.authz.deleteRole(clerk.id, null);
});

test('review: a needs-review role cannot be a main role; activateRole clears it and activates its assignments', () => {
  const { store } = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const employee = systemRoleOf(store, acme.id, 'employee');
  const converted = store.authz.saveRole(acme.id, { name: 'Old custom', grants: [{ key: 'finance.view' }], fields: [] }, null);
  store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(converted.id);
  store.authz.setAssignments(user.id, acme.id, { mainRoleId: employee.id, addOnRoleIds: [converted.id] }, null);
  assert.equal(store.authz.assignments(user.id, acme.id).find((a) => a.roleId === converted.id).isActive, false, 'kept inactive');
  assert.throws(() => store.authz.setAssignments(user.id, acme.id, { mainRoleId: converted.id, addOnRoleIds: [] }, null), /review/i);

  const role = store.authz.activateRole(converted.id, user.id);
  assert.equal(role.needsReview, false);
  assert.equal(store.authz.assignments(user.id, acme.id).find((a) => a.roleId === converted.id).isActive, true);
  assert.ok(store.authz.audit({ entity: 'role_review', entityId: converted.id }).length === 1);
  assert.throws(() => store.authz.activateRole(converted.id, null), (e) => e.status === 409);
});

test('an Owner assignment survives the legacy role sync while the legacy role is Admin, and goes on demotion', () => {
  const { store } = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const boss = makeUser(store, [acme.id], 'Admin');
  const owner = systemRoleOf(store, acme.id, 'owner');
  store.authz.setAssignments(boss.id, acme.id, { mainRoleId: owner.id, addOnRoleIds: [] }, null);
  // A legacy edit that changes the role signature (position) re-syncs.
  store.updateUser(boss.id, { companyRoles: [{ companyId: acme.id, role: 'Admin', positionId: 'p-x' }] });
  const main = store.authz.assignments(boss.id, acme.id).find((a) => a.isMain);
  assert.equal(main?.roleKey, 'owner', 'owner stays main');
  store.updateUser(boss.id, { companyRoles: [{ companyId: acme.id, role: 'Employee' }] });
  const after = store.authz.assignments(boss.id, acme.id);
  assert.ok(!after.some((a) => a.roleKey === 'owner'), 'demoted: owner goes');
  assert.equal(after.find((a) => a.isMain)?.roleKey, 'employee');
});

test('deleteRole and setAssignments refuse a group role group-wide people use (403)', () => {
  const { store } = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'admin', addOnRoleKeys: [] }, null);
  const copy = store.authz.listRoles(acme.id).find((r) => r.key === 'group:admin');
  assert.throws(() => store.authz.deleteRole(copy.id, null), (e) => e.status === 403 && e.details.code === 'GROUP_ROLE');
  assert.ok(store.authz.getRole(copy.id), 'still there');
  assert.throws(() => store.authz.setAssignments(ceo.id, acme.id, { mainRoleId: copy.id, addOnRoleIds: [] }, null), (e) => e.status === 403);
});

test('describe: level presets, summary lines and the no-higher-than-me comparison', () => {
  const sales = CATALOGUE.find((a) => a.key === 'sales');
  assert.equal(levelOf(sales, new Set()), 'none');
  assert.equal(levelOf(sales, new Set(['sales.view'])), 'view');
  assert.equal(levelOf(sales, new Set(['sales.view', 'sales.create', 'sales.edit'])), 'edit');
  assert.equal(levelOf(sales, new Set(sales.actions.map((a) => `sales.${a.key}`))), 'full');
  assert.equal(levelOf(sales, new Set(['sales.view', 'sales.delete'])), 'custom');

  const company = {
    grants: new Map([
      ['sales.view', { sources: [] }],
      ['purchasing.view', { sources: [] }],
      ['purchasing.approve', { limit: 5000, sources: [] }],
      ['tasks.view', { scope: 'own', sources: [] }],
    ]),
    fields: new Map([['cost_prices', { view: true, edit: false, sources: [] }]]),
  };
  const lines = summaryLines(company);
  const en = lines.map((l) => l.en);
  assert.ok(en.includes('Sees sales'), en.join(' | '));
  assert.ok(en.some((l) => /up to 5000$/.test(l)), 'limited approval');
  assert.ok(en.some((l) => l.startsWith('Sees tasks (own records)')));
  assert.ok(en.some((l) => /^Can't see salaries/i.test(l) && !/cost prices/i.test(l)));
  assert.ok(lines.every((l) => l.ar && l.ar !== l.en), 'every line has Arabic');

  assert.deepEqual(beyond(company, [{ key: 'sales.view' }], []), []);
  assert.deepEqual(beyond(company, [{ key: 'tasks.view', scope: 'company' }], []), ['tasks.view'], 'wider scope');
  assert.deepEqual(beyond(company, [{ key: 'purchasing.approve' }], []), ['purchasing.approve'], 'no limit beats mine');
  assert.deepEqual(beyond(company, [{ key: 'purchasing.approve', limit: 100 }], []), []);
  assert.deepEqual(beyond(company, [], [{ key: 'cost_prices', view: true, edit: true }]), ['field:cost_prices']);
});

// ── HTTP, under every engine ─────────────────────────────────────────

const build = (engine) => {
  const dbPath = path.join(makeTmpDir(`taskflow-authz-api-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet });
  const server = app.listen(0);
  server.unref();
  const byEmail = (email) => store.listUsers().find((u) => u.email === email);
  const root = makeUser(store, ['3'], 'Employee');
  store.db.prepare('UPDATE users SET isSuperAdmin = 1 WHERE id = ?').run(root.id);
  const as = (user) => {
    const auth = `Bearer ${store.issueToken(user.id)}`;
    return {
      get: (url) => request(server).get(url).set('Authorization', auth),
      post: (url, body) => request(server).post(url).set('Authorization', auth).send(body ?? {}),
      put: (url, body) => request(server).put(url).set('Authorization', auth).send(body ?? {}),
      del: (url) => request(server).delete(url).set('Authorization', auth),
    };
  };
  return { server, store, byEmail, as, root: store.getUserById(root.id) };
};

for (const engine of ['legacy', 'shadow', 'v2']) {
  test(`GET /me/permissions and /permissions/catalogue (${engine})`, async () => {
    const { store, byEmail, as, root } = build(engine);
    const charlie = byEmail('charlie.d@innovatecorp.com'); // Employee in company 1

    assert.equal((await as(charlie).get('/me/permissions')).status, 400);
    assert.equal((await as(charlie).get('/me/permissions?companyId=2')).status, 403, 'not my company');
    const me = await as(charlie).get('/me/permissions?companyId=1');
    assert.equal(me.status, 200);
    assert.equal(me.body.engine, engine);
    assert.equal(me.body.version, store.getAuthzVersion());
    assert.equal(me.body.superAdmin, false);
    assert.deepEqual(me.body.disabledModules, []);
    assert.deepEqual(me.body.grants, sortGrants(TEMPLATES.employee.grants), 'the Employee template');
    assert.deepEqual(me.body.fields, TEMPLATES.employee.fields);
    assert.deepEqual(me.body.academy, { lockedModules: [] }, 'Academy not enforced under test');

    // A reviewed add-on counts only under v2 (Ruling D: inert before the switch).
    const extra = store.authz.saveRole('1', { name: 'Finance peek', grants: [{ key: 'finance.view' }], fields: [] }, null);
    const employeeRole = systemRoleOf(store, '1', 'employee');
    store.authz.setAssignments(charlie.id, '1', { mainRoleId: employeeRole.id, addOnRoleIds: [extra.id] }, null);
    const after = await as(charlie).get('/me/permissions?companyId=1');
    assert.equal(after.body.grants.some((g) => g.key === 'finance.view'), engine === 'v2');

    // The super admin is told so (not a member of company 1).
    const rootMe = await as(root).get('/me/permissions?companyId=1');
    assert.equal(rootMe.status, 200);
    assert.equal(rootMe.body.superAdmin, true);
    assert.equal(rootMe.body.member, false);

    const cat = await as(charlie).get('/permissions/catalogue');
    assert.equal(cat.status, 200);
    assert.equal(cat.body.areas.length, CATALOGUE.length);
    const sales = cat.body.areas.find((a) => a.key === 'sales');
    assert.deepEqual(sales.levels.view, ['sales.view']);
    assert.deepEqual(sales.levels.full, sales.actions.map((a) => a.key));
    assert.ok(sales.levels.edit.includes('sales.create') && !sales.levels.edit.includes('sales.delete'));
    assert.ok(sales.label.en && sales.label.ar);
    assert.equal(cat.body.fields.length, 6);
    assert.deepEqual(cat.body.templates.map((t) => t.key), ['owner', 'admin', 'manager', 'accountant', 'employee']);
    assert.ok(Array.isArray(cat.body.modules) && Array.isArray(cat.body.alwaysOnModules), 'legacy catalogue kept for today\'s screens');
  });

  test(`roles API: gates, read-only standard and group roles, duplicate, no higher than me, activate (${engine})`, async () => {
    const { store, byEmail, as, root } = build(engine);
    const admin = byEmail('admin@taskflow.com');
    const samantha = byEmail('samantha.b@innovatecorp.com'); // Manager in 1
    const charlie = byEmail('charlie.d@innovatecorp.com'); // Employee in 1

    assert.equal((await as(charlie).get('/companies/1/roles')).status, 403);
    const listed = await as(samantha).get('/companies/1/roles');
    assert.equal(listed.status, 200);
    const employee = listed.body.find((r) => r.key === 'employee');
    assert.equal(employee.kind, 'system');
    assert.equal(employee.readOnly, true);
    assert.ok(employee.peopleCount >= 2, 'charlie and fox');
    assert.equal((await as(samantha).post('/companies/1/roles', { name: 'X', grants: [], fields: [] })).status, 403, 'manager cannot manage roles');

    // Create and edit a custom role.
    const created = await as(admin).post('/companies/1/roles', { name: 'Clerk', nameAr: 'كاتب', grants: [{ key: 'sales.view' }], fields: [] });
    assert.equal(created.status, 201);
    assert.equal(created.body.kind, 'custom');
    assert.equal(created.body.readOnly, false);
    const clerk = created.body.id;
    const edited = await as(admin).put(`/companies/1/roles/${clerk}`, { name: 'Sales clerk', grants: [{ key: 'sales.view' }, { key: 'sales.create' }], fields: [] });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.grants.length, 2);
    assert.equal((await as(admin).post('/companies/1/roles', { name: 'Bad', grants: [{ key: 'nope.view' }], fields: [] })).status, 400);
    assert.equal((await as(admin).get('/companies/2/roles/' + clerk)).status, 404, 'another company');

    // Standard roles: read-only, not deletable (Ruling Q).
    const put = await as(admin).put(`/companies/1/roles/${employee.id}`, { name: 'Mine', grants: [], fields: [] });
    assert.equal(put.status, 403);
    assert.equal(put.body.details?.code ?? put.body.code, 'SYSTEM_ROLE');
    assert.equal((await as(admin).del(`/companies/1/roles/${employee.id}`)).status, 403);

    // Duplicate a standard role to customise it.
    const dup = await as(admin).post(`/companies/1/roles/${employee.id}/duplicate`, {});
    assert.equal(dup.status, 201);
    assert.equal(dup.body.name, 'Employee (copy)');
    assert.equal(dup.body.templateKey, 'employee');
    assert.deepEqual(dup.body.grants, employee.grants);
    assert.equal((await as(admin).put(`/companies/1/roles/${dup.body.id}`, { name: 'Junior', grants: dup.body.grants, fields: dup.body.fields })).status, 200);
    assert.equal((await as(admin).del(`/companies/1/roles/${dup.body.id}`)).status, 204);

    // No higher than me: Admin holds tasks.view at company scope, not group.
    const higher = await as(admin).post('/companies/1/roles', { name: 'Wide', grants: [{ key: 'tasks.view', scope: 'group' }], fields: [] });
    assert.equal(higher.status, 403);
    assert.equal(higher.body.details?.code ?? higher.body.code, 'HIGHER_THAN_YOU');
    assert.equal((await as(admin).put(`/companies/1/roles/${clerk}`, { name: 'Sales clerk', grants: [{ key: 'tasks.view', scope: 'group' }], fields: [] })).status, 403);
    const owner = listed.body.find((r) => r.key === 'owner');
    assert.equal((await as(admin).post(`/companies/1/roles/${owner.id}/duplicate`, {})).status, 403, 'cannot copy Owner');
    assert.equal((await as(root).post('/companies/1/roles', { name: 'Wide', grants: [{ key: 'tasks.view', scope: 'group' }], fields: [] })).status, 201, 'super admin exempt');

    // Group roles are read-only to the company.
    const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
    store.authz.attachCompany(group.id, '1', null);
    store.authz.setHoldingAssignment(group.id, samantha.id, { mainRoleKey: 'manager', addOnRoleKeys: [] }, null);
    const copy = (await as(admin).get('/companies/1/roles')).body.find((r) => r.key === 'group:manager');
    assert.equal(copy.kind, 'group');
    assert.equal(copy.readOnly, true);
    assert.equal(copy.peopleCount, 1);
    assert.equal((await as(admin).put(`/companies/1/roles/${copy.id}`, { name: 'x', grants: [], fields: [] })).status, 403);
    assert.equal((await as(admin).del(`/companies/1/roles/${copy.id}`)).status, 403, 'group roles are not the company\'s to delete');

    // Review: a converted role needing review is listed so, then activated.
    store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(clerk);
    store.db.prepare('INSERT INTO user_group_assignments (userId, companyId, groupId, isMain, isActive) VALUES (?, ?, ?, 0, 0)').run(charlie.id, '1', clerk);
    store.db.prepare('UPDATE authz_version SET version = version + 1 WHERE id = 1').run();
    assert.equal((await as(admin).get('/companies/1/roles')).body.find((r) => r.id === clerk).needsReview, true);
    assert.equal((await as(samantha).post(`/companies/1/roles/${clerk}/activate`)).status, 403);
    const activated = await as(admin).post(`/companies/1/roles/${clerk}/activate`);
    assert.equal(activated.status, 200);
    assert.equal(activated.body.needsReview, false);
    const detail = await as(admin).get(`/companies/1/roles/${clerk}`);
    assert.deepEqual(detail.body.people.map((p) => [p.userId, p.isActive]), [[charlie.id, true]]);
    assert.equal((await as(admin).post(`/companies/1/roles/${clerk}/activate`)).status, 409);
    assert.equal((await as(admin).del(`/companies/1/roles/${clerk}`)).status, 400, 'held by someone');

    // Input checks: a name must be text.
    assert.equal((await as(admin).post('/companies/1/roles', { name: 42, grants: [], fields: [] })).status, 400);
    assert.equal((await as(admin).post('/companies/1/roles', { name: { en: 'x' }, grants: [], fields: [] })).status, 400);

    // A copy of a role waiting for review waits too.
    const pending = store.authz.saveRole('1', { name: 'Pending', grants: [{ key: 'sales.view' }], fields: [] }, null);
    store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(pending.id);
    const pendingCopy = await as(admin).post(`/companies/1/roles/${pending.id}/duplicate`, {});
    assert.equal(pendingCopy.status, 201);
    assert.equal(pendingCopy.body.needsReview, true);

    // Lock-out on role edits: the only role-manager holds it through a custom
    // role (a copy of Admin); editing that role to drop it is refused under v2
    // (under legacy/shadow the legacy Admin role still decides, so it is fine).
    const adminRole = listed.body.find((r) => r.key === 'admin');
    const boss = (await as(admin).post(`/companies/1/roles/${adminRole.id}/duplicate`, { name: 'Boss' })).body;
    assert.equal((await as(root).put(`/companies/1/people/${admin.id}/roles`, { mainRoleId: boss.id, addOnRoleIds: [] })).status, 200);
    const weaker = boss.grants.filter((g) => g.key !== 'people.manage_roles');
    const edit = await as(admin).put(`/companies/1/roles/${boss.id}`, { name: 'Boss', grants: weaker, fields: boss.fields });
    if (engine === 'v2') {
      assert.equal(edit.status, 409);
      assert.equal(edit.body.details?.code ?? edit.body.code, 'LOCKOUT');
      assert.ok(store.authz.getRole(boss.id).grants.some((g) => g.key === 'people.manage_roles'), 'rolled back');
      assert.equal((await as(admin).get('/companies/1/roles')).status, 200, 'still manages roles');
    } else {
      assert.equal(edit.status, 200);
    }
  });

  test(`people API: list with summaries, why, set roles, no higher than me, lock-out, group people (${engine})`, async () => {
    const { store, byEmail, as, root } = build(engine);
    const admin = byEmail('admin@taskflow.com');
    const samantha = byEmail('samantha.b@innovatecorp.com');
    const charlie = byEmail('charlie.d@innovatecorp.com');
    const dana = byEmail('dana.s@synergysolutions.com'); // Manager in 2 only
    const roleId = (key) => systemRoleOf(store, '1', key).id;

    assert.equal((await as(charlie).get('/companies/1/people')).status, 403);
    const people = await as(samantha).get('/companies/1/people');
    assert.equal(people.status, 200);
    const c = people.body.find((p) => p.userId === charlie.id);
    assert.equal(c.mainRole.key, 'employee');
    assert.deepEqual(c.addOns, []);
    assert.equal(c.readOnly, false);
    assert.equal(c.viaGroup, null);
    assert.equal(typeof c.linkedToHr, 'boolean');
    assert.ok(c.summary.length > 0 && c.summary.every((l) => l.en && l.ar));
    assert.ok(c.summary.some((l) => /^Can't see salaries/.test(l.en)), c.summary.map((l) => l.en).join(' | '));

    const why = await as(samantha).get(`/companies/1/people/${charlie.id}`);
    assert.equal(why.status, 200);
    const tasks = why.body.grants.find((g) => g.key === 'tasks.view');
    assert.equal(tasks.scope, 'own');
    assert.equal(tasks.sources[0].kind, 'main');
    assert.ok(tasks.label.en);
    assert.equal(why.body.fields.find((f) => f.key === 'salary').view, false);
    assert.equal('superAdmin' in why.body, false, 'only a super admin is told who is one');
    assert.equal((await as(root).get(`/companies/1/people/${charlie.id}`)).body.superAdmin, false);
    assert.equal((await as(samantha).get(`/companies/1/people/${dana.id}`)).status, 404);

    // Set roles: main Manager plus a custom add-on. users.companyRoles follows the standard main role.
    const clerk = (await as(admin).post('/companies/1/roles', { name: 'Clerk', grants: [{ key: 'settings.edit_branding' }], fields: [] })).body.id;
    assert.equal((await as(samantha).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: roleId('manager'), addOnRoleIds: [] })).status, 403);
    const set = await as(admin).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: roleId('manager'), addOnRoleIds: [clerk] });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.mainRole.key, 'manager');
    assert.deepEqual(set.body.addOns.map((a) => a.id), [clerk]);
    assert.equal(store.getUserById(charlie.id).companyRoles.find((r) => r.companyId === '1').role, 'Manager');
    const me = (await as(charlie).get('/me/permissions?companyId=1')).body;
    assert.ok(me.grants.some((g) => g.key === 'purchasing.view'), 'now a manager under every engine');
    assert.equal(me.grants.some((g) => g.key === 'settings.edit_branding'), engine === 'v2', 'the add-on counts only under v2');

    // A needs-review role is never a main role; unknown role 404.
    store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(clerk);
    assert.equal((await as(admin).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: clerk, addOnRoleIds: [] })).status, 400);
    assert.equal((await as(admin).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: 'nope', addOnRoleIds: [] })).status, 404);

    // No higher than me: an Admin cannot make anyone Owner; the super admin can.
    const toOwner = await as(admin).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: roleId('owner'), addOnRoleIds: [] });
    assert.equal(toOwner.status, 403);
    assert.equal(toOwner.body.details?.code ?? toOwner.body.code, 'HIGHER_THAN_YOU');
    const byRoot = await as(root).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: roleId('owner'), addOnRoleIds: [] });
    assert.equal(byRoot.status, 200);
    assert.equal(byRoot.body.mainRole.key, 'owner');
    assert.equal(store.getUserById(charlie.id).companyRoles.find((r) => r.companyId === '1').role, 'Admin', 'Owner stands for Admin');
    // ...and under v2 the Admin cannot now change the Owner's roles (someone
    // above them). Under legacy/shadow an Owner main role decides nothing yet:
    // the legacy role (Admin) does, which is no higher than the Admin.
    assert.equal((await as(admin).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: roleId('employee'), addOnRoleIds: [] })).status, engine === 'v2' ? 403 : 200);
    assert.equal((await as(root).put(`/companies/1/people/${charlie.id}/roles`, { mainRoleId: roleId('employee'), addOnRoleIds: [] })).status, 200);

    // Lock-out: the only Admin of company 1 cannot step down to Manager.
    const lockout = await as(admin).put(`/companies/1/people/${admin.id}/roles`, { mainRoleId: roleId('manager'), addOnRoleIds: [] });
    assert.equal(lockout.status, 409);
    assert.equal(store.getUserById(admin.id).companyRoles.find((r) => r.companyId === '1').role, 'Admin', 'rolled back');
    assert.equal((await as(admin).get(`/companies/1/people/${admin.id}`)).body.mainRole.key, 'admin');

    // Group-wide people (Ruling P): listed read-only under v2; not under legacy/shadow.
    const group = store.authz.createHoldingGroup({ name: 'GIG Holding' }, null);
    store.authz.attachCompany(group.id, '1', null);
    store.authz.attachCompany(group.id, '2', null);
    store.authz.setHoldingAssignment(group.id, dana.id, { mainRoleKey: 'accountant', addOnRoleKeys: [] }, null);
    const withGroup = (await as(admin).get('/companies/1/people')).body;
    const d = withGroup.find((p) => p.userId === dana.id);
    if (engine === 'v2') {
      assert.ok(d, 'group person listed');
      assert.equal(d.readOnly, true);
      assert.deepEqual(d.viaGroup, { id: group.id, name: 'GIG Holding' });
      assert.deepEqual(d.groupRoles.map((r) => r.key), ['accountant']);
      assert.ok(d.summary.length > 0);
      const put = await as(admin).put(`/companies/1/people/${dana.id}/roles`, { mainRoleId: roleId('employee'), addOnRoleIds: [] });
      assert.equal(put.status, 403);
      assert.equal(put.body.details?.code ?? put.body.code, 'GROUP_PERSON');
      assert.equal((await as(dana).get('/me/permissions?companyId=1')).status, 200, 'reach through the group');
    } else {
      assert.equal(d, undefined);
      assert.equal((await as(admin).put(`/companies/1/people/${dana.id}/roles`, { mainRoleId: roleId('employee'), addOnRoleIds: [] })).status, 404);
      assert.equal((await as(dana).get('/me/permissions?companyId=1')).status, 403);
    }
    // A member who also has a group role shows it.
    store.authz.setHoldingAssignment(group.id, samantha.id, { mainRoleKey: 'manager', addOnRoleKeys: [] }, null);
    const s = (await as(admin).get('/companies/1/people')).body.find((p) => p.userId === samantha.id);
    assert.equal(s.readOnly, false);
    assert.deepEqual(s.groupRoles.map((r) => r.key), ['manager']);
  });
}
