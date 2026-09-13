const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Every route that changes who belongs to what must publish the change to
 * OpenFGA. Under the openfga engine, a change that stays in SQL is a new user
 * who is locked out, or a demoted user who keeps their old access.
 *
 * Requests are authorized from SQL here, so these tests isolate publication:
 * a recording writer stands in for OpenFGA.
 */

const sqlReader = (store) => ({
  async listGrantedObjects(userId) {
    const objects = [];
    for (const company of store.listCompanies()) {
      for (const perm of store.getEffectivePermissions(userId, company.id)) {
        const [module, action] = perm.split(':');
        objects.push(`permission:${company.id}/${module}/${action}`);
      }
    }
    return objects;
  },
});

/** Records what would be written, and the authz version at the moment of writing. */
const recorder = (store) => ({
  calls: [],
  versionsDuringWrite: [],
  async write(req) {
    this.versionsDuringWrite.push(store.getAuthzVersion());
    this.calls.push(req);
  },
  writes() {
    return this.calls.flatMap((c) => c.writes ?? []);
  },
  deletes() {
    return this.calls.flatMap((c) => c.deletes ?? []);
  },
});

const quiet = { info() {}, warn() {}, error() {} };

const build = ({ engine = 'openfga', writer = recorder } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-lifecycle-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const tupleWriter = writer(store);
  const app = createServer({
    store,
    dbPath,
    seedOnEmpty: false,
    allowSeedReset: false,
    authzEngine: engine,
    permissionReader: sqlReader(store),
    tupleWriter,
    logger: quiet,
  });
  const server = app.listen(0);
  server.unref();
  const byEmail = (email) => store.listUsers().find((u) => u.email === email);
  const auth = (user) => `Bearer ${store.issueToken(user.id)}`;
  return { server, store, tupleWriter, byEmail, auth, admin: byEmail('admin@taskflow.com') };
};

const mentioning = (tuples, id) => tuples.filter((t) => `${t.user} ${t.object}`.includes(id));

const superAdmin = (store) =>
  store.createUser({
    name: 'Platform Owner',
    email: 'owner@platform.test',
    password: 'not-used',
    role: 'Admin',
    companyIds: ['1'],
    companyRoles: [{ companyId: '1', role: 'Admin' }],
    isSuperAdmin: true,
  });

const newEmployee = {
  name: 'New Starter',
  email: 'new.starter@taskflow.test',
  password: 'password',
  role: 'Employee',
  companyRoles: [{ companyId: '1', role: 'Employee' }],
};

const demotion = { role: 'Employee', companyRoles: [{ companyId: '1', role: 'Employee' }] };

test('adding a user publishes their membership', async () => {
  const { server, tupleWriter, admin, auth } = build();
  const res = await request(server).post('/users').set('Authorization', auth(admin)).send(newEmployee);
  assert.equal(res.status, 201);
  assert.ok(
    mentioning(tupleWriter.writes(), res.body.user.id).length > 0,
    'a user with no tuples is denied everything under openfga',
  );
});

test('demoting a user withdraws the old membership as well as adding the new one', async () => {
  const { server, tupleWriter, admin, auth, byEmail } = build();
  const manager = byEmail('samantha.b@innovatecorp.com');
  const res = await request(server).put(`/users/${manager.id}`).set('Authorization', auth(admin)).send(demotion);
  assert.equal(res.status, 200);
  const withdrawn = mentioning(tupleWriter.deletes(), manager.id).map((t) => t.object).sort();
  const granted = mentioning(tupleWriter.writes(), manager.id).map((t) => t.object).sort();
  assert.ok(withdrawn.length > 0, 'without the delete, a demoted manager keeps manager access');
  assert.ok(granted.length > 0, 'the new membership must be published');
  assert.notDeepEqual(withdrawn, granted);
});

