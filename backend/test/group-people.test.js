const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Stage 3: everyone in a group in one place. Access per company is changed
 * with PUT /users/:id (its guards); the employer is the HR record a person's
 * login is linked to, at most one active one within a group.
 */

const quiet = { info() {}, warn() {}, error() {} };
let seq = 0;

const build = (engine = 'legacy') => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-gp-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet }).listen(0);
  server.unref();
  const user = (roles, name = `p${++seq}`) => store.createUser({
    name, email: `${name}-${seq}@gp.test`, role: roles[0]?.[1] ?? 'Employee', password: 'x',
    companyIds: roles.map(([c]) => c), companyRoles: roles.map(([companyId, role]) => ({ companyId, role })),
  });
  const as = (u) => ({
    get: (url) => request(server).get(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`),
    post: (url, body) => request(server).post(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`).send(body ?? {}),
    put: (url, body) => request(server).put(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`).send(body ?? {}),
  });
  const g = store.createCompany({ name: 'Group' });
  const a = store.createCompany({ name: 'Alpha' });
  const b = store.createCompany({ name: 'Beta' });
  store.setCompanyParent(a.id, g.id, null);
  store.setCompanyParent(b.id, g.id, null);
  return { server, store, user, as, g, a, b };
};

for (const engine of ['legacy', 'v2']) {
  test(`the group's people: everyone once, their companies and roles, and what I may change (${engine})`, async () => {
    const { server, user, as, g, a, b } = build(engine);
    const boss = user([[g.id, 'Admin'], [a.id, 'Admin']], 'boss');
    const worker = user([[a.id, 'Employee'], [b.id, 'Manager']], 'worker');
    const outsider = user([[b.id, 'Employee']], 'outsider');
    const res = await as(boss).get(`/companies/${g.id}/group-people`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.companies.map((c) => c.id), [g.id, a.id, b.id]);
    assert.deepEqual(res.body.manageable.sort(), [g.id, a.id].sort(), 'Admin in G and Alpha, nothing in Beta');
    const w = res.body.people.find((p) => p.id === worker.id);
    assert.deepEqual(w.memberships.map((m) => `${m.companyId}:${m.role}`).sort(), [`${a.id}:Employee`, `${b.id}:Manager`].sort());
    assert.ok(res.body.people.some((p) => p.id === outsider.id), 'people of any company in the tree');
    assert.equal(new Set(res.body.people.map((p) => p.id)).size, res.body.people.length, 'each person once');
    assert.equal((await as(worker).get(`/companies/${g.id}/group-people`)).status, 403, 'not a member of the group company');
    server.close();
  });
}

test('a person works for at most one company of a group', async () => {
  const { server, store, user, as, g, a, b } = build();
  const boss = user([[g.id, 'Admin'], [a.id, 'Admin'], [b.id, 'Admin']], 'boss');
  const worker = user([[a.id, 'Employee'], [b.id, 'Employee']], 'worker');
  const first = await as(boss).post(`/companies/${a.id}/employees`, { name: 'Worker', userId: worker.id });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await as(boss).post(`/companies/${b.id}/employees`, { name: 'Worker', userId: worker.id });
  assert.equal(second.status, 409);
  assert.match(second.body.message ?? second.body.error ?? '', /Alpha/);
  const res = await as(boss).get(`/companies/${g.id}/group-people`);
  assert.deepEqual(res.body.people.find((p) => p.id === worker.id).employer, { companyId: a.id, employeeId: first.body.id });
  // Ending the first employment frees them.
  store.updateEmployee(first.body.id, { status: 'Terminated' });
  assert.equal((await as(boss).post(`/companies/${b.id}/employees`, { name: 'Worker', userId: worker.id })).status, 201);
  server.close();
});

for (const engine of ['legacy', 'v2']) {
  test(`access across the group goes through the usual guards (${engine})`, async () => {
    const { server, store, user, as, g, a, b } = build(engine);
    const boss = user([[g.id, 'Admin'], [a.id, 'Admin']], 'boss');
    const worker = user([[a.id, 'Employee']], 'worker');
    const outside = store.createCompany({ name: 'Outside' });
    const roleIn = (id, c) => store.getUserById(id).companyRoles.find((r) => r.companyId === c)?.role;

    const give = await as(boss).put(`/companies/${g.id}/group-people/${worker.id}/access`, { companyId: g.id, role: 'Manager' });
    assert.equal(give.status, 200, JSON.stringify(give.body));
    assert.equal(roleIn(worker.id, g.id), 'Manager');
    assert.equal(roleIn(worker.id, a.id), 'Employee', 'other companies unchanged');

    assert.equal((await as(boss).put(`/companies/${g.id}/group-people/${worker.id}/access`, { companyId: b.id, role: 'Employee' })).status, 403, 'not a manager in Beta');
    assert.equal((await as(boss).put(`/companies/${g.id}/group-people/${worker.id}/access`, { companyId: outside.id, role: 'Employee' })).status, 400, 'outside the group');

    const gone = await as(boss).put(`/companies/${g.id}/group-people/${worker.id}/access`, { companyId: g.id, role: null });
    assert.equal(gone.status, 200);
    assert.equal(roleIn(worker.id, g.id), undefined);

    const last = await as(boss).put(`/companies/${g.id}/group-people/${worker.id}/access`, { companyId: a.id, role: null });
    assert.equal(last.status, 400, 'a person keeps at least one company');
    server.close();
  });
}

test('removing someone from the group ends their access in every company I manage there, nowhere else', async () => {
  const { server, store, user, as, g, a, b } = build();
  const boss = user([[g.id, 'Admin'], [a.id, 'Admin'], [b.id, 'Admin']], 'boss');
  const outside = store.createCompany({ name: 'Outside' });
  const worker = user([[a.id, 'Employee'], [b.id, 'Manager'], [outside.id, 'Employee']], 'worker');
  const res = await as(boss).post(`/companies/${g.id}/group-people/${worker.id}/remove`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(store.getUserById(worker.id).companyRoles.map((r) => r.companyId), [outside.id]);
  server.close();
});
