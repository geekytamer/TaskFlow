const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { subtreeIds, topOf, wouldCycle, childIds } = require('../dist/companies/tree');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * A group is a company: companies form a tree through parentCompanyId, and
 * each top company with children keeps one holding group in step with it.
 */

let seq = 0;
const makeUser = (store, companyIds, role) =>
  store.createUser({
    name: `t${++seq}`,
    email: `t${seq}@tree.test`,
    role,
    companyIds,
    companyRoles: companyIds.map((companyId) => ({ companyId, role })),
    password: 'x',
  });

const roleIn = (user, companyId) => user.companyRoles?.find((r) => r.companyId === companyId)?.role;

// ── Pure tree helpers ────────────────────────────────────────────────

const tree = [
  { id: 'g' },
  { id: 'a', parentCompanyId: 'g' },
  { id: 'b', parentCompanyId: 'g' },
  { id: 'a1', parentCompanyId: 'a' },
  { id: 'solo', parentCompanyId: null },
];

test('subtreeIds lists the root, then its descendants breadth-first', () => {
  assert.deepEqual(subtreeIds(tree, 'g'), ['g', 'a', 'b', 'a1']);
  assert.deepEqual(subtreeIds(tree, 'a'), ['a', 'a1']);
  assert.deepEqual(subtreeIds(tree, 'solo'), ['solo']);
});

test('topOf climbs to the company without a parent', () => {
  assert.equal(topOf(tree, 'a1'), 'g');
  assert.equal(topOf(tree, 'g'), 'g');
  assert.equal(topOf(tree, 'solo'), 'solo');
});

test('wouldCycle refuses a parent inside the child\'s own subtree', () => {
  assert.equal(wouldCycle(tree, 'g', 'a1'), true);
  assert.equal(wouldCycle(tree, 'a', 'a'), true);
  assert.equal(wouldCycle(tree, 'solo', 'a1'), false);
  assert.equal(wouldCycle(tree, 'a1', 'b'), false);
});

test('childIds lists direct children only', () => {
  assert.deepEqual(childIds(tree, 'g').sort(), ['a', 'b']);
  assert.deepEqual(childIds(tree, 'a1'), []);
});

// ── Migration 154 ────────────────────────────────────────────────────

