const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-live-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  server.unref();
  const tokenFor = (id) => store.issueToken(id);
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  return { server, store, tokenFor, admin };
}

/** Opens the live stream and collects its events until closed. */
function openStream(server, token) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const events = [];
    const req = http.get({ host: '127.0.0.1', port, path: '/live', headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const data = block.split('\n').find((l) => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      });
      resolve({ status: res.statusCode, headers: res.headers, events, close: () => req.destroy() });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? undefined : reject(e)));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the live stream needs a sign-in', async () => {
  const { server } = setup();
  const stream = await openStream(server, null);
  assert.equal(stream.status, 401);
  stream.close();
});

test("a colleague's change reaches me; someone in another company hears nothing", async (t) => {
  const { server, store, tokenFor, admin } = setup();
  // user-3 is an Employee of company 1 only; user-4 (seed) is a Manager of company 2 only.
  const colleague = await openStream(server, tokenFor('user-3'));
  assert.equal(colleague.status, 200);
  assert.match(colleague.headers['content-type'], /text\/event-stream/);
  assert.equal(colleague.headers['x-accel-buffering'], 'no', 'nginx must not buffer the stream');
  const outsiderId = store.listUsers().find((u) => (u.companyRoles || []).every((r) => r.companyId === '2'))?.id;
  assert.ok(outsiderId, 'seed has a company-2-only user');
  const outsider = await openStream(server, tokenFor(outsiderId));
  t.after(() => { colleague.close(); outsider.close(); });
  await wait(50);

  const project = store.listProjects().find((p) => p.companyId === '1');
  const res = await request(server).post('/tasks').set('Authorization', `Bearer ${tokenFor(admin.id)}`)
    .send({ title: 'Live task', projectId: project.id, companyId: '1', status: 'To Do', priority: 'Medium' });
  assert.ok(res.status < 300, `task created (${res.status} ${JSON.stringify(res.body)})`);
  await wait(100);

  assert.ok(colleague.events.some((e) => e.topics.includes('tasks')), JSON.stringify(colleague.events));
  assert.equal(outsider.events.length, 0, 'nothing about company 1 reaches company 2');

  // A change found by record id (no company in the path) still reaches only its company.
  const taskId = res.body.id;
  colleague.events.length = 0;
  const del = await request(server).delete(`/tasks/${taskId}`).set('Authorization', `Bearer ${tokenFor(admin.id)}`);
  assert.ok(del.status < 300, `task deleted (${del.status})`);
  await wait(100);
  assert.ok(colleague.events.some((e) => e.topics.includes('tasks')), 'delete reaches the colleague');
  assert.equal(outsider.events.length, 0, 'delete stays in company 1');
});

test('a failed change sends nothing', async (t) => {
  const { server, tokenFor } = setup();
  const colleague = await openStream(server, tokenFor('user-3'));
  t.after(() => colleague.close());
  await wait(50);
  const res = await request(server).post('/companies/1/sales-orders').set('Authorization', `Bearer ${tokenFor('user-3')}`).send({});
  assert.ok(res.status >= 400);
  await wait(100);
  assert.equal(colleague.events.length, 0);
});
