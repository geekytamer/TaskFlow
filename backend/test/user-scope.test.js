const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-userscope-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: true, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const mk = (email, companyRoles, extra = {}) => store.createUser({
    name: email.split('@')[0], email, password: 'Password1!', companyIds: companyRoles.map((r) => r.companyId),
    companyRoles, role: companyRoles[0]?.role || 'Employee', ...extra,
  });
  const companyAdmin = mk('ali@one.example', [{ companyId: '1', role: 'Admin' }]);
  const shared = mk('sara@both.example', [{ companyId: '1', role: 'Employee' }, { companyId: '2', role: 'Manager' }]);
  const outsider = mk('omar@two.example', [{ companyId: '2', role: 'Employee' }]);
  const superAdmin = mk('root@platform.example', [{ companyId: '1', role: 'Employee' }], { isSuperAdmin: true });
  const as = (user) => (req) => req.set('Authorization', `Bearer ${store.issueToken(user.id)}`);
  return { app, store, companyAdmin, shared, outsider, superAdmin, as };
}

test('a company admin cannot create a user in another company', async () => {
  const { app, companyAdmin, as } = setup();
  const res = await as(companyAdmin)(request(app).post('/users')).send({
    name: 'Intruder', email: 'new@two.example', companyRoles: [{ companyId: '2', role: 'Employee' }],
  });
  assert.equal(res.status, 403);
  const own = await as(companyAdmin)(request(app).post('/users')).send({
    name: 'Newbie', email: 'new@one.example', companyRoles: [{ companyId: '1', role: 'Employee' }],
  });
  assert.equal(own.status, 201, JSON.stringify(own.body));
});

test('a company admin sees only their own companies in the user list', async () => {
  const { app, companyAdmin, outsider, shared, as } = setup();
  const res = await as(companyAdmin)(request(app).get('/users'));
  assert.equal(res.status, 200);
  const ids = res.body.map((u) => u.id);
  assert.ok(!ids.includes(outsider.id), 'no one from other companies');
  const sara = res.body.find((u) => u.id === shared.id);
  assert.ok(sara);
  assert.deepEqual(sara.companyIds, ['1'], 'other companies are not revealed');
  assert.ok(sara.companyRoles.every((r) => r.companyId === '1'));
  assert.equal((await as(companyAdmin)(request(app).get(`/users/${outsider.id}`))).status, 403);
});

test("editing a shared user changes only the admin's company and keeps the rest", async () => {
  const { app, store, companyAdmin, shared, as } = setup();
  const res = await as(companyAdmin)(request(app).put(`/users/${shared.id}`)).send({
    companyRoles: [{ companyId: '1', role: 'Accountant' }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const after = store.getUserById(shared.id);
  assert.equal(after.companyRoles.find((r) => r.companyId === '1').role, 'Accountant');
  assert.equal(after.companyRoles.find((r) => r.companyId === '2').role, 'Manager', 'company 2 untouched');

  const grab = await as(companyAdmin)(request(app).put(`/users/${shared.id}`)).send({
    companyRoles: [{ companyId: '1', role: 'Accountant' }, { companyId: '2', role: 'Admin' }],
  });
  assert.equal(grab.status, 403);
  const del = await as(companyAdmin)(request(app).delete(`/users/${shared.id}`));
  assert.equal(del.status, 403, 'deleting removes them from company 2 too');
});

test('platform-wide actions belong to the super admin', async () => {
  const { app, companyAdmin, superAdmin, as } = setup();
  assert.equal((await as(companyAdmin)(request(app).post('/seed'))).status, 403);
  assert.equal((await as(companyAdmin)(request(app).post('/positions')).send({ title: 'Chief' })).status, 403);
  assert.equal((await as(superAdmin)(request(app).post('/positions')).send({ title: 'Chief' })).status, 201);
});

test("the super admin sees a company's custom roles without being a member", async () => {
  const { app, store, superAdmin, as } = setup();
  const group = store.createPermissionGroup({ companyId: '2', key: 'field-sales', name: 'Field sales' });
  const res = await as(superAdmin)(request(app).get('/companies/2/permission-groups'));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.some((g) => g.id === group.id));
});

test('group assignment is only for members of that company', async () => {
  const { app, store, companyAdmin, outsider, as } = setup();
  const group = store.createPermissionGroup({ companyId: '1', key: 'helpers', name: 'Helpers' });
  const res = await as(companyAdmin)(request(app).put(`/companies/1/users/${outsider.id}/groups`)).send({ groupIds: [group.id] });
  assert.equal(res.status, 400);
});
