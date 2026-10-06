const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Companies created before the audit's new routes have built-in groups without
 * the permissions those routes check under OpenFGA (task, quotation and
 * warehouse delete, item restore). Migration 103 adds exactly those, to the
 * built-in groups only, and never removes anything an admin changed.
 */

const NEW = {
  admin: ['inventory:delete', 'inventory:inventory-items.restore.create', 'inventory:warehouses.delete', 'sales:delete', 'tasks:delete'],
  manager: ['inventory:delete', 'inventory:inventory-items.restore.create', 'inventory:warehouses.delete', 'sales:delete', 'tasks:delete'],
  accountant: ['inventory:delete', 'sales:delete', 'tasks:delete'],
  employee: ['tasks:delete'],
};

test('existing built-in groups gain the new route permissions once; custom groups and removals elsewhere are untouched', () => {
  const dbPath = path.join(makeTmpDir('taskflow-backfill-'), 'taskflow.db');
  let store = new DataStore({ dbPath, seedOnEmpty: true });
  const db = store.db;
  const systemGroups = db.prepare("SELECT id, key FROM permission_groups WHERE companyId = '1' AND isSystem = 1").all();
  assert.ok(systemGroups.length >= 4);
  // Rewind to how a company created before the audit looks, plus one admin choice to keep.
  for (const g of systemGroups) {
    for (const perm of NEW[g.key] ?? []) {
      const [module, action] = perm.split(':');
      db.prepare('DELETE FROM group_permissions WHERE groupId = ? AND module = ? AND action = ?').run(g.id, module, action);
    }
  }
  const admin = systemGroups.find((g) => g.key === 'admin');
  db.prepare("DELETE FROM group_permissions WHERE groupId = ? AND module = 'sales' AND action = 'cancel'").run(admin.id);
  db.prepare("INSERT INTO permission_groups (id, companyId, key, name, isSystem, isActive, createdAt) VALUES ('custom-1', '1', 'drivers', 'Drivers', 0, 1, '2026-01-01')").run();
  db.prepare("DELETE FROM schema_migrations WHERE id = '103_backfill_new_route_permissions'").run();
  store.db.close();

  store = new DataStore({ dbPath, seedOnEmpty: false });
  const reopened = store.db;
  const after = (key) => reopened.prepare(
    "SELECT p.module || ':' || p.action AS perm FROM group_permissions p JOIN permission_groups g ON g.id = p.groupId WHERE g.companyId = '1' AND g.key = ?",
  ).all(key).map((r) => r.perm);
  for (const [key, perms] of Object.entries(NEW)) {
    const have = new Set(after(key));
    for (const perm of perms) assert.ok(have.has(perm), `${key} lacks ${perm}`);
  }
  assert.equal(after('admin').includes('sales:cancel'), false, 'an admin removal stays removed');
  assert.deepEqual(after('drivers'), [], 'custom groups gain nothing');
});
