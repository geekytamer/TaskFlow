const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

test('editing an opportunity can clear its notes and close date, and winning it converts the contact', async () => {
  const dbPath = path.join(makeTmpDir('taskflow-opp-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy', logger: { info() {}, warn() {}, error() {} } }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(admin.id)}`);
  const contact = (await as(request(app).post('/companies/1/contacts')).send({ name: 'Lead Co', roles: ['Lead'], leadStatus: 'New' })).body;
  const opp = (await as(request(app).post('/companies/1/opportunities')).send({
    contactId: contact.id, title: 'Big deal', serviceType: 'Web', notes: 'Call back', expectedCloseDate: '2026-12-01',
  })).body;
  const cleared = await as(request(app).put(`/opportunities/${opp.id}`)).send({ notes: null, expectedCloseDate: null });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.notes, undefined);
  assert.equal(cleared.body.expectedCloseDate, undefined);

  const won = await as(request(app).put(`/opportunities/${opp.id}`)).send({ stage: 'Won' });
  assert.equal(won.status, 200);
  assert.ok(store.getContactById(contact.id).roles.includes('Client'), 'the contact became a client');
});
