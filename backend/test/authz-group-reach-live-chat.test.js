const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Ruling P (Task 10): someone a holding-group role covers a company for is in
 * that company's reach under v2, for live signals and staff chats too. Under
 * legacy and shadow, membership alone decides, as before.
 *
 * Seed: admin (companies 1-3), user-3 Employee of 1, user-4 Manager of 2 only.
 * user-4 gets a group-wide Admin role over a group holding companies 1 and 2.
 */
function setup(engine) {
  const dbPath = path.join(makeTmpDir(`taskflow-group-reach-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  server.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const groupPerson = store.getUserById('user-4');
  assert.ok(groupPerson && !(groupPerson.companyRoles || []).some((r) => r.companyId === '1'), 'user-4 is not a member of company 1');
  const group = store.authz.createHoldingGroup({ name: 'Holding' }, null);
  store.authz.attachCompany(group.id, '1', null);
  store.authz.attachCompany(group.id, '2', null);
  store.authz.setHoldingAssignment(group.id, groupPerson.id, { mainRoleKey: 'admin', addOnRoleKeys: [] }, null);
  const auth = (id) => `Bearer ${store.issueToken(id)}`;
  const as = (id) => ({
    get: (url) => request(server).get(url).set('Authorization', auth(id)),
    post: (url, body) => request(server).post(url).set('Authorization', auth(id)).send(body ?? {}),
  });
  return { server, store, admin, groupPerson, as, token: (id) => store.issueToken(id) };
}

function openStream(server, token) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const events = [];
    const req = http.get({ host: '127.0.0.1', port, path: '/live', headers: { Authorization: `Bearer ${token}` } }, (res) => {
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
      resolve({ status: res.statusCode, events, close: () => req.destroy() });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? undefined : reject(e)));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const engine of ['legacy', 'shadow', 'v2']) {
  const reaches = engine === 'v2';

  test(`a group-only person ${reaches ? 'gets' : 'does not get'} company 1's live signals (${engine})`, async (t) => {
    const { server, store, admin, groupPerson, token } = setup(engine);
    const stream = await openStream(server, token(groupPerson.id));
    t.after(() => stream.close());
    assert.equal(stream.status, 200);
    await wait(50);
    const project = store.listProjects().find((p) => p.companyId === '1');
    const res = await request(server).post('/tasks').set('Authorization', `Bearer ${token(admin.id)}`)
      .send({ title: 'Group live', projectId: project.id, companyId: '1', status: 'To Do', priority: 'Medium' });
    assert.ok(res.status < 300, JSON.stringify(res.body));
    await wait(100);
    assert.equal(stream.events.some((e) => e.topics.includes('tasks')), reaches, JSON.stringify(stream.events));
  });

  test(`a group-only person ${reaches ? 'is' : 'is not'} a colleague for staff chats (${engine})`, async () => {
    const { admin, groupPerson, as } = setup(engine);
    const members = await as(admin.id).get('/companies/1/team-members');
    assert.equal(members.status, 200);
    assert.equal(members.body.some((m) => m.id === groupPerson.id), reaches);

    const opened = await as(admin.id).post('/companies/1/team-chats', { kind: 'direct', userId: groupPerson.id });
    if (!reaches) {
      assert.ok(opened.status >= 400, `legacy keeps chats to members (${opened.status})`);
      return;
    }
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    const sent = await as(admin.id).post(`/companies/1/team-chats/${opened.body.id}/messages`, { body: 'hello group' });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const theirs = await as(groupPerson.id).get(`/companies/1/team-chats/${opened.body.id}/messages`);
    assert.equal(theirs.status, 200, JSON.stringify(theirs.body));
    assert.equal(theirs.body.messages.at(-1).body, 'hello group');
  });
}
