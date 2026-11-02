const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Membership changes take effect on the very next request under every engine.
 * Under v2 the evaluator's cache follows authz_version, which every change to
 * users, roles and companies bumps; nothing is published anywhere (replaces
 * the OpenFGA projection tests).
 */

const quiet = { info() {}, warn() {}, error() {} };

const build = (engine) => {
  const dbPath = path.join(makeTmpDir(`taskflow-lifecycle-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet });
  const server = app.listen(0);
  server.unref();
  const byEmail = (email) => store.listUsers().find((u) => u.email === email);
  const auth = (user) => `Bearer ${store.issueToken(user.id)}`;
  return { server, store, byEmail, auth, admin: byEmail('admin@taskflow.com') };
};

const newEmployee = {
  name: 'New Starter',
  email: 'new.starter@taskflow.test',
  password: 'password',
  role: 'Employee',
  companyRoles: [{ companyId: '1', role: 'Employee' }],
};
const demotion = { role: 'Employee', companyRoles: [{ companyId: '1', role: 'Employee' }] };

for (const engine of ['legacy', 'shadow', 'v2']) {
  test(`a new user has their role's access at once (${engine})`, async () => {
    const { server, store, admin, auth } = build(engine);
    const res = await request(server).post('/users').set('Authorization', auth(admin)).send(newEmployee);
    assert.equal(res.status, 201);
    const user = store.getUserById(res.body.user.id);
    assert.equal((await request(server).get('/companies/1/contacts').set('Authorization', auth(user))).status, 200);
    assert.equal((await request(server).get('/companies/1/invoices').set('Authorization', auth(user))).status, 403);
    if (engine === 'shadow') assert.deepEqual(store.listAuthzDivergences(), []);
  });

  test(`a demoted manager loses manager access on the next request (${engine})`, async () => {
    const { server, store, admin, auth, byEmail } = build(engine);
    const manager = byEmail('samantha.b@innovatecorp.com');
    const token = auth(manager);
    assert.equal((await request(server).get('/companies/1/purchase-orders').set('Authorization', token)).status, 200);
    const res = await request(server).put(`/users/${manager.id}`).set('Authorization', auth(admin)).send(demotion);
    assert.equal(res.status, 200);
    assert.equal((await request(server).get('/companies/1/purchase-orders').set('Authorization', token)).status, 403);
    if (engine === 'shadow') assert.deepEqual(store.listAuthzDivergences(), []);
  });
}
