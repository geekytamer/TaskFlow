const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { effective, clearEffectiveCache } = require('../dist/authz/evaluate');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Final whole-branch review (Permissions 1a):
 *  1. A custom main role sticks: later writes to the legacy role list
 *     (position change, a role change in another company, authz:repair) do not
 *     put the standard role back as main.
 *  2. The old permission-group write API is gone.
 *  3. The dashboard lets a group-only person in under v2.
 */

const quiet = { info() {}, warn() {}, error() {} };
let seq = 0;

function setup(engine = 'legacy') {
  const dir = makeTmpDir(`taskflow-final-review-${engine}-`);
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const owner = store.createUser({
    name: `owner${++seq}`, email: `owner${seq}@final.test`, role: 'Admin',
    companyIds: [acme.id, beta.id],
    companyRoles: [{ companyId: acme.id, role: 'Admin' }, { companyId: beta.id, role: 'Admin' }],
    password: 'x',
  });
  const person = store.createUser({
    name: `person${++seq}`, email: `person${seq}@final.test`, role: 'Admin',
    companyIds: [acme.id, beta.id],
    companyRoles: [{ companyId: acme.id, role: 'Admin' }, { companyId: beta.id, role: 'Employee' }],
    password: 'x',
  });
  const narrow = store.authz.saveRole(acme.id, { name: 'Narrow', grants: [{ key: 'sales.view' }], fields: [] }, null);
  // People screen: main role Narrow; the legacy companyRoles stays Admin.
  store.authz.setAssignments(person.id, acme.id, { mainRoleId: narrow.id, addOnRoleIds: [] }, owner.id);
  const server = engine
    ? createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet })
    : undefined;
  const as = (id) => {
    const auth = `Bearer ${store.issueToken(id)}`;
    return {
      get: (url) => request(server).get(url).set('Authorization', auth),
      put: (url, body) => request(server).put(url).set('Authorization', auth).send(body ?? {}),
      post: (url, body) => request(server).post(url).set('Authorization', auth).send(body ?? {}),
      patch: (url, body) => request(server).patch(url).set('Authorization', auth).send(body ?? {}),
      delete: (url) => request(server).delete(url).set('Authorization', auth),
    };
  };
  return { dir, dbPath, store, server, acme, beta, owner, person, narrow, as };
}

const roles = (store, userId, companyId) =>
  store.authz.assignments(userId, companyId).map((a) => `${a.roleName}${a.isMain ? '*' : ''}`).sort();

const v2Keys = (store, userId, companyId) => {
  clearEffectiveCache();
  return [...(effective(store, userId).byCompany.get(companyId)?.grants.keys() ?? [])].sort();
};

// ── 1. Custom main roles stick ────────────────────────────────────────

test('a custom main role survives a position change (store)', () => {
  const { store, acme, person } = setup(null);
  assert.deepEqual(roles(store, person.id, acme.id), ['Narrow*']);
  const current = store.getUserById(person.id).companyRoles;
  store.updateUser(person.id, { companyRoles: current.map((r) => ({ ...r, positionId: 'pos-x' })) });
  assert.deepEqual(roles(store, person.id, acme.id), ['Narrow*'], 'no Admin re-inserted');
  assert.deepEqual(v2Keys(store, person.id, acme.id), ['sales.view']);
});

test('a custom main role survives a role change in another company (store)', () => {
  const { store, acme, beta, person } = setup(null);
  const current = store.getUserById(person.id).companyRoles;
  store.updateUser(person.id, { companyRoles: current.map((r) => (r.companyId === beta.id ? { ...r, role: 'Manager' } : r)) });
  assert.deepEqual(roles(store, person.id, acme.id), ['Narrow*']);
  assert.ok(store.authz.assignments(person.id, beta.id).some((a) => a.roleKey === 'manager' && a.isMain), 'the other company follows its new role');
});

test('a custom main role survives backfillPermissionGroups and ops authz:repair', () => {
  const { dbPath, store, acme, person } = setup(null);
  store.backfillPermissionGroups();
  assert.deepEqual(roles(store, person.id, acme.id), ['Narrow*']);
  execFileSync(process.execPath, [path.join(__dirname, '..', 'dist', 'ops.js'), 'authz:repair'], {
    env: { ...process.env, TASKFLOW_DB_PATH: dbPath, PERMISSIONS_ENGINE: 'legacy' },
    stdio: 'pipe',
  });
  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  assert.deepEqual(roles(reopened, person.id, acme.id), ['Narrow*']);
  assert.deepEqual(v2Keys(reopened, person.id, acme.id), ['sales.view']);
});