test('migration 154 turns each holding group into a parent company, once', () => {
  const dbPath = path.join(makeTmpDir('taskflow-tree-mig-'), 'taskflow.db');
  let store = new DataStore({ dbPath, seedOnEmpty: false });
  const acme = store.createCompany({ name: 'Acme' });
  const beta = store.createCompany({ name: 'Beta' });
  const bothAdmin = makeUser(store, [acme.id, beta.id], 'Admin');
  const oneAdmin = makeUser(store, [acme.id], 'Admin');
  const groupAdmin = makeUser(store, [beta.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Acme Group' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.attachCompany(group.id, beta.id, null);
  store.authz.setHoldingAdmins(group.id, [groupAdmin.id], null);
  // As a database that ran up to 153 would look: no tree yet.
  store.db.prepare('UPDATE companies SET parentCompanyId = NULL').run();
  store.db.prepare('UPDATE holding_groups SET companyId = NULL').run();
  store.db.prepare("DELETE FROM schema_migrations WHERE id = '154_company_tree'").run();
  store.db.close();

  store = new DataStore({ dbPath, seedOnEmpty: false });
  const companies = store.listCompanies();
  const parent = companies.find((c) => c.name === 'Acme Group');
  assert.ok(parent, 'a company named after the group');
  assert.equal(store.getCompanyById(acme.id).parentCompanyId, parent.id);
  assert.equal(store.getCompanyById(beta.id).parentCompanyId, parent.id);
  assert.equal(store.db.prepare('SELECT companyId FROM holding_groups WHERE id = ?').get(group.id).companyId, parent.id);
  assert.equal(store.db.prepare('SELECT holdingGroupId FROM companies WHERE id = ?').get(parent.id).holdingGroupId, group.id);
  assert.equal(roleIn(store.getUserById(bothAdmin.id), parent.id), 'Admin', 'Admin in every member company');
  assert.equal(roleIn(store.getUserById(groupAdmin.id), parent.id), 'Admin', 'a group admin');
  assert.equal(roleIn(store.getUserById(oneAdmin.id), parent.id), undefined, 'Admin in one company only');

  store.db.prepare("DELETE FROM schema_migrations WHERE id = '154_company_tree'").run();
  store.db.close();
  store = new DataStore({ dbPath, seedOnEmpty: false });
  assert.equal(store.listCompanies().filter((c) => c.name === 'Acme Group').length, 1, 're-running adds nothing');
  store.db.close();
});

// ── Moving companies (Task 2) ────────────────────────────────────────

const { effective } = require('../dist/authz/evaluate');
const request = require('supertest');
const { createServer } = require('../dist/server');

const freshStore = () =>
  new DataStore({ dbPath: path.join(makeTmpDir('taskflow-tree-'), 'taskflow.db'), seedOnEmpty: false });

const groupOf = (store, companyId) =>
  store.db.prepare('SELECT holdingGroupId FROM companies WHERE id = ?').get(companyId).holdingGroupId;

test('setCompanyParent refuses a cycle, itself, and a training company, and changes nothing', () => {
  const store = freshStore();
  const g = store.createCompany({ name: 'G' });
  const a = store.createCompany({ name: 'A' });
  store.setCompanyParent(a.id, g.id, null);
  assert.throws(() => store.setCompanyParent(g.id, a.id, null), (e) => e.status === 400);
  assert.throws(() => store.setCompanyParent(a.id, a.id, null), (e) => e.status === 400);
  const practice = store.createCompany({ name: 'Practice' });
  store.db.prepare('UPDATE companies SET isTraining = 1 WHERE id = ?').run(practice.id);
  assert.throws(() => store.setCompanyParent(practice.id, g.id, null), (e) => e.status === 400);
  assert.throws(() => store.setCompanyParent(a.id, practice.id, null), (e) => e.status === 400);
  assert.equal(store.getCompanyById(g.id).parentCompanyId, undefined);
  assert.equal(store.getCompanyById(a.id).parentCompanyId, g.id);
});

test('a group-wide person reaches the group company and its children; a move takes that access along', () => {
  const store = freshStore();
  const g = store.createCompany({ name: 'G' });
  const a = store.createCompany({ name: 'A' });
  const b = store.createCompany({ name: 'B' });
  const h = store.createCompany({ name: 'H' });
  store.setCompanyParent(a.id, g.id, null);
  store.setCompanyParent(b.id, g.id, null);
  const gGroup = groupOf(store, g.id);
  assert.ok(gGroup, 'the top company has a holding group');
  assert.equal(groupOf(store, a.id), gGroup);
  const ceo = makeUser(store, [], 'Employee');
  store.authz.setHoldingAssignment(gGroup, ceo.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);
  assert.deepEqual(store.authz.holdingCompanyIds(ceo.id), [g.id, a.id, b.id].sort());

  store.setCompanyParent(a.id, h.id, null);
  const hGroup = groupOf(store, h.id);
  assert.ok(hGroup && hGroup !== gGroup);
  const other = makeUser(store, [], 'Employee');
  store.authz.setHoldingAssignment(hGroup, other.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);
  assert.deepEqual(store.authz.holdingCompanyIds(ceo.id), [g.id, b.id].sort(), 'old group loses the moved company');
  assert.deepEqual(store.authz.holdingCompanyIds(other.id), [h.id, a.id].sort(), 'new group gains it');
  assert.ok(effective(store, other.id).byCompany.get(a.id).grants.has('finance.view'));
});

test('removing the last child leaves a plain company; its holding group survives, empty', () => {
  const store = freshStore();
  const g = store.createCompany({ name: 'G' });
  const a = store.createCompany({ name: 'A' });
  store.setCompanyParent(a.id, g.id, null);
  const group = groupOf(store, g.id);
  store.setCompanyParent(a.id, null, null);
  assert.equal(store.getCompanyById(a.id).parentCompanyId, undefined);
  assert.equal(groupOf(store, a.id), null);
  assert.equal(groupOf(store, g.id), null);
  assert.ok(store.authz.holdingGroup(group), 'the group (and its templates) is kept');
  assert.deepEqual(store.authz.holdingGroup(group).companyIds, []);
});

test('putting two companies under a new group changes nobody\'s access in them, under legacy or v2', () => {
  const store = freshStore();
  const a = store.createCompany({ name: 'A' });
  const b = store.createCompany({ name: 'B' });
  const people = [
    makeUser(store, [a.id, b.id], 'Admin'), makeUser(store, [a.id], 'Manager'),
    makeUser(store, [b.id], 'Employee'), makeUser(store, [a.id, b.id], 'Accountant'),
  ];
  const snapshot = () => people.map((p) => {
    const eff = effective(store, p.id);
    const user = store.getUserById(p.id);
    return [a.id, b.id].map((c) => ({
      member: (user.companyIds ?? []).includes(c),
      role: roleIn(user, c) ?? null,
      grants: [...(eff.byCompany.get(c)?.grants.keys() ?? [])].sort(),
    }));
  });
  const before = snapshot();
  const group = store.createGroupCompany('New Group', people[0].id).company;
  store.setCompanyParent(a.id, group.id, null);
  store.setCompanyParent(b.id, group.id, null);
  assert.deepEqual(snapshot(), before);
  assert.equal(roleIn(store.getUserById(people[0].id), group.id), 'Admin', 'the creator runs the group company');
});

test('routes: the super admin creates a group (its company too), attaches and moves companies', async () => {
  const store = freshStore();
  const quiet = { info() {}, warn() {}, error() {} };
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: 'v2', logger: quiet }).listen(0);
  server.unref();
  const root = makeUser(store, [], 'Employee');
  store.db.prepare('UPDATE users SET isSuperAdmin = 1 WHERE id = ?').run(root.id);
  const auth = (r) => r.set('Authorization', `Bearer ${store.issueToken(root.id)}`);
  const a = store.createCompany({ name: 'A' });

  const created = await auth(request(server).post('/holding-groups')).send({ name: 'Al Group' });
  assert.equal(created.status, 201);
  assert.ok(created.body.companyId, 'the group names its company');
  assert.equal(store.getCompanyById(created.body.companyId).name, 'Al Group');

  const attached = await auth(request(server).post(`/holding-groups/${created.body.id}/companies`)).send({ companyId: a.id });
  assert.equal(attached.status, 200);
  assert.equal(store.getCompanyById(a.id).parentCompanyId, created.body.companyId);

  const own = await auth(request(server).delete(`/holding-groups/${created.body.id}/companies/${created.body.companyId}`));
  assert.equal(own.status, 400, 'the group\'s own company cannot leave it');

  const moved = await auth(request(server).put(`/companies/${a.id}/parent`)).send({ parentCompanyId: null });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.parentCompanyId, undefined);

  const member = makeUser(store, [a.id], 'Admin');
  const refused = await request(server).put(`/companies/${a.id}/parent`)
    .set('Authorization', `Bearer ${store.issueToken(member.id)}`).send({ parentCompanyId: created.body.companyId });
  assert.equal(refused.status, 403);
  server.close();
});

