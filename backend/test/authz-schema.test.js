const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');

const { DataStore } = require('../dist/data/store');
const { convertLegacyGrants } = require('../dist/authz/authz-store');
const { TEMPLATES, TEMPLATE_KEYS } = require('../dist/authz/templates');
const { OLD_RULE_SCOPES, OLD_TO_NEW } = require('../dist/authz/legacy-map');
const { findAction } = require('../dist/authz/catalogue');
const { makeTmpDir } = require('./helpers/tmp');

const freshPath = () => path.join(makeTmpDir('taskflow-authz-schema-'), 'taskflow.db');

const makeUser = (store, companyIds, role, email) =>
  store.createUser({
    name: email,
    email,
    role,
    companyIds,
    companyRoles: companyIds.map((companyId) => ({ companyId, role })),
    password: 'x',
  });

const sortGrants = (grants) =>
  [...grants].map((g) => ({ key: g.key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined ? { limit: g.limit } : {}) }))
    .sort((a, b) => a.key.localeCompare(b.key));
const sortFields = (fields) => [...fields].sort((a, b) => a.key.localeCompare(b.key));

/** Everything the v2 migration may write, for a before/after comparison. */
const snapshot = (dbPath) => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const all = (sql) => db.prepare(sql).all();
    return {
      roles: all('SELECT id, companyId, key, isSystem, isActive, templateKey, needsReview, convertedAt FROM permission_groups ORDER BY id'),
      grants: all('SELECT * FROM role_permissions ORDER BY groupId, key'),
      fields: all('SELECT * FROM role_fields ORDER BY groupId, field'),
      assignments: all('SELECT * FROM user_group_assignments ORDER BY userId, companyId, groupId'),
      legacy: all('SELECT * FROM group_permissions ORDER BY groupId, module, action'),
      audit: all('SELECT COUNT(*) n FROM permission_audit'),
      version: all('SELECT version FROM authz_version'),
    };
  } finally {
    db.close();
  }
};

/**
 * Builds a database shaped as production is today (migration 134): four
 * system groups per company with legacy grants, a custom group with old keys,
 * users whose legacy role lives in companyRoles. Then rewinds every v2 trace so
 * reopening the store runs migration 139 against it for real.
 */
const legacyShapedDb = () => {
  const dbPath = freshPath();
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const admin = makeUser(store, [acme.id, beta.id], 'Admin', 'admin@acme.test');
  const clerk = makeUser(store, [acme.id], 'Employee', 'clerk@acme.test');
  const boss = makeUser(store, [acme.id], 'Manager', 'boss@acme.test');
  const custom = store.createPermissionGroup({ companyId: acme.id, key: 'billing', name: 'Billing' });
  store.setGroupPermissions(custom.id, [
    { module: 'invoices', action: 'read' },
    { module: 'tasks', action: 'write' },
    { module: 'tasks', action: 'all.read' },
    { module: 'crm', action: 'all.read' },
    { module: 'payroll', action: 'pay.read' },
    { module: 'bogus', action: 'thing' },
  ]);
  store.assignUserToGroup(clerk.id, acme.id, custom.id);
  // An extra system group beside the main role, as an admin could add by hand.
  const accountant = store.getPermissionGroupByKey(acme.id, 'accountant');
  store.assignUserToGroup(clerk.id, acme.id, accountant.id);
  const legacyBefore = {
    clerk: store.getEffectivePermissions(clerk.id, acme.id).sort(),
    admin: store.getEffectivePermissions(admin.id, acme.id).sort(),
  };

  const db = new Database(dbPath);
  db.exec(`
    DELETE FROM role_permissions;
    DELETE FROM role_fields;
    DELETE FROM permission_audit;
    DELETE FROM user_group_assignments WHERE groupId IN (SELECT id FROM permission_groups WHERE key = 'owner');
    DELETE FROM permission_groups WHERE key = 'owner';
    UPDATE permission_groups SET templateKey = NULL, needsReview = 0, convertedAt = NULL;
    UPDATE user_group_assignments SET isMain = 0, isActive = 1;
    DELETE FROM schema_migrations WHERE id = '139_authz_v2';
  `);
  const versionBefore = db.prepare('SELECT version FROM authz_version').get().version;
  db.close();

  return { dbPath, acme, beta, admin, clerk, boss, custom, legacyBefore, versionBefore };
};

