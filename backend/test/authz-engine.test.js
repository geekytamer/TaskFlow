const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { ROUTES, routeDecl } = require('../dist/authz/route-registry');
const { isPermissionKey, areaOf } = require('../dist/authz/catalogue');
const { effectiveLegacy } = require('../dist/authz/evaluate');
const { parseEngine, ruleAllowsV2, askSentence, NOTIFY_KEYS } = require('../dist/authz/engine');
const { RECORD_RULES } = require('../dist/permissions/record-rules');
const { makeTmpDir } = require('./helpers/tmp');

const ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'];
const quiet = { info() {}, warn() {}, error() {} };

const build = (engine, { routeLookup, logger = quiet } = {}) => {
  const dbPath = path.join(makeTmpDir(`taskflow-engine-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Acme', website: '', address: '' });
  const users = {};
  for (const role of ROLES) {
    users[role] = store.createUser({
      name: role, email: `${role.toLowerCase()}@engine.test`, role,
      companyIds: [company.id], companyRoles: [{ companyId: company.id, role }], password: 'x',
    });
  }
  // The portal company, so the games, Discover and portal staff routers are mounted.
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger,
    portalCompanyId: company.id,
    permissionsEngine: engine,
    ...(routeLookup ? { routeLookup } : {}),
  });
  const server = app.listen(0);
  server.unref();
  const token = (user) => store.issueToken(user.id);
  return { store, company, users, token, agent: request.agent(server) };
};

const addOn = (store, companyId, userId, name, grants, fields = []) => {
  const role = store.authz.saveRole(companyId, { name, grants, fields }, null);
  const main = store.authz.assignments(userId, companyId).find((a) => a.isMain).roleId;
  store.authz.setAssignments(userId, companyId, { mainRoleId: main, addOnRoleIds: [role.id] }, null);
  return role;
};

// 40 company-level GET routes across as many areas as possible: one per area
// first, then the rest in registry order.
const SAMPLE = (() => {
  const candidates = ROUTES.filter((r) => r.method === 'GET'
    && /^\/companies\/:companyId\/[a-z-]+$/.test(r.path)
    && isPermissionKey(r.permission) && r.legacyRoles);
  const picked = [];
  const areas = new Set();
  for (const r of candidates) if (!areas.has(areaOf(r.permission))) { areas.add(areaOf(r.permission)); picked.push(r); }
  for (const r of candidates) if (picked.length < 40 && !picked.includes(r)) picked.push(r);
  return picked.slice(0, 40);
})();

test('PERMISSIONS_ENGINE parses legacy, shadow and v2, defaults to legacy and rejects anything else', () => {
  assert.equal(parseEngine(undefined), 'legacy');
  assert.equal(parseEngine(''), 'legacy');
  assert.equal(parseEngine('shadow'), 'shadow');
  assert.equal(parseEngine('v2'), 'v2');
  assert.throws(() => parseEngine('openfga'), /PERMISSIONS_ENGINE/);
  assert.throws(() => parseEngine('wide-open'), /PERMISSIONS_ENGINE/);
});

test('the three engines answer 40 routes identically for the four roles', async () => {
  assert.equal(SAMPLE.length, 40);
  assert.ok(new Set(SAMPLE.map((r) => areaOf(r.permission))).size >= 15, 'sample spans the areas');
  const outcomes = {};
  for (const engine of ['legacy', 'shadow', 'v2']) {
    const world = build(engine);
    for (const route of SAMPLE) {
      for (const role of ROLES) {
        const url = route.path.replace(':companyId', world.company.id);
        const res = await world.agent.get(url).set('Authorization', `Bearer ${world.token(world.users[role])}`);
        (outcomes[engine] ??= {})[`${route.path} | ${role}`] = res.status === 403 ? 'denied' : 'allowed';
      }
    }
    if (engine === 'shadow') assert.deepEqual(world.store.listAuthzDivergences(), [], 'system roles never diverge');
  }
  const expected = {};
  for (const route of SAMPLE) for (const role of ROLES) {
    expected[`${route.path} | ${role}`] = route.legacyRoles.includes(role) ? 'allowed' : 'denied';
  }
  assert.deepEqual(outcomes.legacy, expected);
  assert.deepEqual(outcomes.shadow, expected);
  assert.deepEqual(outcomes.v2, expected);
});

test('shadow: legacy decides and an add-on the roles do not give is written to authz_divergence', async () => {
  const { store, company, users, token, agent } = build('shadow');
  addOn(store, company.id, users.Employee.id, 'Sales viewer', [{ key: 'sales.view' }]);
  const res = await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Employee)}`);
  assert.equal(res.status, 403);
  const rows = store.listAuthzDivergences();
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { userId: rows[0].userId, companyId: rows[0].companyId, route: rows[0].route, module: rows[0].module, action: rows[0].action, legacy: rows[0].legacyAllowed, v2: rows[0].openfgaAllowed },
    { userId: users.Employee.id, companyId: company.id, route: 'GET /companies/:companyId/sales-orders', module: 'sales', action: 'view', legacy: 0, v2: 1 },
  );
  // The same disagreement again within the hour is not written twice.
  await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Employee)}`);
  assert.equal(store.listAuthzDivergences().length, 1);
});

test('v2 honours an add-on, and an inactive (unreviewed) one grants nothing', async () => {
  const { store, company, users, token, agent } = build('v2');
  const url = `/companies/${company.id}/sales-orders`;
  const auth = () => ['Authorization', `Bearer ${token(users.Employee)}`];
  assert.equal((await agent.get(url).set(...auth())).status, 403);
  const role = addOn(store, company.id, users.Employee.id, 'Sales viewer', [{ key: 'sales.view' }]);
  assert.equal((await agent.get(url).set(...auth())).status, 200);
  store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(role.id);
  store.bumpAuthzVersion();
  assert.equal((await agent.get(url).set(...auth())).status, 403);
});

test('v2 record rules: an add-on with company scope widens what the rule allows', async () => {
  const { store, company, users } = build('v2');
  const { effective } = require('../dist/authz/evaluate');
  assert.equal(ruleAllowsV2(effective(store, users.Employee.id), 'CRM_ALL_READ', company.id).allowed, false);
  addOn(store, company.id, users.Employee.id, 'All CRM', [{ key: 'crm.view', scope: 'company' }]);
  assert.equal(ruleAllowsV2(effective(store, users.Employee.id), 'CRM_ALL_READ', company.id).allowed, true);
});

test('every record rule answers under v2 exactly as its role list does, for each template', () => {
  const { store, company, users } = build('legacy');
  const { effective } = require('../dist/authz/evaluate');
  for (const [name, rule] of Object.entries(RECORD_RULES)) {
    for (const role of ROLES) {
      // effectiveLegacy (shadow/legacy read paths) and effective (v2: the
      // system role assignments written for each user) must both agree.
      for (const [label, eff] of [['legacy', effectiveLegacy(store, users[role].id)], ['v2', effective(store, users[role].id)]]) {
        const keys = 'keys' in rule.v2 ? rule.v2.keys : [undefined];
        for (const routeKey of keys) {
          assert.equal(ruleAllowsV2(eff, name, company.id, routeKey).allowed, rule.roles.includes(role), `${label} ${name} ${role} ${routeKey ?? ''}`);
        }
      }
    }
  }
});

test('an undeclared route is refused under v2 and logged as an error', async () => {
  const errors = [];
  const hidden = 'GET /companies/:companyId/sales-orders';
  const { company, users, token, agent } = build('v2', {
    routeLookup: (method, p) => (`${method} ${p}` === hidden ? undefined : routeDecl(method, p)),
    logger: { info() {}, warn() {}, error: (m) => errors.push(String(m)) },
  });
  const res = await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.ok(errors.some((e) => e.includes('undeclared') && e.includes('/companies/:companyId/sales-orders')), errors.join('\n'));
});

test('403 body: code, the declared permission and who can grant it', async () => {
  const v2 = build('v2');
  const res = await v2.agent.get(`/companies/${v2.company.id}/sales-orders`).set('Authorization', `Bearer ${v2.token(v2.users.Employee)}`);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { code: 'FORBIDDEN', permission: 'sales.view', message: 'Ask an Admin, Manager or Accountant.' });

  const legacy = build('legacy');
  const old = await legacy.agent.get(`/companies/${legacy.company.id}/sales-orders`).set('Authorization', `Bearer ${legacy.token(legacy.users.Employee)}`);
  assert.equal(old.status, 403);
  assert.deepEqual(old.body, { code: 'FORBIDDEN', permission: 'sales.view', message: 'You do not have permission to perform this action.' });

  assert.equal(askSentence(['Admin', 'Manager']), 'Ask an Admin or Manager.');
  assert.equal(askSentence(['Manager']), 'Ask a Manager.');
});

test('notification recipients follow v2 grants, and every caller permission is mapped', () => {
  const { store, company, users } = build('v2');
  const before = store.listUserIdsWithPermission(company.id, 'invoices:read', ['Admin', 'Manager', 'Accountant']);
  assert.deepEqual(before.sort(), [users.Admin.id, users.Manager.id, users.Accountant.id].sort());
  addOn(store, company.id, users.Employee.id, 'Invoice reader', [{ key: 'invoices.view' }]);
  assert.ok(store.listUserIdsWithPermission(company.id, 'invoices:read', ['Admin', 'Manager', 'Accountant']).includes(users.Employee.id));

  const fs = require('node:fs');
  const src = path.join(__dirname, '..', 'src');
  const used = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/listUserIdsWithPermission\([^,]+,\s*'([^']+)'/g)) used.add(m[1]);
        if (/listUserIdsWithPermission\([^,]+,\s*`\$\{PRIVATE_READ/.test(fs.readFileSync(p, 'utf8'))) used.add('contacts:private.read');
      }
    }
  };
  walk(src);
  assert.ok(used.size >= 5);
  for (const permission of used) assert.ok(NOTIFY_KEYS[permission], `${permission} has no v2 key`);
});

