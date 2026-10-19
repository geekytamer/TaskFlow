const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { effective } = require('../dist/authz/evaluate');
const { TEMPLATES } = require('../dist/authz/templates');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Holding groups (Task 8): super admin builds groups; group admins manage
 * group-wide people and the group's template library. Group-wide assignments
 * live only in holding_group_assignments and are expanded at read time
 * (Ruling H); each company gets a read-only copy of every group role in use.
 */

const quiet = { info() {}, warn() {}, error() {} };

const freshStore = () =>
  new DataStore({ dbPath: path.join(makeTmpDir('taskflow-holding-'), 'taskflow.db'), seedOnEmpty: false });

let seq = 0;
const makeUser = (store, companyIds, role) =>
  store.createUser({
    name: `h${++seq}`,
    email: `h${seq}@holding.test`,
    role,
    companyIds,
    companyRoles: companyIds.map((companyId) => ({ companyId, role })),
    password: 'x',
  });

const copiesOf = (store, companyId) =>
  store.authz.listRoles(companyId).filter((r) => r.holdingGroupId);

const sorted = (grants) => [...grants].sort((a, b) => a.key.localeCompare(b.key));

// ── Store level ──────────────────────────────────────────────────────

test('a group-wide Owner reaches a company attached later at once; detaching removes it at once', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);

  // Materialised read-only copy in the company, not a user assignment (Ruling H).
  const [copy] = copiesOf(store, acme.id);
  assert.equal(copy.key, 'group:owner');
  assert.equal(copy.holdingGroupId, group.id);
  assert.deepEqual(sorted(copy.grants), sorted(TEMPLATES.owner.grants));
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM user_group_assignments WHERE groupId = ?').get(copy.id).n, 0);

  assert.equal(effective(store, ceo.id).byCompany.get(beta.id), undefined);
  const before = store.getAuthzVersion();
  store.authz.attachCompany(group.id, beta.id, null);
  assert.ok(store.getAuthzVersion() > before, 'attach bumps the version');
  let eff = effective(store, ceo.id);
  assert.ok(eff.byCompany.get(beta.id).grants.has('finance.view'), 'owner reaches the new company');
  const source = eff.byCompany.get(beta.id).grants.get('finance.view').sources[0];
  assert.equal(source.kind, 'holding');
  assert.equal(source.roleId, copiesOf(store, beta.id)[0].id, 'decided by the company copy');

  store.authz.detachCompany(beta.id, null);
  eff = effective(store, ceo.id);
  assert.equal(eff.byCompany.get(beta.id), undefined, 'detach removes group-wide access at once');
  assert.deepEqual(copiesOf(store, beta.id), [], 'detach removes the copies');
  assert.ok(eff.byCompany.get(acme.id).grants.has('finance.view'), 'other companies keep it');
});

test("a company's own role with the same key does not decide group-wide people", () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'admin', addOnRoleKeys: [] }, null);
  // The company strips its own Admin role down to tasks only.
  const own = store.authz.listRoles(acme.id).find((r) => r.key === 'admin');
  store.authz.saveRole(acme.id, { id: own.id, name: own.name, grants: [{ key: 'tasks.view', scope: 'own' }], fields: [] }, null);
  assert.ok(effective(store, ceo.id).byCompany.get(acme.id).grants.has('finance.view'), 'group copy, not the company role');
});

test('group-materialised and group-level roles refuse saveRole and deleteRole with 403', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);
  const [copy] = copiesOf(store, acme.id);
  const template = store.authz.saveHoldingTemplate(group.id, 'auditor', { name: 'Auditor', grants: [{ key: 'finance.view' }], fields: [] }, null);

  assert.ok(template.roleId);
  for (const role of [copy, { id: template.roleId }]) {
    assert.throws(
      () => store.authz.saveRole(acme.id, { id: role.id, name: 'Mine', grants: [], fields: [] }, null),
      (e) => e.status === 403 && /group/i.test(e.message),
    );
    assert.throws(() => store.authz.deleteRole(role.id, null), (e) => e.status === 403);
  }
  assert.equal(store.authz.getRole(copy.id).name, copy.name, 'unchanged');
});