test('migration 139 creates the v2 tables and columns', () => {
  const dbPath = freshPath();
  new DataStore({ dbPath, seedOnEmpty: false });
  const db = new Database(dbPath, { readonly: true });
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  for (const t of ['role_permissions', 'role_fields', 'holding_groups', 'holding_group_admins', 'holding_group_assignments', 'record_shares', 'permission_audit']) {
    assert.ok(tables.has(t), `missing table ${t}`);
  }
  const cols = (t) => new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  for (const c of ['templateKey', 'holdingGroupId', 'needsReview', 'convertedAt']) assert.ok(cols('permission_groups').has(c), c);
  for (const c of ['isMain', 'isActive', 'startsAt', 'endsAt', 'delegatedBy', 'reason', 'viaHoldingGroupId']) assert.ok(cols('user_group_assignments').has(c), c);
  assert.ok(cols('companies').has('holdingGroupId'));
  for (const c of ['id', 'companyId', 'holdingGroupId', 'actorUserId', 'entity', 'entityId', 'before', 'after', 'at']) assert.ok(cols('permission_audit').has(c), c);
  const companyCol = db.prepare('PRAGMA table_info(permission_groups)').all().find((c) => c.name === 'companyId');
  assert.equal(companyCol.notnull, 0, 'group-level roles have no company');
  db.close();
});

