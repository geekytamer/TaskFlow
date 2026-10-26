const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { effective, clearEffectiveCache } = require('../dist/authz/evaluate');
const { summaryLines } = require('../dist/authz/describe');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Fixes for the permissions acceptance audit (2026-10-26):
 * C-1, C-2, I-2, I-3, I-4, I-5, M-1, M-2, M-3, M-4, M-6, M-7, M-9, K-4, K-5.
 */

const quiet = { info() {}, warn() {}, error() {} };
let seq = 0;

function build(engine) {
  const dbPath = path.join(makeTmpDir(`taskflow-audit-fix-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const acme = store.createCompany({ name: 'Acme', website: '', address: '' });
  const beta = store.createCompany({ name: 'Beta', website: '', address: '' });
  const user = (role, companies = [acme.id], name = role) => store.createUser({
    name: `${name}${++seq}`, email: `${name.toLowerCase()}${seq}@fix.test`, role,
    companyIds: companies, companyRoles: companies.map((companyId) => ({ companyId, role })), password: 'x',
  });
  const root = user('Employee', [acme.id], 'Root');
  store.db.prepare('UPDATE users SET isSuperAdmin = 1 WHERE id = ?').run(root.id);
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet }).listen(0);
  server.unref();
  const as = (u) => {
    const auth = `Bearer ${store.issueToken(u.id)}`;
    return {
      get: (url) => request(server).get(url).set('Authorization', auth),
      post: (url, body) => request(server).post(url).set('Authorization', auth).send(body ?? {}),
      put: (url, body) => request(server).put(url).set('Authorization', auth).send(body ?? {}),
      del: (url) => request(server).delete(url).set('Authorization', auth),
    };
  };
  return { store, acme, beta, user, root: store.getUserById(root.id), as };
}

const ENGINES = ['legacy', 'shadow', 'v2'];

// ── C-1: PUT / DELETE /users ─────────────────────────────────────────

for (const engine of ENGINES) {
  test(`C-1: the only Admin cannot be demoted or deleted through /users (${engine})`, async () => {
    const { store, acme, user, root, as } = build(engine);
    const admin = user('Admin');
    const manager = user('Manager');
    const demote = await as(manager).put(`/users/${admin.id}`, { companyRoles: [{ companyId: acme.id, role: 'Employee' }] });
    // v2: the Manager is below the Admin (403 HIGHER_THAN_YOU). Legacy lets a
    // Manager set an Employee role, but not on the last Admin (409 LOCKOUT).
    assert.equal(demote.status, engine === 'v2' ? 403 : 409, JSON.stringify(demote.body));
    assert.equal(store.getUserById(admin.id).companyRoles[0].role, 'Admin');
    const remove = await as(manager).del(`/users/${admin.id}`);
    assert.ok([403, 409].includes(remove.status), JSON.stringify(remove.body));
    assert.ok(store.getUserById(admin.id), 'still there');

    // The Admin demoting themselves, or the super admin deleting the last one: lock-out guard.
    const self = await as(admin).put(`/users/${admin.id}`, { companyRoles: [{ companyId: acme.id, role: 'Employee' }] });
    assert.equal(self.status, 409, JSON.stringify(self.body));
    assert.equal(self.body.code, 'LOCKOUT');
    assert.equal(store.getUserById(admin.id).companyRoles[0].role, 'Admin', 'rolled back');
    const byRoot = await as(root).del(`/users/${admin.id}`);
    assert.equal(byRoot.status, 409, JSON.stringify(byRoot.body));
    assert.ok(store.getUserById(admin.id));

    // With a second Admin, both work.
    const second = user('Admin');
    assert.equal((await as(admin).put(`/users/${admin.id}`, { companyRoles: [{ companyId: acme.id, role: 'Employee' }] })).status, 200);
    assert.equal((await as(second).del(`/users/${admin.id}`)).status, 200);
    // M-9: the deletion is in the audit, with its actor.
    const rows = store.authz.audit({ entityId: admin.id });
    assert.ok(rows.some((r) => r.entity === 'user' && r.after === null && r.actorUserId === second.id), JSON.stringify(rows));
    assert.ok(rows.filter((r) => r.entity === 'assignments' && r.after === null).every((r) => r.actorUserId === second.id), 'the removal rows name the actor');
  });
}

test('C-1 (v2): a Manager with manage_roles cannot change someone holding more than them', async () => {
  const { store, acme, user, as } = build('v2');
  const admin = user('Admin');
  const owner = user('Admin');
  const ownerRole = store.authz.listRoles(acme.id).find((r) => r.key === 'owner');
  store.authz.setAssignments(owner.id, acme.id, { mainRoleId: ownerRole.id, addOnRoleIds: [] }, null);
  const res = await as(admin).put(`/users/${owner.id}`, { companyRoles: [{ companyId: acme.id, role: 'Employee' }] });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, 'HIGHER_THAN_YOU');
  assert.equal((await as(admin).del(`/users/${owner.id}`)).status, 403);
});

test('M-9: POST /users and group copies record their actor', async () => {
  const { store, acme, root, as } = build('v2');
  const created = await as(root).post('/users', { name: 'New Person', email: 'new.person@fix.test', companyIds: [acme.id], companyRoles: [{ companyId: acme.id, role: 'Employee' }], password: 'secret123' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const rows = store.authz.audit({ entityId: created.body.user.id });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.actorUserId === root.id), JSON.stringify(rows));
  const group = (await as(root).post('/holding-groups', { name: 'Actor Group' })).body;
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: acme.id });
  await as(root).put(`/holding-groups/${group.id}/assignments/${created.body.user.id}`, { roleKey: 'accountant' });
  const copy = store.authz.listRoles(acme.id).find((r) => r.key === 'group:accountant');
  assert.ok(store.authz.audit({ entity: 'role', entityId: copy.id }).every((r) => r.actorUserId === root.id));
});

// ── C-2: bounded group admins ────────────────────────────────────────

for (const engine of ['legacy', 'v2']) {
  test(`C-2: group admins cannot appoint admins, self-assign or give more than they hold everywhere (${engine})`, async () => {
    const { store, acme, beta, user, root, as } = build(engine);
    const aisha = user('Admin', [acme.id], 'Aisha'); // Admin of Acme only
    const emp = user('Employee', [beta.id], 'Emp');
    const group = (await as(root).post('/holding-groups', { name: 'Bounded' })).body;
    await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: acme.id });
    await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: beta.id });
    assert.equal((await as(root).put(`/holding-groups/${group.id}/admins`, { userIds: [aisha.id] })).status, 200);

    // Only the super admin appoints or removes group admins.
    const appoint = await as(aisha).put(`/holding-groups/${group.id}/admins`, { userIds: [aisha.id, emp.id] });
    assert.equal(appoint.status, 403);
    assert.deepEqual(store.authz.holdingGroup(group.id).adminUserIds, [aisha.id]);

    // Aisha holds nothing in Beta: no group role is within her access there.
    const give = await as(aisha).put(`/holding-groups/${group.id}/assignments/${emp.id}`, { roleKey: 'owner' });
    assert.equal(give.status, 403, JSON.stringify(give.body));
    assert.equal(give.body.code, 'HIGHER_THAN_YOU');
    assert.match(give.body.message, /in (Acme|Beta)/);
    // Her own group-wide roles: never.
    const self = await as(aisha).put(`/holding-groups/${group.id}/assignments/${aisha.id}`, { roleKey: 'employee' });
    assert.equal(self.status, 403);
    assert.equal(self.body.code, 'SELF_ASSIGN');
    // Templates beyond her: refused too.
    const tpl = await as(aisha).put(`/holding-groups/${group.id}/templates/owner`, { name: 'Owner', grants: [{ key: 'finance.view' }], fields: [] });
    assert.equal(tpl.status, 403);
    assert.equal((await as(aisha).post(`/holding-groups/${group.id}/templates/owner/push`)).status, 403);

    // Given group-wide Admin by the super admin, she may give Employee (within her everywhere), not Owner.
    assert.equal((await as(root).put(`/holding-groups/${group.id}/assignments/${aisha.id}`, { roleKey: 'admin' })).status, 200);
    clearEffectiveCache();
    if (engine === 'v2') {
      assert.equal((await as(aisha).put(`/holding-groups/${group.id}/assignments/${emp.id}`, { roleKey: 'employee' })).status, 200);
      const owner = await as(aisha).put(`/holding-groups/${group.id}/assignments/${emp.id}`, { roleKey: 'owner' });
      assert.equal(owner.status, 403, JSON.stringify(owner.body));
      // The detail tells the screen her floor across the group.
      const detail = (await as(aisha).get(`/holding-groups/${group.id}`)).body;
      assert.equal(detail.me.canManageAdmins, false);
      assert.ok(detail.me.access.grants.some((g) => g.key === 'people.manage_roles'));
      assert.equal((await as(root).get(`/holding-groups/${group.id}`)).body.me.access, null);
    }
    assert.ok(effective(store, emp.id).byCompany.get(acme.id)?.grants.has('people.manage_roles') !== true);
  });
}

// ── I-3: the group's people for its admins ───────────────────────────

test('I-3: GET /holding-groups/:id/people lists every company of the group, for group admins only', async () => {
  const { acme, beta, user, root, as } = build('v2');
  const aisha = user('Admin', [acme.id], 'Aisha');
  const bob = user('Employee', [beta.id], 'Bob');
  const outsider = user('Employee', [acme.id], 'Out');
  const group = (await as(root).post('/holding-groups', { name: 'People' })).body;
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: acme.id });
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: beta.id });
  await as(root).put(`/holding-groups/${group.id}/admins`, { userIds: [aisha.id] });
  const res = await as(aisha).get(`/holding-groups/${group.id}/people`);
  assert.equal(res.status, 200);
  const ids = res.body.map((p) => p.id);
  assert.ok(ids.includes(bob.id) && ids.includes(aisha.id), JSON.stringify(res.body));
  assert.deepEqual(res.body.find((p) => p.id === bob.id).companies.map((c) => c.name), ['Beta']);
  assert.equal((await as(outsider).get(`/holding-groups/${group.id}/people`)).status, 403);
});

// ── M-1 / M-2 / M-3: dates and names ─────────────────────────────────

test('M-1: an end date runs through the end of that day in the company time zone (Asia/Muscat default)', () => {
  const { store, acme, user } = build('v2');
  const person = user('Employee', [user('Admin').companyIds[0]]);
  const group = store.authz.createHoldingGroup({ name: 'Dates' }, null);
  store.authz.attachCompany(group.id, acme.id, null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
  store.authz.setHoldingAssignment(group.id, person.id, { mainRoleKey: 'accountant', addOnRoleKeys: [], endsAt: today }, null);
  clearEffectiveCache();
  assert.ok(effective(store, person.id).byCompany.get(acme.id)?.grants.has('finance.view'), 'still on, all of today');
  assert.ok(store.authz.holdingCompanyIds(person.id).includes(acme.id));
  // 23:59 Muscat on that day is inside; midnight after is outside.
  const [y, m, d] = today.split('-').map(Number);
  const lastMinute = Date.UTC(y, m - 1, d, 23, 59) - 4 * 3600_000;
  assert.ok(store.authz.holdingCompanyIds(person.id, lastMinute).includes(acme.id));
  assert.ok(!store.authz.holdingCompanyIds(person.id, lastMinute + 60_000).includes(acme.id));
  assert.ok(!effective(store, person.id, { now: new Date(lastMinute + 60_000) }).byCompany.get(acme.id)?.grants.has('finance.view'));
});

test('M-2 and M-3: past end dates and duplicate group names are refused', async () => {
  const { root, acme, user, as } = build('v2');
  const person = user('Employee');
  const group = (await as(root).post('/holding-groups', { name: 'Second Holding' })).body;
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: acme.id });
  const past = await as(root).put(`/holding-groups/${group.id}/assignments/${person.id}`, { roleKey: 'employee', endsAt: '2020-01-01' });
  assert.equal(past.status, 400);
  assert.match(past.body.message, /past/);
  const dup = await as(root).post('/holding-groups', { name: '  second holding ' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.message, /already exists/);
  const other = (await as(root).post('/holding-groups', { name: 'Third' })).body;
  assert.equal((await as(root).put(`/holding-groups/${other.id}`, { name: 'SECOND HOLDING' })).status, 409);
});

// ── I-2: approval limits ─────────────────────────────────────────────

for (const engine of ENGINES) {
  test(`I-2: a PO approval limit of 1,000 approves 800 and refuses 5,000 under v2 (${engine})`, async () => {
    const { store, acme, user, as } = build(engine);
    store.updateCompanyFinanceSettings(acme.id, { poApprovalThreshold: 100 });
    const manager = user('Manager');
    const role = store.authz.saveRole(acme.id, { name: 'PO approver ≤1000', grants: [{ key: 'purchasing.approve', limit: 1000 }], fields: [] }, null);
    // The Manager's main role is replaced by a narrow role + the limited add-on (v2 decides by them).
    const narrow = store.authz.saveRole(acme.id, { name: 'Buyer', grants: [{ key: 'purchasing.view' }], fields: [] }, null);
    store.authz.setAssignments(manager.id, acme.id, { mainRoleId: narrow.id, addOnRoleIds: [role.id] }, null);
    const po = (amount) => store.createPurchaseOrder({ companyId: acme.id, supplierName: 'Dates Co', status: 'Draft', orderDate: new Date(), items: [{ description: 'Dates', quantity: 1, unitCost: amount }] });
    const small = po(800);
    const big = po(5000);
    assert.equal(small.approvalStatus, 'pending');
    const a = await as(manager).post(`/purchase-orders/${small.id}/approve`);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await as(manager).post(`/purchase-orders/${big.id}/approve`);
    if (engine === 'v2') {
      assert.equal(b.status, 403, JSON.stringify(b.body));
      assert.equal(b.body.code, 'OVER_LIMIT');
      assert.match(b.body.message, /up to 1,000 USD; this one is 5,000 USD/);
    } else {
      assert.equal(b.status, 200, 'legacy unchanged');
    }
    if (engine === 'shadow') {
      assert.ok(store.listAuthzDivergences().some((r) => r.route.startsWith('limit @') && r.legacyAllowed === 1 && r.openfgaAllowed === 0));
    }
  });
}

// ── I-4: campaigns keep the contact private ──────────────────────────

for (const engine of ['legacy', 'v2']) {
  test(`I-4: linking a private contact to a campaign keeps it private (${engine})`, async () => {
    const { store, acme, user, as } = build(engine);
    const employee = user('Employee');
    const contact = store.createContact({ companyId: acme.id, name: 'PROBE-PRIV-1', ownerUserId: employee.id, ownerName: employee.name, visibility: 'Private' });
    const res = await as(employee).post(`/companies/${acme.id}/campaigns`, { name: 'Probe campaign', contactId: contact.id });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(store.getContactById(contact.id).visibility, 'Private');
    assert.ok(store.getContactById(contact.id).roles.includes('Client'), 'the role is still added');
  });
}

// ── I-5: shadow logs read-scope differences ──────────────────────────

test('I-5: under shadow a list whose v2 scope differs is logged once as kind scope', async () => {
  const { store, acme, user, as } = build('shadow');
  const manager = user('Manager');
  const teamManager = store.authz.saveRole(acme.id, {
    name: 'Team manager',
    grants: store.authz.listRoles(acme.id).find((r) => r.key === 'manager').grants.map((g) => (g.key === 'contacts.view' ? { ...g, scope: 'team' } : g)),
    fields: store.authz.listRoles(acme.id).find((r) => r.key === 'manager').fields,
  }, null);
  store.authz.setAssignments(manager.id, acme.id, { mainRoleId: teamManager.id, addOnRoleIds: [] }, null);
  for (let i = 0; i < 3; i += 1) assert.equal((await as(manager).get(`/companies/${acme.id}/contacts`)).status, 200);
  const rows = store.listAuthzDivergences().filter((r) => r.kind === 'scope');
  assert.equal(rows.filter((r) => r.module === 'contacts' && r.action === 'view').length, 1, JSON.stringify(rows));
  const row = rows.find((r) => r.module === 'contacts');
  assert.equal(row.legacyScope, 'company');
  assert.equal(row.newScope, 'team');
  assert.match(row.route, /^scope GET /);
});

// ── M-6 / M-7: refusal sentences ─────────────────────────────────────

test('M-6: who to ask lists held roles once, at most three then an Admin', async () => {
  const { store, acme, user, as } = build('v2');
  user('Admin');
  user('Manager');
  user('Accountant');
  const employee = user('Employee');
  // Two custom roles granting sales.view, one held, one not; a duplicate name.
  const held = store.authz.saveRole(acme.id, { name: 'Sales desk', grants: [{ key: 'sales.view' }], fields: [] }, null);
  store.authz.saveRole(acme.id, { name: 'Nobody holds me', grants: [{ key: 'sales.view' }], fields: [] }, null);
  const holder = user('Employee');
  const main = store.authz.assignments(holder.id, acme.id).find((a) => a.isMain).roleId;
  store.authz.setAssignments(holder.id, acme.id, { mainRoleId: main, addOnRoleIds: [held.id] }, null);
  const res = await as(employee).get(`/companies/${acme.id}/sales-orders`);
  assert.equal(res.status, 403);
  assert.ok(!res.body.roles.includes('Nobody holds me'), JSON.stringify(res.body));
  assert.equal(new Set(res.body.roles).size, res.body.roles.length);
  assert.ok(res.body.roles.length <= 4);
  assert.equal(res.body.message, 'Ask a Manager, Accountant, Sales desk or an Admin.');
});

test('M-7: HIGHER_THAN_YOU names only what exceeds, with its scope, at most three', async () => {
  const { store, acme, user, as } = build('v2');
  user('Admin');
  const manager = user('Manager');
  const manage = store.authz.saveRole(acme.id, { name: 'People admin', grants: [{ key: 'people.view_roles' }, { key: 'people.manage_roles' }], fields: [] }, null);
  const main = store.authz.assignments(manager.id, acme.id).find((a) => a.isMain).roleId;
  store.authz.setAssignments(manager.id, acme.id, { mainRoleId: main, addOnRoleIds: [manage.id] }, null);
  const res = await as(manager).post(`/companies/${acme.id}/roles`, { name: 'Wide', grants: [{ key: 'crm.view', scope: 'group' }], fields: [] });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.match(res.body.message, /See opportunities.*\(every company of the group\)/);
  const many = await as(manager).post(`/companies/${acme.id}/roles`, {
    name: 'Many', grants: [{ key: 'crm.view', scope: 'group' }, { key: 'games.view' }, { key: 'games.manage' }, { key: 'whatsapp.view', scope: 'group' }, { key: 'payroll.delete' }], fields: [],
  });
  assert.equal(many.status, 403, JSON.stringify(many.body));
  assert.match(many.body.message, /and \d+ more\.$/);
});

// ── M-4 / K-4 / K-5: summaries ───────────────────────────────────────

test('M-4, K-4, K-5: mixed scopes are said, WhatsApp keeps its capital, limits carry the currency', () => {
  const company = {
    grants: new Map([
      ['contacts.view', { scope: 'own', sources: [] }],
      ['contacts.edit', { scope: 'company', sources: [] }],
      ['whatsapp.view', { scope: 'company', sources: [] }],
      ['purchasing.approve', { limit: 1000, sources: [] }],
    ]),
    fields: new Map(),
  };
  const lines = summaryLines(company, { currency: 'OMR' }).map((l) => l.en);
  assert.ok(lines.some((l) => /^Sees own contacts; edits company contacts$/.test(l)), lines.join(' | '));
  assert.ok(lines.some((l) => /WhatsApp/.test(l)), lines.join(' | '));
  assert.ok(lines.some((l) => /up to 1,000 OMR$/.test(l)), lines.join(' | '));
});

test('M-10: /me/permissions/ask names who grants a permission, for members only', async () => {
  for (const engine of ['legacy', 'v2']) {
    const { acme, beta, user, as } = build(engine);
    user('Admin');
    user('Accountant');
    const employee = user('Employee');
    const res = await as(employee).get(`/me/permissions/ask?companyId=${acme.id}&key=finance.view`);
    assert.equal(res.status, 200);
    // v2: the roles people hold; legacy: the standard roles that hold the key (N-6).
    assert.deepEqual(res.body.roles, engine === 'v2' ? ['Admin', 'Accountant'] : ['Admin', 'Manager', 'Accountant']);
    assert.equal((await as(employee).get(`/me/permissions/ask?companyId=${beta.id}&key=finance.view`)).status, 403);
  }
});

// ── Review round (N-1 … N-7, M-6 leftovers) ──────────────────────────

/** Acme + Beta in one group; Aisha a Manager in both and its group admin; Holder a group-wide Owner (by the super admin). */
async function groupSetup(engine = 'v2') {
  const ctx = build(engine);
  const { acme, beta, user, root, as } = ctx;
  const aisha = user('Manager', [acme.id, beta.id], 'Aisha');
  const holder = user('Employee', [acme.id], 'Holder');
  const emp = user('Employee', [beta.id], 'Emp');
  const group = (await as(root).post('/holding-groups', { name: `G${seq}` })).body;
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: acme.id });
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: beta.id });
  await as(root).put(`/holding-groups/${group.id}/admins`, { userIds: [aisha.id] });
  assert.equal((await as(root).put(`/holding-groups/${group.id}/assignments/${holder.id}`, { roleKey: 'owner' })).status, 200);
  return { ...ctx, aisha, holder, emp, group };
}

test('N-1: a group role is checked against the copy each company really holds, not the saved template', async () => {
  const { store, acme, aisha, emp, group, as } = await groupSetup();
  // Aisha saves the Owner template down to something within her, and does not push.
  const saved = await as(aisha).put(`/holding-groups/${group.id}/templates/owner`, { name: 'Owner', grants: [{ key: 'tasks.view', scope: 'own' }], fields: [] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  // The companies still hold the full Owner copy: giving it would give all of that.
  const give = await as(aisha).put(`/holding-groups/${group.id}/assignments/${emp.id}`, { roleKey: 'owner' });
  assert.equal(give.status, 403, JSON.stringify(give.body));
  assert.equal(give.body.code, 'HIGHER_THAN_YOU');
  clearEffectiveCache();
  assert.ok(!effective(store, emp.id).byCompany.get(acme.id)?.grants.has('people.manage_roles'));
});

test('N-2: a group admin cannot remove or demote someone above them, nor push a template down onto them', async () => {
  const { aisha, holder, group, as } = await groupSetup();
  assert.equal((await as(aisha).put(`/holding-groups/${group.id}/assignments/${holder.id}`, { roleKey: null, addOnKeys: [] })).status, 403, 'remove');
  assert.equal((await as(aisha).put(`/holding-groups/${group.id}/assignments/${holder.id}`, { roleKey: 'employee' })).status, 403, 'demote');
  assert.equal((await as(aisha).put(`/holding-groups/${group.id}/templates/owner`, { name: 'Owner', grants: [{ key: 'tasks.view', scope: 'own' }], fields: [] })).status, 200);
  const push = await as(aisha).post(`/holding-groups/${group.id}/templates/owner/push`);
  assert.equal(push.status, 403, JSON.stringify(push.body));
  assert.match(push.body.message, /hold more than you/);
});

test('N-2: group writes are lock-out guarded (the last manage_roles holder via the group)', async () => {
  const { store, acme, holder, group, root, as } = await groupSetup();
  // Holder is the only member of Acme who manages roles (through the group Owner).
  const manages = store.listUsersByCompany(acme.id).filter((u) => !u.isSuperAdmin && effective(store, u.id).byCompany.get(acme.id)?.grants.has('people.manage_roles'));
  assert.deepEqual(manages.map((u) => u.id), [holder.id]);
  const res = await as(root).put(`/holding-groups/${group.id}/assignments/${holder.id}`, { roleKey: null, addOnKeys: [] });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, 'LOCKOUT');
});

for (const engine of ENGINES) {
  test(`N-3: the super admin transfers Admin then demotes the old one; deleting a company is unaffected (${engine})`, async () => {
    const { store, acme, beta, user, root, as } = build(engine);
    const oldAdmin = user('Admin');
    const next = user('Employee');
    assert.equal((await as(root).put(`/users/${next.id}`, { companyRoles: [{ companyId: acme.id, role: 'Admin' }] })).status, 200);
    assert.equal((await as(root).put(`/users/${oldAdmin.id}`, { companyRoles: [{ companyId: acme.id, role: 'Employee' }] })).status, 200);
    const betaAdmin = user('Admin', [beta.id]);
    assert.equal((await as(root).del(`/companies/${beta.id}`)).status, 200);
    assert.ok(!store.getCompanyById(beta.id));
    assert.ok(betaAdmin);
  });
}

test('N-4: DELETE /users leaves errors to the global handler (a fault stays 500, a rule stays 400)', async () => {
  const { store, user, root, as } = build('v2');
  user('Admin');
  const person = user('Employee');
  const original = store.deleteUser.bind(store);
  store.deleteUser = () => { throw new TypeError('boom'); };
  const fault = await as(root).del(`/users/${person.id}`);
  assert.equal(fault.status, 500, JSON.stringify(fault.body));
  store.deleteUser = original;
  assert.equal((await as(root).del(`/users/${person.id}`)).status, 200);
});

test('N-5: an approval-chain decision respects the purchasing.approve limit under v2', async () => {
  const { store, acme, user, as } = build('v2');
  user('Admin');
  const manager = user('Manager');
  store.approvals.setRules(acme.id, 'purchase_order', [{ minAmount: 1000, approverRole: 'Manager' }]);
  const role = store.authz.saveRole(acme.id, { name: 'Step ≤1000', grants: [{ key: 'purchasing.view' }, { key: 'purchasing.approve_step' }, { key: 'purchasing.approve', limit: 1000 }], fields: [] }, null);
  store.authz.setAssignments(manager.id, acme.id, { mainRoleId: role.id, addOnRoleIds: [] }, null);
  const big = store.createPurchaseOrder({ companyId: acme.id, supplierName: 'Dates Co', status: 'Draft', orderDate: new Date(), items: [{ description: 'Dates', quantity: 1, unitCost: 15000 }] });
  assert.equal(big.approvalStatus, 'pending');
  const res = await as(manager).post(`/approvals/purchase_order/${big.id}/decision`, { decision: 'approve' });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, 'OVER_LIMIT');
});

test('N-6: under legacy, who to ask names the legacy roles', async () => {
  for (const engine of ['legacy', 'shadow']) {
    const { store, acme, user, as } = build(engine);
    user('Admin');
    user('Accountant');
    const employee = user('Employee');
    const odd = store.authz.saveRole(acme.id, { name: 'Ledger reader', grants: [{ key: 'finance.view' }], fields: [] }, null);
    const holder = user('Employee');
    const main = store.authz.assignments(holder.id, acme.id).find((a) => a.isMain).roleId;
    store.authz.setAssignments(holder.id, acme.id, { mainRoleId: main, addOnRoleIds: [odd.id] }, null);
    const res = await as(employee).get(`/me/permissions/ask?companyId=${acme.id}&key=finance.view`);
    // The legacy gate's roles, not the custom role someone holds (v2 would name it).
    assert.deepEqual(res.body.roles, ['Admin', 'Manager', 'Accountant'], engine);
  }
});

test('N-7: dropping a membership through companyIds alone is lock-out guarded', async () => {
  const { store, acme, beta, user, root, as } = build('legacy');
  const admin = user('Admin', [acme.id, beta.id]);
  const res = await as(root).put(`/users/${admin.id}`, { companyIds: [beta.id] });
  // Either refused by the guard, or the membership (kept by companyRoles) stays: Acme keeps its Admin.
  assert.ok([200, 409].includes(res.status), JSON.stringify(res.body));
  const after = store.getUserById(admin.id);
  assert.ok(after.companyIds.includes(acme.id));
  assert.equal(after.companyRoles.find((r) => r.companyId === acme.id)?.role, 'Admin');
});

test('M-6: only active holders count, and "an Admin" only when someone is one', async () => {
  const { store, acme, user, as } = build('v2');
  const employee = user('Employee');
  user('Manager');
  const names = ['Alpha desk', 'Beta desk', 'Gamma desk', 'Delta desk'];
  for (const name of names) {
    const role = store.authz.saveRole(acme.id, { name, grants: [{ key: 'sales.view' }], fields: [] }, null);
    const holder = user('Employee');
    const main = store.authz.assignments(holder.id, acme.id).find((a) => a.isMain).roleId;
    store.authz.setAssignments(holder.id, acme.id, { mainRoleId: main, addOnRoleIds: [role.id] }, null);
  }
  // An expired temporary holder does not count.
  const ghost = store.authz.saveRole(acme.id, { name: 'Expired desk', grants: [{ key: 'sales.view' }], fields: [] }, null);
  store.db.prepare('INSERT INTO user_group_assignments (userId, companyId, groupId, isMain, isActive, startsAt, endsAt) VALUES (?, ?, ?, 0, 1, NULL, ?)').run(employee.id, acme.id, ghost.id, '2020-01-01T00:00:00Z');
  const res = await as(employee).get(`/companies/${acme.id}/sales-orders`);
  assert.equal(res.status, 403);
  assert.ok(!res.body.roles.includes('Expired desk'), JSON.stringify(res.body.roles));
  assert.ok(!res.body.roles.includes('Admin'), 'nobody is an Admin here');
  assert.ok(res.body.roles.length <= 3, JSON.stringify(res.body.roles));
});

// ── Re-review follow-ups ─────────────────────────────────────────────

test('follow-up 1: a lower group admin cannot remove a scheduled (not yet started) group role', async () => {
  const { aisha, emp, group, root, as } = await groupSetup();
  const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  assert.equal((await as(root).put(`/holding-groups/${group.id}/assignments/${emp.id}`, { roleKey: 'owner', startsAt: inThreeDays })).status, 200);
  const res = await as(aisha).put(`/holding-groups/${group.id}/assignments/${emp.id}`, { roleKey: null, addOnKeys: [] });
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test('follow-up 2: the lock-out guard counts people who reach the company through the group (v2)', async () => {
  const { store, acme, beta, user, root, as } = build('v2');
  user('Admin', [acme.id]); // Acme keeps a member Admin
  user('Employee', [beta.id]); // Beta's members manage nothing
  const remote = user('Employee', [acme.id], 'Remote');
  const group = (await as(root).post('/holding-groups', { name: 'Reach' })).body;
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: acme.id });
  await as(root).post(`/holding-groups/${group.id}/companies`, { companyId: beta.id });
  assert.equal((await as(root).put(`/holding-groups/${group.id}/assignments/${remote.id}`, { roleKey: 'owner' })).status, 200);
  clearEffectiveCache();
  assert.ok(effective(store, remote.id).byCompany.get(beta.id)?.grants.has('people.manage_roles'), 'Remote manages Beta through the group');
  const res = await as(root).put(`/holding-groups/${group.id}/assignments/${remote.id}`, { roleKey: null, addOnKeys: [] });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, 'LOCKOUT');
});