test('/auth/permissions reports the engine', async () => {
  for (const engine of ['legacy', 'shadow', 'v2']) {
    const { company, users, token, agent } = build(engine);
    const res = await agent.get(`/auth/permissions?companyId=${company.id}`).set('Authorization', `Bearer ${token(users.Admin)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, engine);
  }
});

test('v2 handler checks: cancelling a sales order needs sales.cancel', async () => {
  const { store, company, users, token, agent } = build('v2');
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: company.id });
  const item = store.createInventoryItem({ companyId: company.id, name: 'Dates', category: 'Dates', sku: 'D1', unit: 'kg', unitPrice: 10, unitCost: 6, quantityOnHand: 50 });
  // A custom main role that edits sales but may not cancel them.
  const clerk = store.authz.saveRole(company.id, {
    name: 'Sales clerk', grants: [{ key: 'sales.view' }, { key: 'sales.create' }, { key: 'sales.edit' }], fields: [],
  }, null);
  store.authz.setAssignments(users.Employee.id, company.id, { mainRoleId: clerk.id, addOnRoleIds: [] }, null);
  const as = (req) => req.set('Authorization', `Bearer ${token(users.Employee)}`);
  const created = await as(agent.post(`/companies/${company.id}/sales-orders`)).send({
    clientId: client.id, orderDate: new Date().toISOString(), status: 'Draft',
    items: [{ inventoryItemId: item.id, description: 'Dates', quantity: 1, unitPrice: 10 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const cancel = await as(agent.patch(`/sales-orders/${created.body.id}/status`)).send({ status: 'Cancelled' });
  assert.equal(cancel.status, 403);
  assert.equal(cancel.body.permission, 'sales.cancel');
  assert.equal(cancel.body.message, 'Ask an Admin, Manager or Accountant.');
  const confirm = await as(agent.patch(`/sales-orders/${created.body.id}/status`)).send({ status: 'Confirmed' });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
});

test('v2 record rules at the gate: an add-on with crm.view at company scope opens someone else\'s CRM figures', async () => {
  for (const engine of ['legacy', 'v2']) {
    const { store, company, users, token, agent } = build(engine);
    const url = `/companies/${company.id}/crm-dashboard?ownerUserId=${users.Admin.id}`;
    const get = () => agent.get(url).set('Authorization', `Bearer ${token(users.Employee)}`);
    assert.equal((await get()).status, 403, `${engine}: an Employee sees only their own`);
    addOn(store, company.id, users.Employee.id, 'All CRM', [{ key: 'crm.view', scope: 'company' }]);
    assert.equal((await get()).status, engine === 'v2' ? 200 : 403, `${engine}: the add-on counts only under v2`);
  }
});

/**
 * Every route declared with a catalogue key is decided by that key under v2.
 *
 * A person whose only role grants nothing any route declares (a custom main
 * role holding dashboard.view_finance, a handler-checked key) calls every such
 * route against the seeded demo data, with real record ids where the path's
 * resource has a table, and 'missing' otherwise. Two independent guarantees
 * are asserted:
 *   1. Routes whose company is in the path are refused with 403 before the
 *      handler runs (the auth middleware asks can(declaredKey)).
 *   2. No route answers 2xx, and none trips the fail-closed guard ("answered
 *      without deciding"), which would mean the handler never asked the key
 *      (a 404/400 before the company is known is fine: nothing was served).
 */
test('v2: every catalogue-key route refuses a role that lacks its key', async () => {
  const errors = [];
  const dbPath = path.join(makeTmpDir('taskflow-engine-all-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const company = '1';
  const user = store.createUser({
    name: 'Nobody', email: 'nobody@engine.test', role: 'Employee', password: 'x',
    companyIds: [company], companyRoles: [{ companyId: company, role: 'Employee' }],
  });
  const role = store.authz.saveRole(company, { name: 'Nothing routed', grants: [{ key: 'dashboard.view_finance' }], fields: [] }, null);
  store.authz.setAssignments(user.id, company, { mainRoleId: role.id, addOnRoleIds: [] }, null);
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: 'v2', portalCompanyId: company,
    logger: { info() {}, warn() {}, error: (m) => errors.push(String(m)) },
  });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const auth = `Bearer ${store.issueToken(user.id)}`;

  const tables = new Set(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const idFor = (segment) => {
    const table = segment.replace(/-/g, '_');
    if (!tables.has(table)) return 'missing';
    for (const sql of [`SELECT id FROM ${table} WHERE companyId = ? LIMIT 1`, `SELECT id FROM ${table} LIMIT 1`]) {
      try {
        const row = sql.includes('?') ? store.db.prepare(sql).get(company) : store.db.prepare(sql).get();
        if (row) return String(row.id);
      } catch { /* no companyId column */ }
    }
    return 'missing';
  };
  const urlFor = (p) => {
    const parts = p.split('/');
    return parts.map((part, i) => {
      if (part === ':companyId') return company;
      if (part.startsWith(':')) return idFor(parts[i - 1] ?? '');
      return part;
    }).join('/');
  };

  const routes = ROUTES.filter((r) => isPermissionKey(r.permission));
  const served = [];
  const notRefused = [];
  let refused = 0;
  for (const r of routes) {
    const res = await agent[r.method.toLowerCase()](urlFor(r.path)).set('Authorization', auth).send({ companyId: company });
    if (res.status >= 200 && res.status < 300) served.push(`${r.method} ${r.path} → ${res.status}`);
    if (res.status === 403) refused += 1;
    else if (![400, 404].includes(res.status)) notRefused.push(`${r.method} ${r.path} → ${res.status} (only 403, or 400/404 before the company is known)`);
    const companyInPath = /^\/companies\/:companyId(\/[a-z0-9-]+)*$/.test(r.path) || r.path === '/companies/:companyId';
    if (companyInPath && res.status !== 403) notRefused.push(`${r.method} ${r.path} → ${res.status}`);
  }
  assert.deepEqual(served, [], 'served to a role without the key');
  assert.deepEqual(notRefused, [], 'company in the path but not refused up front');
  assert.deepEqual(errors.filter((e) => e.includes('without deciding')), [], 'a route answered without asking its key');
  assert.ok(routes.length > 400, `${routes.length} catalogue-key routes`);
  // Most record routes 404 here (the demo seed has no such record); the
  // fail-closed guard below covers what such a route would serve.
  assert.ok(refused > 250, `${refused}/${routes.length} refused outright`);
});

test('v2 fail-closed: a declared route that answers without deciding its key is refused and logged', async () => {
  const errors = [];
  // GET /auth/me never asks a company permission; pretend it were declared sales.view.
  const { company, users, token, agent } = build('v2', {
    routeLookup: (method, p) => (`${method} ${p}` === 'GET /auth/me' ? { method: 'GET', path: '/auth/me', permission: 'sales.view' } : routeDecl(method, p)),
    logger: { info() {}, warn() {}, error: (m) => errors.push(String(m)) },
  });
  void company;
  const res = await agent.get('/auth/me').set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(res.status, 403);
  assert.deepEqual({ code: res.body.code, permission: res.body.permission }, { code: 'FORBIDDEN', permission: 'sales.view' });
  assert.equal(errors.filter((e) => e.includes('without deciding')).length, 1);
  await agent.get('/auth/me').set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(errors.filter((e) => e.includes('without deciding')).length, 1, 'logged once per route');
});

test('v2: a credit override is limited by the add-on\'s amount (the overage it allows)', async () => {
  const { store, company, users, token, agent } = build('v2');
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: company.id });
  store.updateClient(client.id, { creditLimit: 100 });
  const item = store.createInventoryItem({ companyId: company.id, name: 'Dates', category: 'Dates', sku: 'D1', unit: 'kg', unitPrice: 10, unitCost: 6, quantityOnHand: 500 });
  addOn(store, company.id, users.Manager.id, 'Small overrides', [{ key: 'invoices.override_credit', limit: 50 }]);
  const order = (qty) => agent.post(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Manager)}`).send({
    clientId: client.id, orderDate: new Date().toISOString(), status: 'Confirmed', overrideCreditLimit: true,
    items: [{ inventoryItemId: item.id, description: 'Dates', quantity: qty, unitPrice: 10 }],
  });
  const within = await order(14); // owes 140: 40 over the limit, within 50
  assert.equal(within.status, 201, JSON.stringify(within.body));
  const beyond = await order(2); // owes 160: 60 over
  assert.equal(beyond.status, 409);
  assert.equal(beyond.body.canOverride, false);
  const { ruleAllowsV2: rule } = require('../dist/authz/engine');
  const { effective } = require('../dist/authz/evaluate');
  const eff = effective(store, users.Manager.id);
  assert.equal(rule(eff, 'INVOICES_CREDIT_OVERRIDE', company.id, undefined, { amount: 50 }).allowed, true);
  assert.equal(rule(eff, 'INVOICES_CREDIT_OVERRIDE', company.id, undefined, { amount: 51 }).allowed, false);
});

test('shadow never changes an answer: a failing v2 computation leaves the legacy result', async () => {
  const errors = [];
  const { store, company, users, token, agent } = build('shadow', { logger: { info() {}, error() {}, warn: (m) => errors.push(String(m)) } });
  const { clearEffectiveCache } = require('../dist/authz/evaluate');
  clearEffectiveCache();
  store.authz.directAssignmentsFor = () => { throw new Error('evaluator down'); };
  const res = await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(res.status, 200);
  const recipients = store.listUserIdsWithPermission(company.id, 'invoices:read', ['Admin', 'Manager', 'Accountant']);
  assert.equal(recipients.length, 3);
  assert.ok(errors.some((e) => e.includes('evaluator down')), errors.join('\n'));
});