test('the group template library: system templates plus group-defined ones; assignments must use it', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const user = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  const other = store.authz.createHoldingGroup({ name: 'Other' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.saveHoldingTemplate(other.id, 'auditor', { name: 'Auditor', grants: [{ key: 'finance.view' }], fields: [] }, null);
  assert.throws(() => store.authz.setHoldingAssignment(group.id, user.id, { mainRoleKey: null, addOnRoleKeys: ['auditor'] }, null), /Unknown group role/);
  assert.throws(() => store.authz.saveHoldingTemplate(group.id, 'Bad Key!', { name: 'x', grants: [], fields: [] }, null), /key/i);
  store.authz.saveHoldingTemplate(group.id, 'auditor', { name: 'Auditor', grants: [{ key: 'finance.view' }], fields: [] }, null);
  const keys = store.authz.holdingTemplates(group.id).map((t) => `${t.key}:${t.source}`);
  assert.deepEqual(keys, ['owner:system', 'admin:system', 'manager:system', 'accountant:system', 'employee:system', 'auditor:group']);

  const start = new Date(Date.now() - 1000).toISOString();
  const end = new Date(Date.now() + 3600_000).toISOString();
  store.authz.setHoldingAssignment(group.id, user.id, { mainRoleKey: null, addOnRoleKeys: ['auditor'], startsAt: start, endsAt: end }, null);
  assert.deepEqual(store.authz.holdingAssignments(group.id).map((a) => [a.roleKey, a.isMain, a.startsAt, a.endsAt]), [['auditor', false, start, end]]);
  const grant = effective(store, user.id).byCompany.get(acme.id).grants.get('finance.view');
  assert.equal(grant.sources[0].until, end);
  assert.throws(() => store.authz.setHoldingAssignment(group.id, user.id, { mainRoleKey: 'owner', addOnRoleKeys: [], startsAt: end, endsAt: start }, null), /end/i);
  // Clearing the person removes the copies nobody uses any more.
  store.authz.setHoldingAssignment(group.id, user.id, { mainRoleKey: null, addOnRoleKeys: [] }, null);
  assert.deepEqual(store.authz.holdingAssignments(group.id), []);
  assert.deepEqual(copiesOf(store, acme.id), []);
});

test('push updates only copies and company roles still equal to a version the group supplied', () => {
  const store = freshStore();
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const gamma = store.createCompany({ name: 'Gamma', website: '', address: '' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  [acme, beta, gamma].forEach((c) => store.authz.attachCompany(group.id, c.id, null));
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'admin', addOnRoleKeys: [] }, null);

  // Beta customises its own Admin role; Gamma's copy was tampered with (raw SQL).
  const betaAdmin = store.authz.listRoles(beta.id).find((r) => r.key === 'admin');
  store.authz.saveRole(beta.id, { id: betaAdmin.id, name: betaAdmin.name, grants: betaAdmin.grants.filter((g) => g.key !== 'payroll.view'), fields: betaAdmin.fields }, null);
  const gammaCopy = copiesOf(store, gamma.id)[0];
  store.db.prepare(`DELETE FROM role_permissions WHERE groupId = ? AND key = 'tasks.view'`).run(gammaCopy.id);

  // The group edits Admin: drops finance.view.
  const next = TEMPLATES.admin.grants.filter((g) => g.key !== 'finance.view');
  assert.ok(next.length < TEMPLATES.admin.grants.length);
  store.authz.saveHoldingTemplate(group.id, 'admin', { name: 'Admin', grants: next, fields: TEMPLATES.admin.fields }, null);
  // Nothing in the companies changes until the push.
  assert.ok(effective(store, ceo.id).byCompany.get(acme.id).grants.has('finance.view'));

  const report = store.authz.pushHoldingTemplate(group.id, 'admin', null);
  const ids = (list) => list.map((r) => `${r.companyId}:${r.roleKey}`).sort();
  assert.deepEqual(ids(report.updated), [`${acme.id}:admin`, `${acme.id}:group:admin`, `${beta.id}:group:admin`, `${gamma.id}:admin`].sort());
  assert.deepEqual(ids(report.customised), [`${beta.id}:admin`, `${gamma.id}:group:admin`].sort());
  assert.ok(report.customised.every((r) => r.message === 'customised — not updated'));

  assert.deepEqual(sorted(copiesOf(store, acme.id)[0].grants), sorted(next));
  const betaAfter = store.authz.listRoles(beta.id).find((r) => r.key === 'admin').grants;
  assert.ok(!betaAfter.some((g) => g.key === 'payroll.view') && betaAfter.some((g) => g.key === 'finance.view'), 'customised role untouched');
  assert.equal(effective(store, ceo.id).byCompany.get(acme.id).grants.has('finance.view'), false, 'group-wide person follows the pushed copy');

  // A second edit: copies at the first version and at the second both count as unchanged.
  store.authz.saveHoldingTemplate(group.id, 'admin', { name: 'Admin', grants: TEMPLATES.admin.grants, fields: TEMPLATES.admin.fields }, null);
  const again = store.authz.pushHoldingTemplate(group.id, 'admin', null);
  assert.deepEqual(ids(again.customised), [`${beta.id}:admin`, `${gamma.id}:group:admin`].sort());
  assert.equal(again.updated.length, 4);
});

// ── HTTP, under every engine ─────────────────────────────────────────

const build = (engine) => {
  const dbPath = path.join(makeTmpDir(`taskflow-holding-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet });
  const server = app.listen(0);
  server.unref();
  const byEmail = (email) => store.listUsers().find((u) => u.email === email);
  const auth = (user) => `Bearer ${store.issueToken(user.id)}`;
  const root = makeUser(store, ['1'], 'Employee');
  store.db.prepare('UPDATE users SET isSuperAdmin = 1 WHERE id = ?').run(root.id);
  return { server, store, byEmail, auth, root: store.getUserById(root.id) };
};

for (const engine of ['legacy', 'shadow', 'v2']) {
  test(`holding group routes: super admin builds, group admins manage only their group (${engine})`, async () => {
    const { server, store, byEmail, auth, root } = build(engine);
    const companyAdmin = byEmail('admin@taskflow.com'); // Admin in every company, not a group admin
    const dana = byEmail('dana.s@synergysolutions.com');
    const charlie = byEmail('charlie.d@innovatecorp.com');
    const as = (user) => ({
      get: (url) => request(server).get(url).set('Authorization', auth(user)),
      post: (url, body) => request(server).post(url).set('Authorization', auth(user)).send(body ?? {}),
      put: (url, body) => request(server).put(url).set('Authorization', auth(user)).send(body ?? {}),
      del: (url) => request(server).delete(url).set('Authorization', auth(user)),
    });

    // Only the super admin creates groups and attaches companies.
    assert.equal((await as(companyAdmin).post('/holding-groups', { name: 'Nope' })).status, 403);
    const created = await as(root).post('/holding-groups', { name: 'GIG Holding', nameAr: 'القابضة' });
    assert.equal(created.status, 201);
    const g = created.body.id;
    const other = (await as(root).post('/holding-groups', { name: 'Other' })).body.id;
    assert.equal((await as(root).put(`/holding-groups/${g}`, { name: 'GIG Group' })).body.name, 'GIG Group');
    assert.equal((await as(root).post(`/holding-groups/${g}/companies`, { companyId: '1' })).status, 200);
    assert.equal((await as(root).post(`/holding-groups/${g}/companies`, { companyId: '2' })).status, 200);
    assert.equal((await as(root).post(`/holding-groups/${other}/companies`, { companyId: '2' })).status, 409, 'one group per company');
    assert.equal((await as(companyAdmin).post(`/holding-groups/${g}/companies`, { companyId: '3' })).status, 403);

    // Group admins.
    assert.equal((await as(companyAdmin).put(`/holding-groups/${g}/admins`, { userIds: [companyAdmin.id] })).status, 403);
    assert.equal((await as(root).put(`/holding-groups/${g}/admins`, { userIds: [dana.id] })).status, 200);
    const read = await as(dana).get(`/holding-groups/${g}`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body.companies.map((c) => c.id), ['1', '2']);
    assert.deepEqual(read.body.admins.map((a) => a.id), [dana.id]);
    assert.ok(read.body.templates.some((t) => t.key === 'owner'));
    assert.deepEqual((await as(dana).get('/holding-groups')).body.map((x) => x.id), [g]);

    // Group A's admin cannot touch group B, nor attach/detach companies.
    assert.equal((await as(dana).get(`/holding-groups/${other}`)).status, 403);
    assert.equal((await as(dana).put(`/holding-groups/${other}/assignments/${charlie.id}`, { roleKey: 'owner' })).status, 403);
    assert.equal((await as(dana).put(`/holding-groups/${other}/templates/admin`, { name: 'x', grants: [], fields: [] })).status, 403);
    assert.equal((await as(dana).post(`/holding-groups/${g}/companies`, { companyId: '3' })).status, 403);
    assert.equal((await as(dana).del(`/holding-groups/${g}/companies/1`)).status, 403);
    assert.equal((await as(dana).put(`/holding-groups/${g}`, { name: 'Mine' })).status, 403);
    // A company admin is not a group admin.
    assert.equal((await as(companyAdmin).get(`/holding-groups/${g}`)).status, 403);
    assert.equal((await as(companyAdmin).put(`/holding-groups/${g}/templates/admin`, { name: 'x', grants: [], fields: [] })).status, 403);

    // Group-wide person.
    assert.equal((await as(dana).put(`/holding-groups/${g}/assignments/${charlie.id}`, { roleKey: 'nope' })).status, 400);
    assert.equal((await as(dana).put(`/holding-groups/${g}/assignments/missing-user`, { roleKey: 'owner' })).status, 404);
    const assigned = await as(dana).put(`/holding-groups/${g}/assignments/${charlie.id}`, { roleKey: 'owner', addOnKeys: [] });
    assert.equal(assigned.status, 200);
    assert.deepEqual(assigned.body.assignments.map((a) => [a.userId, a.roleKey, a.isMain]), [[charlie.id, 'owner', true]]);
    assert.ok(effective(store, charlie.id).byCompany.get('2').grants.has('finance.view'));
    assert.equal(effective(store, charlie.id).byCompany.get('3'), undefined);
    await as(root).post(`/holding-groups/${g}/companies`, { companyId: '3' });
    assert.ok(effective(store, charlie.id).byCompany.get('3').grants.has('finance.view'), 'attached later: reached at once');
    assert.equal((await as(root).del(`/holding-groups/${g}/companies/3`)).status, 200);
    assert.equal(effective(store, charlie.id).byCompany.get('3'), undefined, 'detached: gone at once');
    assert.equal((await as(root).del(`/holding-groups/${other}/companies/1`)).status, 404, 'not in that group');

    // The copy is read-only to the company, also through the legacy group routes.
    const copy = store.authz.listRoles('1').find((r) => r.key === 'group:owner');
    assert.ok(copy);
    assert.equal((await as(companyAdmin).put(`/permission-groups/${copy.id}/permissions`, { permissions: [] })).status, 403);
    assert.equal((await as(companyAdmin).del(`/permission-groups/${copy.id}`)).status, 403);
    const legacyList = await as(companyAdmin).get('/companies/1/permission-groups');
    assert.ok(!legacyList.body.some((r) => r.id === copy.id), 'legacy screen does not list group copies');

    // Templates: read, edit, push.
    const tpl = await as(dana).get(`/holding-groups/${g}/templates/owner`);
    assert.equal(tpl.status, 200);
    assert.equal(tpl.body.source, 'system');
    const slimmer = tpl.body.grants.filter((x) => x.key !== 'finance.view');
    const saved = await as(dana).put(`/holding-groups/${g}/templates/owner`, { name: 'Owner', grants: slimmer, fields: tpl.body.fields });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.source, 'group');
    assert.equal((await as(dana).put(`/holding-groups/${g}/templates/owner`, { name: 'Owner', grants: [{ key: 'no.such' }], fields: [] })).status, 400);
    const pushed = await as(dana).post(`/holding-groups/${g}/templates/owner/push`);
    assert.equal(pushed.status, 200);
    assert.ok(pushed.body.updated.some((r) => r.companyId === '1' && r.roleKey === 'group:owner'));
    assert.equal(effective(store, charlie.id).byCompany.get('1').grants.has('finance.view'), false);
    assert.equal((await as(dana).get(`/holding-groups/${g}/templates/unknown`)).status, 404);

    // Audit carries the group.
    assert.ok(store.authz.audit({ holdingGroupId: g }).some((a) => a.entity === 'holding_template'));
    if (engine === 'shadow') assert.deepEqual(store.listAuthzDivergences(), []);
  });
}
