const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { rollUpDashboard } = require('../dist/authz/holding-rollup');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * A group seen as one place to work: every company's dashboard rolled up into
 * one, built by the same code that builds each company alone.
 */

const quiet = { info() {}, warn() {}, error() {} };

const build = (engine = 'v2') => {
  const dbPath = path.join(makeTmpDir(`taskflow-rollup-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: quiet,
  }).listen(0);
  server.unref();
  const byEmail = (email) => store.listUsers().find((u) => u.email === email);
  const root = store.createUser({
    name: 'Platform', email: `root${Date.now()}@rollup.test`, password: 'x',
    role: 'Employee', companyIds: [], companyRoles: [],
  });
  store.db.prepare('UPDATE users SET isSuperAdmin = 1 WHERE id = ?').run(root.id);
  const as = (user) => ({
    get: (url) => request(server).get(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`),
    post: (url, body) => request(server).post(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`).send(body ?? {}),
    put: (url, body) => request(server).put(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`).send(body ?? {}),
  });
  return { server, store, byEmail, as, root: store.getUserById(root.id) };
};

test('the merge sums figures, adds charts per month, and names the company on each alert', () => {
  const company = (id, name) => ({ id, name });
  const payload = (open, receivables, alertId) => ({
    companyId: 'x', role: 'Admin', scope: 'company',
    metrics: [
      { id: 'open-tasks', label: 'Open Tasks', value: open, format: 'number' },
      { id: 'open-receivables', label: 'Open Receivables', value: receivables, format: 'currency' },
      { id: 'completion-rate', label: 'Completion Rate', value: 50, format: 'percent' },
    ],
    charts: [{
      id: 'task-load', title: 'Task Load', type: 'line',
      series: [{ key: 'created', label: 'Created', color: '#1' }],
      data: [{ label: 'May', values: { created: open } }, { label: 'Jun', values: { created: 1 } }],
    }],
    alerts: [{ id: alertId, title: 'Overdue', detail: '3 late', severity: 'critical' }],
    activity: [{ id: `${alertId}-a`, title: 'Did a thing', detail: 'detail', createdAt: new Date('2026-01-0' + open), entityType: 'task', entityId: 't' }],
    quickActions: [{ id: 'open-finance', label: 'Finance', route: '/finance' }],
  });

  const rolled = rollUpDashboard('g1', [
    { company: company('1', 'Acme'), payload: payload(2, 100, 'a1') },
    { company: company('2', 'Beta'), payload: payload(3, 50, 'a2') },
  ], [company('3', 'Gamma')]);

  assert.equal(rolled.metrics.find((m) => m.id === 'open-tasks').value, 5, 'counts add up');
  assert.equal(rolled.metrics.find((m) => m.id === 'open-receivables').value, 150, 'money adds up');
  assert.equal(rolled.metrics.find((m) => m.id === 'completion-rate').value, 50, 'a percentage is averaged, not summed');
  const may = rolled.charts[0].data.find((d) => d.label === 'May');
  assert.equal(may.values.created, 5, 'the same month adds up across companies');
  assert.equal(rolled.charts[0].data.length, 2, 'months are not duplicated');
  assert.deepEqual(rolled.alerts.map((a) => a.id), ['1:a1', '2:a2'], 'alert ids stay unique');
  assert.match(rolled.alerts[0].detail, /^Acme — /, 'an alert says which company it is about');
  assert.equal(rolled.activity[0].id, '2:a2-a', 'the newest activity comes first');
  assert.deepEqual(rolled.quickActions.map((a) => a.route), ['/finance'], 'shortcuts are not repeated');
  assert.deepEqual(rolled.companies.map((c) => c.name), ['Acme', 'Beta']);
  assert.deepEqual(rolled.missing.map((c) => c.name), ['Gamma']);
});

test('the group dashboard rolls up its companies, and the filter narrows it', async () => {
  const { store, as, byEmail, root } = build();
  const g = (await as(root).post('/holding-groups', { name: 'Rollup Group' })).body.id;
  for (const companyId of ['1', '2']) {
    assert.equal((await as(root).post(`/holding-groups/${g}/companies`, { companyId })).status, 200);
  }
  const admin = byEmail('admin@taskflow.com');
  assert.equal((await as(root).put(`/holding-groups/${g}/admins`, { userIds: [admin.id] })).status, 200);

  const one = (await as(admin).get('/companies/1/dashboard')).body;
  const two = (await as(admin).get('/companies/2/dashboard')).body;
  const rolled = await as(admin).get(`/holding-groups/${g}/dashboard`);
  assert.equal(rolled.status, 200);
  assert.deepEqual(rolled.body.companies.map((c) => c.id), ['1', '2']);
  assert.deepEqual(rolled.body.missing, []);

  const sum = (payload, id) => payload.metrics.find((m) => m.id === id)?.value ?? 0;
  for (const id of ['open-tasks', 'open-receivables', 'open-payables']) {
    assert.equal(sum(rolled.body, id), sum(one, id) + sum(two, id), `${id} is both companies together`);
  }

  const narrowed = await as(admin).get(`/holding-groups/${g}/dashboard?companyIds=1`);
  assert.deepEqual(narrowed.body.companies.map((c) => c.id), ['1'], 'the filter narrows the roll-up');
  assert.equal(sum(narrowed.body, 'open-tasks'), sum(one, 'open-tasks'));

  const outside = await as(admin).get(`/holding-groups/${g}/dashboard?companyIds=3`);
  assert.deepEqual(outside.body.companies, [], 'the filter can only narrow the group, never widen it');
  assert.ok(store.getCompanyById('3'), 'company 3 exists but is not in this group');
});

test('a company the viewer cannot see a dashboard in is named, not silently counted', async () => {
  const { store, as, byEmail, root } = build();
  const g = (await as(root).post('/holding-groups', { name: 'Partial Group' })).body.id;
  for (const companyId of ['1', '2']) await as(root).post(`/holding-groups/${g}/companies`, { companyId });
  // An employee of company 1 only, made a group admin by the platform admin.
  const charlie = byEmail('charlie.d@innovatecorp.com');
  assert.equal((await as(root).put(`/holding-groups/${g}/admins`, { userIds: [charlie.id] })).status, 200);

  const rolled = await as(charlie).get(`/holding-groups/${g}/dashboard`);
  assert.equal(rolled.status, 200);
  const seen = rolled.body.companies.map((c) => c.id);
  const missing = rolled.body.missing.map((c) => c.id);
  assert.deepEqual([...seen, ...missing].sort(), ['1', '2'], 'every company is accounted for');
  assert.ok(missing.length > 0, 'an employee does not get a company-wide dashboard through the group');
  assert.ok(rolled.body.missing.every((c) => c.name), 'a missing company is named');
  assert.ok(store.getUserById(charlie.id));
});

test('only an administrator of the group may roll it up', async () => {
  const { as, byEmail, root } = build();
  const g = (await as(root).post('/holding-groups', { name: 'Closed Group' })).body.id;
  await as(root).post(`/holding-groups/${g}/companies`, { companyId: '1' });
  const outsider = byEmail('samantha.b@innovatecorp.com');
  assert.equal((await as(outsider).get(`/holding-groups/${g}/dashboard`)).status, 403);
  assert.equal((await as(root).get(`/holding-groups/${g}/dashboard`)).status, 200);
});
