const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

test('updating some company details leaves the others as they were', async () => {
  const dbPath = path.join(makeTmpDir('taskflow-company-update-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const auth = `Bearer ${store.issueToken(admin.id)}`;

  const details = { legalName: 'Innovate Corp LLC', taxNumber: 'OM123', phone: '+968 1', city: 'Muscat' };
  assert.equal((await request(app).put('/companies/1').set('Authorization', auth).send(details)).status, 200);

  const renamed = await request(app).put('/companies/1').set('Authorization', auth).send({ name: 'Innovate Corporation' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, 'Innovate Corporation');
  for (const [key, value] of Object.entries(details)) assert.equal(renamed.body[key], value, `${key} survives`);

  const cleared = await request(app).put('/companies/1').set('Authorization', auth).send({ phone: '' });
  assert.equal(cleared.body.phone, '', 'an explicit empty value still clears a field');
  assert.equal(cleared.body.legalName, details.legalName);
});