test('migration on a legacy-shaped database: system roles from templates, main assignments, owner role', () => {
  const fx = legacyShapedDb();
  const store = new DataStore({ dbPath: fx.dbPath, seedOnEmpty: false });

  for (const company of [fx.acme, fx.beta]) {
    const roles = store.authz.listRoles(company.id);
    for (const key of TEMPLATE_KEYS) {
      const role = roles.find((r) => r.key === key && r.isSystem);
      assert.ok(role, `${company.name} has system role ${key}`);
      assert.equal(role.templateKey, key);
      assert.equal(role.needsReview, false);
      assert.deepEqual(sortGrants(role.grants), sortGrants(TEMPLATES[key].grants), `${key} grants`);
      assert.deepEqual(sortFields(role.fields), sortFields(TEMPLATES[key].fields), `${key} fields`);
    }
    const owner = roles.find((r) => r.key === 'owner');
    assert.equal(owner.name, 'Owner');
    assert.equal(owner.nameAr, 'المالك');
  }
  // Nobody is given Owner by migration.
  const db = new Database(fx.dbPath, { readonly: true });
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM user_group_assignments uga JOIN permission_groups pg ON pg.id = uga.groupId WHERE pg.key = 'owner'`).get().n, 0);
  db.close();

  const main = (userId, companyId) => store.authz.assignments(userId, companyId).filter((a) => a.isMain);
  assert.deepEqual(main(fx.admin.id, fx.acme.id).map((a) => a.roleKey), ['admin']);
  assert.deepEqual(main(fx.admin.id, fx.beta.id).map((a) => a.roleKey), ['admin']);
  assert.deepEqual(main(fx.boss.id, fx.acme.id).map((a) => a.roleKey), ['manager']);
  const clerk = store.authz.assignments(fx.clerk.id, fx.acme.id);
  assert.deepEqual(clerk.filter((a) => a.isMain).map((a) => a.roleKey), ['employee']);
  const extra = clerk.find((a) => a.roleKey === 'accountant');
  assert.equal(extra.isMain, false, 'extra system group becomes an add-on');
  assert.equal(extra.isActive, true, 'system add-ons stay active');

  // Legacy grants are untouched: legacy readers answer as before.
  assert.deepEqual(store.getEffectivePermissions(fx.clerk.id, fx.acme.id).sort(), fx.legacyBefore.clerk);
  assert.deepEqual(store.getEffectivePermissions(fx.admin.id, fx.acme.id).sort(), fx.legacyBefore.admin);

  // Audited (no actor) and the version moved.
  const audit = store.authz.audit({ companyId: fx.acme.id });
  assert.ok(audit.some((row) => row.entity === 'role' && row.actorUserId === null));
  assert.ok(audit.some((row) => row.entity === 'assignments' && row.entityId === fx.clerk.id));
  assert.ok(store.getAuthzVersion() > fx.versionBefore);
});

test('Ruling E: a custom group becomes an inactive add-on role needing review', () => {
  const fx = legacyShapedDb();
  const store = new DataStore({ dbPath: fx.dbPath, seedOnEmpty: false });
  const role = store.authz.getRole(fx.custom.id);
  assert.equal(role.isSystem, false);
  assert.equal(role.templateKey, null);
  assert.equal(role.needsReview, true);
  assert.deepEqual(sortGrants(role.grants), [
    { key: 'invoices.view' },
    // tasks:write → tasks.edit; tasks:all.read raises it to company.
    { key: 'tasks.edit', scope: 'company' },
  ]);
  // tasks:all.read does not grant tasks.view/delete; crm:all.read grants nothing.
  assert.ok(!role.grants.some((g) => g.key.startsWith('crm.')));
  assert.deepEqual(
    role.fields.filter((f) => f.view || f.edit).map((f) => f.key).sort(),
    ['bank_details', 'personal_ids', 'salary'],
  );
  const assignment = store.authz.assignments(fx.clerk.id, fx.acme.id).find((a) => a.roleId === fx.custom.id);
  assert.equal(assignment.isMain, false);
  assert.equal(assignment.isActive, false, 'kept but inactive until reviewed');
  const audit = store.authz.audit({ entity: 'role', entityId: fx.custom.id });
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].after.unmapped, ['bogus:thing']);
});

test('the data migration is idempotent: running it twice changes nothing', () => {
  const fx = legacyShapedDb();
  const store = new DataStore({ dbPath: fx.dbPath, seedOnEmpty: false });
  const before = snapshot(fx.dbPath);
  assert.equal(store.authz.migrateAll(), 0);
  assert.equal(store.authz.migrateAll(), 0);
  assert.deepEqual(snapshot(fx.dbPath), before);
});

test('OLD_RULE_SCOPES only raise keys already held; they never grant', () => {
  for (const [rule, { keys }] of Object.entries(OLD_RULE_SCOPES)) {
    const alone = convertLegacyGrants([rule]);
    assert.deepEqual(alone.grants, [], `${rule} alone grants nothing`);
    for (const key of keys) {
      const holder = Object.entries(OLD_TO_NEW).find(([, mapped]) => mapped.includes(key));
      if (!holder) continue;
      const without = convertLegacyGrants([holder[0]]).grants.find((g) => g.key === key);
      const withRule = convertLegacyGrants([holder[0], rule]).grants.find((g) => g.key === key);
      assert.equal(without.scope, 'own', `${key} without ${rule}`);
      assert.equal(withRule.scope, 'company', `${key} with ${rule}`);
      // The rule adds no keys beyond what the action permission gave.
      assert.deepEqual(
        convertLegacyGrants([holder[0], rule]).grants.map((g) => g.key).sort(),
        convertLegacyGrants([holder[0]]).grants.map((g) => g.key).sort(),
      );
    }
  }
  // Every converted grant is valid against the catalogue.
  const everything = convertLegacyGrants([...Object.keys(OLD_TO_NEW), ...Object.keys(OLD_RULE_SCOPES)]);
  for (const grant of everything.grants) {
    const found = findAction(grant.key);
    assert.ok(found, grant.key);
    assert.equal(Boolean(grant.scope), Boolean(found.action.scoped), grant.key);
  }
});

test('role writes validate, bump the version and are audited with the actor', () => {
  const store = new DataStore({ dbPath: freshPath(), seedOnEmpty: false });
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const actor = makeUser(store, [co.id], 'Admin', 'actor@acme.test');
  const v0 = store.getAuthzVersion();
  const role = store.authz.saveRole(co.id, {
    name: 'Clerk', nameAr: 'كاتب', grants: [{ key: 'invoices.view' }, { key: 'tasks.view', scope: 'team' }],
    fields: [{ key: 'salary', view: true, edit: false }],
  }, actor.id);
  assert.ok(store.getAuthzVersion() > v0);
  assert.equal(role.needsReview, false);
  assert.deepEqual(sortGrants(role.grants), [{ key: 'invoices.view' }, { key: 'tasks.view', scope: 'team' }]);
  const rows = store.authz.audit({ entity: 'role', entityId: role.id });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorUserId, actor.id);
  assert.equal(rows[0].before, null);
  assert.equal(rows[0].companyId, co.id);

  // A save that changes nothing writes nothing.
  const v1 = store.getAuthzVersion();
  store.authz.saveRole(co.id, { id: role.id, name: 'Clerk', nameAr: 'كاتب', grants: role.grants, fields: role.fields }, actor.id);
  assert.equal(store.getAuthzVersion(), v1);
  assert.equal(store.authz.audit({ entity: 'role', entityId: role.id }).length, 1);

  assert.throws(() => store.authz.saveRole(co.id, { name: 'X', grants: [{ key: 'nope.view' }], fields: [] }, actor.id), /unknown permission/i);
  assert.throws(() => store.authz.saveRole(co.id, { name: 'X', grants: [{ key: 'invoices.view', scope: 'own' }], fields: [] }, actor.id), /scope/i);
  assert.throws(() => store.authz.saveRole(co.id, { name: 'X', grants: [{ key: 'tasks.view' }], fields: [] }, actor.id), /scope/i);
  assert.throws(() => store.authz.saveRole(co.id, { name: 'X', grants: [], fields: [{ key: 'salary', view: false, edit: true }] }, actor.id), /view/i);

  // Assignments: main + add-on, audited; a role in use cannot be deleted.
  const employee = store.authz.listRoles(co.id).find((r) => r.key === 'employee');
  const user = makeUser(store, [co.id], 'Employee', 'u@acme.test');
  const v2 = store.getAuthzVersion();
  store.authz.setAssignments(user.id, co.id, { mainRoleId: employee.id, addOnRoleIds: [role.id] }, actor.id);
  assert.ok(store.getAuthzVersion() > v2);
  const got = store.authz.assignments(user.id, co.id);
  assert.deepEqual(got.map((a) => [a.roleKey, a.isMain]).sort(), [[role.key, false], ['employee', true]].sort());
  assert.ok(store.authz.audit({ entity: 'assignments', entityId: user.id }).some((r) => r.actorUserId === actor.id));
  const v3 = store.getAuthzVersion();
  store.authz.setAssignments(user.id, co.id, { mainRoleId: employee.id, addOnRoleIds: [role.id] }, actor.id);
  assert.equal(store.getAuthzVersion(), v3, 'no-op assignment write');
  assert.throws(() => store.authz.deleteRole(role.id, actor.id), /assigned/i);
  store.authz.setAssignments(user.id, co.id, { mainRoleId: employee.id, addOnRoleIds: [] }, actor.id);
  store.authz.deleteRole(role.id, actor.id);
  assert.equal(store.authz.getRole(role.id), undefined);
  assert.ok(store.authz.audit({ entity: 'role', entityId: role.id }).some((r) => r.after === null));

  // A role from another company is refused.
  const other = store.createCompany({ name: 'Other', website: '', address: '' });
  const foreign = store.authz.listRoles(other.id).find((r) => r.key === 'admin');
  assert.throws(() => store.authz.setAssignments(user.id, co.id, { mainRoleId: foreign.id, addOnRoleIds: [] }, actor.id), /company/i);
});

test('holding groups, group assignments and shares bump the version and are audited', () => {
  const store = new DataStore({ dbPath: freshPath(), seedOnEmpty: false });
  const a = store.createCompany({ name: 'A', website: '', address: '' });
  const b = store.createCompany({ name: 'B', website: '', address: '' });
  const actor = makeUser(store, [a.id], 'Admin', 'actor@a.test');
  const person = makeUser(store, [a.id], 'Employee', 'p@a.test');

  const bump = (fn) => { const v = store.getAuthzVersion(); const out = fn(); assert.ok(store.getAuthzVersion() > v); return out; };

  const group = bump(() => store.authz.createHoldingGroup({ name: 'GIG', nameAr: 'جي' }, actor.id));
  bump(() => store.authz.attachCompany(group.id, a.id, actor.id));
  bump(() => store.authz.attachCompany(group.id, b.id, actor.id));
  const other = store.authz.createHoldingGroup({ name: 'Other' }, actor.id);
  assert.throws(() => store.authz.attachCompany(other.id, a.id, actor.id), /already/i);
  bump(() => store.authz.setHoldingAdmins(group.id, [actor.id], actor.id));
  bump(() => store.authz.setHoldingAssignment(group.id, person.id, { mainRoleKey: 'accountant', addOnRoleKeys: [] }, actor.id));
  assert.throws(() => store.authz.setHoldingAssignment(group.id, person.id, { mainRoleKey: 'nope', addOnRoleKeys: [] }, actor.id), /role/i);
  let listed = store.authz.holdingGroups().find((g) => g.id === group.id);
  assert.deepEqual(listed.companyIds.sort(), [a.id, b.id].sort());
  assert.deepEqual(listed.adminUserIds, [actor.id]);
  assert.deepEqual(store.authz.holdingAssignments(group.id).map((r) => [r.userId, r.roleKey, r.isMain]), [[person.id, 'accountant', true]]);
  bump(() => store.authz.detachCompany(b.id, actor.id));
  listed = store.authz.holdingGroups().find((g) => g.id === group.id);
  assert.deepEqual(listed.companyIds, [a.id]);
  const groupAudit = store.authz.audit({ holdingGroupId: group.id });
  for (const entity of ['holding_group', 'holding_company', 'holding_admins', 'holding_assignments']) {
    assert.ok(groupAudit.some((r) => r.entity === entity && r.actorUserId === actor.id), entity);
  }

  bump(() => store.authz.share(a.id, 'tasks', 'task-1', person.id, actor.id));
  assert.deepEqual(store.authz.shares('tasks', 'task-1').map((s) => s.userId), [person.id]);
  assert.throws(() => store.authz.share(a.id, 'nope', 'r', person.id, actor.id), /area/i);
  bump(() => store.authz.unshare(a.id, 'tasks', 'task-1', person.id, actor.id));
  assert.deepEqual(store.authz.shares('tasks', 'task-1'), []);
  assert.equal(store.authz.audit({ entity: 'share' }).length, 2);
});

test('legacy role changes move the main assignment; new companies get v2 roles', () => {
  const store = new DataStore({ dbPath: freshPath(), seedOnEmpty: false });
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  assert.deepEqual(store.authz.listRoles(co.id).filter((r) => r.isSystem).map((r) => r.key).sort(), [...TEMPLATE_KEYS].sort());
  const user = makeUser(store, [co.id], 'Employee', 'e@acme.test');
  assert.deepEqual(store.authz.assignments(user.id, co.id).filter((a) => a.isMain).map((a) => a.roleKey), ['employee']);
  store.updateUser(user.id, { role: 'Manager', companyRoles: [{ companyId: co.id, role: 'Manager' }] });
  assert.deepEqual(store.authz.assignments(user.id, co.id).filter((a) => a.isMain).map((a) => a.roleKey), ['manager']);
  // The legacy "replace this user's groups" path keeps the main flag.
  const manager = store.getPermissionGroupByKey(co.id, 'manager');
  const accountant = store.getPermissionGroupByKey(co.id, 'accountant');
  store.setUserGroups(user.id, co.id, [manager.id, accountant.id]);
  const rows = store.authz.assignments(user.id, co.id);
  assert.deepEqual(rows.filter((a) => a.isMain).map((a) => a.roleKey), ['manager']);
});

test('the seeded demo database carries main assignments for every membership', () => {
  const store = new DataStore({ dbPath: freshPath(), seedOnEmpty: true });
  for (const user of store.listUsers()) {
    for (const { companyId } of user.companyRoles || []) {
      const mains = store.authz.assignments(user.id, companyId).filter((a) => a.isMain);
      assert.equal(mains.length, 1, `${user.email} in ${companyId}`);
    }
  }
});

test('a database that ran the authz migrations under their old ids (137-139) upgrades cleanly', () => {
  // Before merging master's 137/138 (password links, hashing), this branch
  // numbered its migrations 137_authz_v2, 138_team_version and
  // 139_authz_divergence_observed. A database migrated then has those ids and
  // none of master's: reopening runs master's two and re-runs ours under the
  // new ids, which must change nothing.
  const dbPath = freshPath();
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const admin = makeUser(store, [acme.id], 'Admin', 'admin@acme.test');
  const clerk = makeUser(store, [acme.id], 'Employee', 'clerk@acme.test');
  const custom = store.authz.saveRole(acme.id, { key: 'billing', name: 'Billing', grants: [{ key: 'invoices.view' }], fields: [] }, admin.id);
  store.authz.setAssignments(clerk.id, acme.id, { mainRoleId: store.authz.systemRole(acme.id, 'employee').id, addOnRoleIds: [custom.id] }, admin.id);
  const db = new Database(dbPath);
  db.exec(`
    DELETE FROM schema_migrations WHERE id IN ('137_password_links_and_session_age', '138_hash_plain_passwords', '139_authz_v2', '140_team_version', '141_authz_divergence_observed');
    INSERT INTO schema_migrations (id, appliedAt) VALUES ('137_authz_v2', '2026-10-20T00:00:00.000Z'), ('138_team_version', '2026-10-20T00:00:00.000Z'), ('139_authz_divergence_observed', '2026-10-20T00:00:00.000Z');
    DROP TABLE password_tokens;
    ALTER TABLE tokens DROP COLUMN createdAt;
    ALTER TABLE tokens DROP COLUMN lastUsedAt;
  `);
  db.close();
  const before = snapshot(dbPath);

  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  assert.deepEqual(snapshot(dbPath), before, 're-running the authz migrations changes nothing');
  const check = new Database(dbPath, { readonly: true });
  const applied = new Set(check.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  const tokenCols = new Set(check.prepare('PRAGMA table_info(tokens)').all().map((c) => c.name));
  const tables = new Set(check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  check.close();
  for (const id of ['137_password_links_and_session_age', '138_hash_plain_passwords', '139_authz_v2', '140_team_version', '141_authz_divergence_observed']) {
    assert.ok(applied.has(id), `${id} applied`);
  }
  assert.ok(tokenCols.has('createdAt') && tokenCols.has('lastUsedAt'), 'master 137 ran');
  assert.ok(tables.has('password_tokens'));
  const roles = reopened.authz.assignments(clerk.id, acme.id).map((a) => a.roleId).sort();
  assert.deepEqual(roles, [store.authz.systemRole(acme.id, 'employee').id, custom.id].sort());
});
