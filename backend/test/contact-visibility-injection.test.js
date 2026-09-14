const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-injection-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  return { store, app };
};

test('a viewer id cannot widen which private contacts are visible', () => {
  const { store } = build();
  const owner = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const names = (userId) =>
    store.listContacts('1', undefined, { userId, seesPrivate: false }).map((c) => c.name);
  const hidden = store.createContact({ companyId: '1', name: 'Hidden Private', ownerUserId: owner.id });
  store.updateContact(hidden.id, { visibility: 'Private' });
  assert.ok(!names('someone-else').includes('Hidden Private'), 'private to its owner');
  store.createContact({ companyId: '1', name: 'Open Public', visibility: 'Public' });
  assert.ok(!names("x' OR '1'='1").includes('Hidden Private'));
  assert.ok(names("x' OR '1'='1").includes('Open Public'));
  assert.ok(names(owner.id).includes('Hidden Private'), 'the owner still sees it');
});

test('user ids chosen by the caller must be plain', async () => {
  const { store, app } = build();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const auth = `Bearer ${store.issueToken(admin.id)}`;
  const body = (id, email) => ({
    id, name: 'Probe User', email, password: 'Str0ng-pass!', role: 'Employee',
    companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }],
  });
  const bad = await request(app).post('/users').set('Authorization', auth).send(body("x' OR '1'='1", 'bad@probe.test'));
  assert.equal(bad.status, 400);
  const good = await request(app).post('/users').set('Authorization', auth).send(body('import-42', 'good@probe.test'));
  assert.equal(good.status, 201, good.text);
  assert.equal(good.body.user?.id ?? good.body.id, 'import-42');
});

test('a contact created as private stays private', async () => {
  const { store, app } = build();
  const users = store.listUsers();
  const admin = users.find((u) => u.email === 'admin@taskflow.com');
  const employee = users.find((u) => u.email === 'charlie.d@innovatecorp.com');
  const created = await request(app).post('/companies/1/contacts')
    .set('Authorization', `Bearer ${store.issueToken(admin.id)}`)
    .send({ name: 'Secret Supplier', visibility: 'Private' });
  assert.equal(created.status, 201);
  assert.equal(created.body.visibility, 'Private');
  const seen = await request(app).get('/companies/1/contacts').set('Authorization', `Bearer ${store.issueToken(employee.id)}`);
  assert.equal(seen.status, 200);
  assert.ok(!seen.body.some((c) => c.name === 'Secret Supplier'), 'an employee without private access does not see it');
  const refused = await request(app).post('/companies/1/contacts')
    .set('Authorization', `Bearer ${store.issueToken(admin.id)}`)
    .send({ name: 'Odd', visibility: 'Secret' });
  assert.equal(refused.status, 400);
});