test('without a custom main role the legacy sync is unchanged (standard main follows companyRoles)', () => {
  const { store, beta, person } = setup(null);
  assert.deepEqual(roles(store, person.id, beta.id), ['Employee*']);
  const current = store.getUserById(person.id).companyRoles;
  store.updateUser(person.id, { companyRoles: current.map((r) => (r.companyId === beta.id ? { ...r, role: 'Accountant' } : r)) });
  assert.deepEqual(roles(store, person.id, beta.id), ['Accountant*']);
});

for (const engine of ['legacy', 'shadow', 'v2']) {
  test(`PUT /users with only a position change keeps the custom main role (${engine})`, async () => {
    const { store, acme, owner, person, as } = setup(engine);
    const current = store.getUserById(person.id).companyRoles;
    const res = await as(owner.id).put(`/users/${person.id}`, {
      companyRoles: current.map((r) => ({ ...r, positionId: 'pos-y' })),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(roles(store, person.id, acme.id), ['Narrow*']);
    assert.equal(store.getUserById(person.id).companyRoles.find((r) => r.companyId === acme.id).role, 'Admin', 'legacy role list untouched');
  });

  test(`PUT /users changing the role (${engine})`, async () => {
    const { store, acme, owner, person, as } = setup(engine);
    const current = store.getUserById(person.id).companyRoles;
    const res = await as(owner.id).put(`/users/${person.id}`, {
      companyRoles: current.map((r) => (r.companyId === acme.id ? { ...r, role: 'Manager' } : r)),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(store.getUserById(person.id).companyRoles.find((r) => r.companyId === acme.id).role, 'Manager');
    if (engine === 'v2') {
      // v2: the role field writes the main assignment; the custom main is replaced.
      assert.deepEqual(roles(store, person.id, acme.id), ['Manager*']);
    } else {
      // legacy/shadow: today's behaviour (the standard role becomes main, the custom one stays as an add-on).
      assert.deepEqual(roles(store, person.id, acme.id), ['Manager*', 'Narrow']);
    }
  });
}

test('PUT /users under v2 refuses giving a standard role beyond the caller (HIGHER_THAN_YOU)', async () => {
  const { store, acme, owner, as } = setup('v2');
  const admin = store.authz.listRoles(acme.id).find((r) => r.key === 'admin' && r.isSystem);
  const manageAll = admin.grants.filter((g) => g.key.startsWith('people.') || g.key.startsWith('settings.') || g.key.startsWith('users.'));
  const boss = store.authz.saveRole(acme.id, { name: 'People boss', grants: manageAll, fields: [] }, null);
  const actor = store.createUser({
    name: `actor${++seq}`, email: `actor${seq}@final.test`, role: 'Employee',
    companyIds: [acme.id], companyRoles: [{ companyId: acme.id, role: 'Employee' }], password: 'x',
  });
  store.authz.setAssignments(actor.id, acme.id, { mainRoleId: boss.id, addOnRoleIds: [] }, owner.id);
  const res = await as(actor.id).put(`/users/${actor.id}`, { companyRoles: [{ companyId: acme.id, role: 'Admin' }] });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code ?? res.body.details?.code, 'HIGHER_THAN_YOU');
  assert.equal(store.getUserById(actor.id).companyRoles[0].role, 'Employee');
  assert.deepEqual(roles(store, actor.id, acme.id), ['People boss*']);
});

// ── 2. The old permission-group write API is gone ─────────────────────

for (const engine of ['legacy', 'v2']) {
  test(`old permission-group write routes are gone (${engine})`, async () => {
    const { acme, owner, person, narrow, as } = setup(engine);
    const admin = (await as(owner.id).get(`/companies/${acme.id}/roles`)).body.find((r) => r.key === 'admin');
    const calls = [
      as(owner.id).post(`/companies/${acme.id}/permission-groups`, { name: 'X', permissions: [] }),
      as(owner.id).patch(`/permission-groups/${admin.id}`, { name: 'Renamed' }),
      as(owner.id).delete(`/permission-groups/${admin.id}`),
      as(owner.id).put(`/permission-groups/${narrow.id}/permissions`, { permissions: [] }),
      as(owner.id).put(`/permission-groups/${narrow.id}/implications`, { impliedGroupIds: [] }),
      as(owner.id).get(`/companies/${acme.id}/permission-groups`),
      as(owner.id).get(`/companies/${acme.id}/users/${person.id}/groups`),
      as(owner.id).put(`/companies/${acme.id}/users/${person.id}/groups`, { groupIds: [admin.id] }),
    ];
    for (const res of await Promise.all(calls)) assert.equal(res.status, 404, `${res.req.method} ${res.req.path} -> ${res.status}`);
  });
}

test('v2: a custom role with people.manage_roles cannot make itself Admin', async () => {
  const { store, acme, owner, as } = setup('v2');
  const manager = store.authz.saveRole(acme.id, { name: 'Role keeper', grants: [{ key: 'people.view_roles' }, { key: 'people.manage_roles' }], fields: [] }, null);
  const actor = store.createUser({
    name: `keeper${++seq}`, email: `keeper${seq}@final.test`, role: 'Employee',
    companyIds: [acme.id], companyRoles: [{ companyId: acme.id, role: 'Employee' }], password: 'x',
  });
  store.authz.setAssignments(actor.id, acme.id, { mainRoleId: manager.id, addOnRoleIds: [] }, owner.id);
  const admin = store.authz.listRoles(acme.id).find((r) => r.key === 'admin' && r.isSystem);

  const old = await as(actor.id).put(`/companies/${acme.id}/users/${actor.id}/groups`, { groupIds: [admin.id] });
  assert.equal(old.status, 404);
  const people = await as(actor.id).put(`/companies/${acme.id}/people/${actor.id}/roles`, { mainRoleId: admin.id, addOnRoleIds: [] });
  assert.equal(people.status, 403, JSON.stringify(people.body));
  assert.equal(people.body.code ?? people.body.details?.code, 'HIGHER_THAN_YOU');
  assert.deepEqual(roles(store, actor.id, acme.id), ['Role keeper*']);
});

// ── 3. Dashboard for a group-only person ─────────────────────────────

for (const engine of ['legacy', 'v2']) {
  test(`dashboard for a group-only person (${engine})`, async () => {
    const { store, acme, beta, as } = setup(engine);
    const outsider = store.createUser({
      name: `outsider${++seq}`, email: `outsider${seq}@final.test`, role: 'Employee',
      companyIds: [beta.id], companyRoles: [{ companyId: beta.id, role: 'Employee' }], password: 'x',
    });
    const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
    store.authz.attachCompany(group.id, acme.id, null);
    store.authz.attachCompany(group.id, beta.id, null);
    store.authz.setHoldingAssignment(group.id, outsider.id, { mainRoleKey: 'manager', addOnRoleKeys: [] }, null);
    const res = await as(outsider.id).get(`/companies/${acme.id}/dashboard`);
    if (engine === 'v2') assert.equal(res.status, 200, JSON.stringify(res.body));
    else assert.equal(res.status, 403, JSON.stringify(res.body));
  });
}

// ── 5. ops authz:compare summarises the shadow week ──────────────────

test('ops authz:compare summarises authz_divergence by route, key and company, newest first, since N days', () => {
  const dir = makeTmpDir('taskflow-final-review-compare-');
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const add = (route, module, action, companyId, daysAgo, legacyAllowed) => {
    store.recordAuthzDivergence({ userId: 'u1', companyId, module, action, route, legacyAllowed, newAllowed: !legacyAllowed });
    store.db.prepare('UPDATE authz_divergence SET observedAt = ? WHERE id = (SELECT MAX(id) FROM authz_divergence)')
      .run(new Date(Date.now() - daysAgo * 86400000).toISOString());
  };
  add('GET /companies/:companyId/invoices', 'finance', 'view', 'c1', 1, true);
  add('GET /companies/:companyId/invoices', 'finance', 'view', 'c1', 2, true);
  add('PUT /contacts/:id', 'contacts', 'edit', 'c2', 0.5, false);
  add('notify payroll', 'field', 'salary', 'c1', 3, true);
  add('GET /old', 'sales', 'view', 'c9', 20, true); // outside the window
  const run = (...extra) => execFileSync(process.execPath, [path.join(__dirname, '..', 'dist', 'ops.js'), 'authz:compare', ...extra], {
    env: { ...process.env, TASKFLOW_DB_PATH: dbPath }, encoding: 'utf8',
  });
  const out = run('--days', '7');
  assert.match(out, /Since: .*\(last 7 days\)/);
  assert.match(out, /Divergences: 4\b/);
  assert.match(out, /2\s+GET \/companies\/:companyId\/invoices/, out);
  assert.match(out, /2\s+finance\.view/, out);
  assert.match(out, /1\s+field:salary/, out);
  assert.match(out, /3\s+c1/, out);
  assert.doesNotMatch(out, /GET \/old|c9/);
  // Newest first: the contacts edit (12 hours ago) precedes the invoices rows.
  const newest = out.slice(out.indexOf('Newest'));
  assert.ok(newest.indexOf('PUT /contacts/:id') < newest.indexOf('GET /companies/:companyId/invoices'), out);
  assert.match(newest, /legacy deny, v2 allow/);
  assert.match(run('--days', '30'), /Divergences: 5\b/);
});