// ── Final review fixes ───────────────────────────────────────────────

test('a group company moved under another group leaves its old holding group behind for good', () => {
  const store = freshStore();
  const t = store.createCompany({ name: 'T' });
  const t1 = store.createCompany({ name: 'T1' });
  const c = store.createCompany({ name: 'C' });
  const c1 = store.createCompany({ name: 'C1' });
  store.setCompanyParent(t1.id, t.id, null);
  store.setCompanyParent(c1.id, c.id, null);
  const gC = groupOf(store, c.id);
  const old = makeUser(store, [], 'Employee');
  store.authz.setHoldingAssignment(gC, old.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);

  store.setCompanyParent(c.id, t.id, null);
  assert.equal(store.authz.holdingGroup(gC).companyId, null, 'the old group no longer stands for C');
  assert.deepEqual(store.authz.holdingCompanyIds(old.id), []);

  store.setCompanyParent(c.id, null, null);
  assert.notEqual(groupOf(store, c.id), gC, 'back at the top, C gets a fresh group');
  assert.deepEqual(store.authz.holdingCompanyIds(old.id), [], 'old group-wide people do not come back');
});

test('a company with companies under it cannot be deleted; deleting a child keeps the tree in step', () => {
  const store = freshStore();
  const g = store.createCompany({ name: 'G' });
  const a = store.createCompany({ name: 'A' });
  store.setCompanyParent(a.id, g.id, null);
  const group = groupOf(store, g.id);
  assert.throws(() => store.deleteCompany(g.id), (e) => e.status === 409);
  store.deleteCompany(a.id);
  assert.equal(groupOf(store, g.id), null, 'G has no children left, so it is no longer a group');
  assert.ok(store.authz.holdingGroup(group));
  const solo = store.createGroupCompany('Solo Group', null);
  store.deleteCompany(solo.company.id);
  assert.equal(store.authz.holdingGroup(solo.holdingGroupId).companyId, null, 'no group points at a deleted company');
});

