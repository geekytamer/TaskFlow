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
