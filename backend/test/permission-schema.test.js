const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { DataStore } = require('../dist/data/store');

const freshPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-perm-'));
  return path.join(dir, 'taskflow.db');
};

const freshDb = () => {
  const dbPath = freshPath();
  new DataStore({ dbPath, seedOnEmpty: false });
  return new Database(dbPath, { readonly: true });
};

const tableNames = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);

test('migration creates every permission table', () => {
  const names = tableNames(freshDb());
  for (const expected of [
    'permission_groups',
    'group_implications',
    'group_permissions',
    'user_group_assignments',
    'authz_version',
    'fga_outbox',
    'authz_divergence',
  ]) {
    assert.ok(names.includes(expected), `missing table ${expected}`);
  }
});

test('authz_version is seeded with exactly one row', () => {
  const rows = freshDb().prepare('SELECT id, version FROM authz_version').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0].version, 1);
});

test('authz_version cannot gain a second row', () => {
  const dbPath = freshPath();
  new DataStore({ dbPath, seedOnEmpty: false });
  const db = new Database(dbPath);
  assert.throws(() => db.prepare('INSERT INTO authz_version (id, version) VALUES (2, 1)').run(),
    /CHECK constraint failed/);
});

test('permission_groups enforces a unique key per company', () => {
  const dbPath = freshPath();
  new DataStore({ dbPath, seedOnEmpty: false });
  const db = new Database(dbPath);
  const insert = db.prepare(
    "INSERT INTO permission_groups (id, companyId, key, name, isSystem, isActive, createdAt) VALUES (?,?,?,?,0,1,'now')",
  );
  insert.run('g1', 'c1', 'clerk', 'Clerk');
  assert.throws(() => insert.run('g2', 'c1', 'clerk', 'Clerk Again'), /UNIQUE/);
  insert.run('g3', 'c2', 'clerk', 'Clerk');
});

test('running migrations twice is a no-op', () => {
  const dbPath = freshPath();
  new DataStore({ dbPath, seedOnEmpty: false });
  new DataStore({ dbPath, seedOnEmpty: false });
  const db = new Database(dbPath, { readonly: true });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM authz_version').get().c, 1);
});