test('removing a group admin takes back the Admin they got in the group company', async () => {
  const store = freshStore();
  const quiet = { info() {}, warn() {}, error() {} };
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: 'legacy', logger: quiet }).listen(0);
  server.unref();
  const root = makeUser(store, [], 'Employee');
  store.db.prepare('UPDATE users SET isSuperAdmin = 1 WHERE id = ?').run(root.id);
  const put = (url, body) => request(server).put(url).set('Authorization', `Bearer ${store.issueToken(root.id)}`).send(body);
  const created = await request(server).post('/holding-groups').set('Authorization', `Bearer ${store.issueToken(root.id)}`).send({ name: 'Admins Group' });
  const aide = makeUser(store, [], 'Employee');
  assert.equal((await put(`/holding-groups/${created.body.id}/admins`, { userIds: [aide.id] })).status, 200);
  assert.equal(roleIn(store.getUserById(aide.id), created.body.companyId), 'Admin');
  assert.equal((await put(`/holding-groups/${created.body.id}/admins`, { userIds: [] })).status, 200);
  assert.equal(roleIn(store.getUserById(aide.id), created.body.companyId), undefined);
  assert.equal((store.getUserById(aide.id).companyIds ?? []).includes(created.body.companyId), false);
  server.close();
});

// ── Stage-1 leftovers ────────────────────────────────────────────────

const migrateAgain = (dbPath) => {
  const s = new DataStore({ dbPath, seedOnEmpty: false });
  s.db.prepare("DELETE FROM schema_migrations WHERE id = '154_company_tree'").run();
  s.db.close();
  return new DataStore({ dbPath, seedOnEmpty: false });
};