test('deleting a user withdraws their tuples', async () => {
  const { server, store, tupleWriter, admin, auth } = build();
  const leaver = store.createUser({
    name: 'Leaver',
    email: 'leaver@taskflow.test',
    password: 'not-used',
    role: 'Employee',
    companyIds: ['1'],
    companyRoles: [{ companyId: '1', role: 'Employee' }],
  });
  const res = await request(server).delete(`/users/${leaver.id}`).set('Authorization', auth(admin));
  assert.equal(res.status, 200);
  assert.ok(mentioning(tupleWriter.deletes(), leaver.id).length > 0);
});

test('creating a company publishes its groups and grants', async () => {
  const { server, store, tupleWriter, auth } = build();
  const res = await request(server)
    .post('/companies')
    .set('Authorization', auth(superAdmin(store)))
    .send({ name: 'Fresh Company' });
  assert.equal(res.status, 201);
  assert.ok(mentioning(tupleWriter.writes(), res.body.id).length > 0);
});

test('deleting a company withdraws its tuples', async () => {
  const { server, store, tupleWriter, auth } = build();
  const owner = superAdmin(store);
  const company = store.createCompany({ name: 'Short Lived', website: '', address: '' });
  const res = await request(server)
    .delete(`/companies/${company.id}?cascade=true`)
    .set('Authorization', auth(owner));
  assert.equal(res.status, 200);
  assert.ok(mentioning(tupleWriter.deletes(), company.id).length > 0);
});

test('edits that change no access publish nothing', async () => {
  const { server, tupleWriter, admin, auth, byEmail } = build();
  const employee = byEmail('charlie.d@innovatecorp.com');
  const profile = await request(server).put('/auth/me').set('Authorization', auth(admin)).send({ name: 'Renamed Admin' });
  assert.equal(profile.status, 200);
  const rename = await request(server)
    .put(`/users/${employee.id}`)
    .set('Authorization', auth(admin))
    .send({ name: 'Charles Davis' });
  assert.equal(rename.status, 200);
  assert.equal(tupleWriter.calls.length, 0);
});

test('cached decisions are invalidated after publishing, not only before', async () => {
  const { server, store, tupleWriter, admin, auth, byEmail } = build();
  const manager = byEmail('samantha.b@innovatecorp.com');
  const res = await request(server).put(`/users/${manager.id}`).set('Authorization', auth(admin)).send(demotion);
  assert.equal(res.status, 200);
  assert.ok(tupleWriter.versionsDuringWrite.length > 0);
  assert.ok(
    store.getAuthzVersion() > Math.max(...tupleWriter.versionsDuringWrite),
    'a decision cached while OpenFGA still held the old tuples must not survive the change',
  );
});

test('permission-group edits also invalidate after publishing', async () => {
  const { server, store, tupleWriter, admin, auth, byEmail } = build();
  const employee = byEmail('charlie.d@innovatecorp.com');
  const accountant = store.getPermissionGroupByKey('1', 'accountant');
  const res = await request(server)
    .put(`/companies/1/users/${employee.id}/groups`)
    .set('Authorization', auth(admin))
    .send({ groupIds: [accountant.id] });
  assert.equal(res.status, 200);
  assert.ok(tupleWriter.versionsDuringWrite.length > 0);
  assert.ok(store.getAuthzVersion() > Math.max(...tupleWriter.versionsDuringWrite));
});

test('a failed publish answers 503 and still invalidates cached decisions', async () => {
  let versionAtFailure;
  const unreachable = (store) => ({
    async write() {
      versionAtFailure = store.getAuthzVersion();
      throw new Error('OpenFGA unreachable');
    },
  });
  const { server, store, admin, auth, byEmail } = build({ writer: unreachable });
  const manager = byEmail('samantha.b@innovatecorp.com');
  const res = await request(server).put(`/users/${manager.id}`).set('Authorization', auth(admin)).send(demotion);
  assert.equal(res.status, 503);
  assert.match(res.body.message, /saved but could not be published/);
  assert.ok(store.getAuthzVersion() > versionAtFailure);
});

test('the legacy engine publishes nothing', async () => {
  const { server, tupleWriter, admin, auth } = build({ engine: 'legacy' });
  const res = await request(server).post('/users').set('Authorization', auth(admin)).send(newEmployee);
  assert.equal(res.status, 201);
  assert.equal(tupleWriter.calls.length, 0);
});
