const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** How the API answers requests it cannot read. */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-http-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  return { app, store, as };
}

test('a request body that is not valid JSON is a 400, not a server error', async () => {
  const { app } = setup();
  const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{"email": broken');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /not valid JSON/);
});