test('migration 154 with no holding groups adds no company', () => {
  const dbPath = path.join(makeTmpDir('taskflow-tree-none-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  store.createCompany({ name: 'Solo' });
  const before = store.listCompanies().length;
  store.db.close();
  const again = migrateAgain(dbPath);
  assert.equal(again.listCompanies().length, before);
  again.db.close();
});

test('migration 154 attaches the parent properly (role copies), and leaves an empty group\'s company unattached', () => {
  const dbPath = path.join(makeTmpDir('taskflow-tree-copies-'), 'taskflow.db');
  let store = new DataStore({ dbPath, seedOnEmpty: false });
  const acme = store.createCompany({ name: 'Acme' });
  const ceo = makeUser(store, [acme.id], 'Employee');
  const group = store.authz.createHoldingGroup({ name: 'Copy Group' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  store.authz.setHoldingAssignment(group.id, ceo.id, { mainRoleKey: 'owner', addOnRoleKeys: [] }, null);
  const empty = store.authz.createHoldingGroup({ name: 'Empty Group' }, null);
  store.db.prepare('UPDATE companies SET parentCompanyId = NULL').run();
  store.db.prepare('UPDATE holding_groups SET companyId = NULL').run();
  store.db.close();
  store = migrateAgain(dbPath);
  const parent = store.listCompanies().find((c) => c.name === 'Copy Group');
  assert.ok(store.authz.listRoles(parent.id).some((r) => r.key === 'group:owner'), 'the group role is copied into the parent');
  assert.ok(effective(store, ceo.id).byCompany.get(parent.id), 'group-wide people reach the parent');
  const emptyCompany = store.authz.holdingGroup(empty.id).companyId;
  assert.ok(emptyCompany, 'an empty group still gets its company');
  assert.equal(groupOf(store, emptyCompany), null, 'but with no companies under it, it is not attached');
  store.db.close();
});

test('a group and its company keep one name', () => {
  const store = freshStore();
  const { company, holdingGroupId } = store.createGroupCompany('Old Name', null);
  store.updateCompany(company.id, { name: 'New Name' });
  assert.equal(store.authz.holdingGroup(holdingGroupId).name, 'New Name');
  store.renameGroup(holdingGroupId, { name: 'Newer Name' }, null);
  assert.equal(store.getCompanyById(company.id).name, 'Newer Name');
});

test('joining a group company keeps a person\'s position in their other companies', () => {
  const store = freshStore();
  const a = store.createCompany({ name: 'A' });
  const g = store.createCompany({ name: 'G' });
  const person = store.createUser({ name: 'P', email: 'p@tree.test', role: 'Manager', companyIds: [a.id], password: 'x', positionId: 'pos-x' });
  store.db.prepare('UPDATE users SET companyRoles = NULL WHERE id = ?').run(person.id);
  store.addCompanyMembership(person.id, g.id, 'Admin');
  const roles = store.getUserById(person.id).companyRoles;
  assert.equal(roles.find((r) => r.companyId === a.id).positionId, 'pos-x');
  assert.equal(roles.find((r) => r.companyId === a.id).role, 'Manager');
});

test('GET /companies does not reveal a parent the viewer cannot open', async () => {
  const store = freshStore();
  const quiet = { info() {}, warn() {}, error() {} };
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: 'legacy', logger: quiet }).listen(0);
  server.unref();
  const g = store.createCompany({ name: 'G' });
  const a = store.createCompany({ name: 'A' });
  store.setCompanyParent(a.id, g.id, null);
  const member = makeUser(store, [a.id], 'Employee');
  const res = await request(server).get('/companies').set('Authorization', `Bearer ${store.issueToken(member.id)}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.find((c) => c.id === a.id).parentCompanyId, undefined);
  server.close();
});

test('groupUp: a new group over existing companies, run by whoever is Admin in all of them', () => {
  const store = freshStore();
  const a = store.createCompany({ name: 'A' });
  const b = store.createCompany({ name: 'B' });
  const owner = makeUser(store, [a.id, b.id], 'Admin');
  const partAdmin = makeUser(store, [a.id], 'Admin');
  const group = store.groupUp('AB Group', [a.id, b.id], null);
  assert.equal(store.getCompanyById(a.id).parentCompanyId, group.id);
  assert.equal(store.getCompanyById(b.id).parentCompanyId, group.id);
  assert.equal(roleIn(store.getUserById(owner.id), group.id), 'Admin');
  assert.equal(roleIn(store.getUserById(partAdmin.id), group.id), undefined);
  assert.throws(() => store.groupUp('Again', [a.id], null), (e) => e.status === 409, 'a company already in a group is not taken');
});
