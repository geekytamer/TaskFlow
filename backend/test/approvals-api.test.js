const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** Settings → Approvals: teams, policies per document type, and delegation. */

let seq = 0;
const setup = (engine = 'legacy') => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-apapi-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const co = store.createCompany({ name: 'Co' });
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@apapi.test`, password: 'x', role, companyIds: [co.id], companyRoles: [{ companyId: co.id, role }] });
  const as = (u) => ({
    get: (url) => request(server).get(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`),
    put: (url, body) => request(server).put(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`).send(body ?? {}),
    del: (url) => request(server).delete(url).set('Authorization', `Bearer ${store.issueToken(u.id)}`),
  });
  return { server, store, co, mk, as };
};

for (const engine of ['legacy', 'v2']) {
  test(`an Admin sets up a Legal team and a document policy; others can read but not change (${engine})`, async () => {
    const { server, co, mk, as } = setup(engine);
    const admin = mk('Admin');
    const manager = mk('Manager');
    const lawyer = mk('Employee');
    const team = await as(admin).put(`/companies/${co.id}/approvals/teams`, { name: 'Legal', members: [{ kind: 'user', value: lawyer.id }] });
    assert.equal(team.status, 200, JSON.stringify(team.body));
    assert.equal((await as(manager).put(`/companies/${co.id}/approvals/teams`, { name: 'Nope', members: [] })).status, 403);
    const policy = await as(admin).put(`/companies/${co.id}/approvals/policies/document`, {
      steps: [{ approvers: [{ kind: 'team', id: team.body.id }], need: 'any' }], allowSelf: false, reminderHours: 12,
    });
    assert.equal(policy.status, 200, JSON.stringify(policy.body));
    const read = await as(manager).get(`/companies/${co.id}/approvals/policies`);
    assert.equal(read.status, 200);
    assert.equal(read.body.document.steps[0].approvers[0].id, team.body.id);
    assert.equal(read.body.document.reminderHours, 12);
    assert.equal((await as(admin).put(`/companies/${co.id}/approvals/policies/document`, { steps: [{ approvers: [{ kind: 'team', id: 'nope' }], need: 'any' }] })).status, 400, 'unknown team');
    assert.equal((await as(admin).del(`/companies/${co.id}/approvals/teams/${team.body.id}`)).status, 409, 'a team in a policy stays');
    server.close();
  });
}

test('a person hands their approvals to a colleague for a while', async () => {
  const { server, store, co, mk, as } = setup();
  const lawyer = mk('Employee');
  const stand = mk('Employee');
  const set = await as(lawyer).put('/me/approval-delegation', { toUserId: stand.id, startsAt: '2026-01-01', endsAt: '2026-12-31' });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal((await as(lawyer).get('/me/approval-delegation')).body.toUserId, stand.id);
  assert.equal((await as(lawyer).put('/me/approval-delegation', { toUserId: lawyer.id, startsAt: '2026-01-01', endsAt: '2026-12-31' })).status, 400);
  assert.equal((await as(lawyer).put('/me/approval-delegation', { toUserId: null })).status, 200);
  assert.equal(store.approvals.delegation(lawyer.id), null);
  assert.ok(co);
  server.close();
});

test('a team takes people of this company\'s group only', async () => {
  const { server, store, co, mk, as } = setup();
  const admin = mk('Admin');
  const elsewhere = store.createCompany({ name: 'Elsewhere' });
  const stranger = store.createUser({ name: 'Stranger', email: 'stranger@apapi.test', password: 'x', role: 'Admin', companyIds: [elsewhere.id], companyRoles: [{ companyId: elsewhere.id, role: 'Admin' }] });
  const res = await as(admin).put(`/companies/${co.id}/approvals/teams`, { name: 'Legal', members: [{ kind: 'user', value: stranger.id }] });
  assert.equal(res.status, 400);
  assert.equal((await as(admin).put(`/companies/${co.id}/approvals/policies/nonsense`, { steps: [] })).status, 400, 'no such document type');
  server.close();
});
