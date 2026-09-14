const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { allPermissions } = require('../dist/permissions/catalogue');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Company-wide module switches: the platform super admin turns a module off
 * for a company, and it is then off for everyone there, admins included,
 * under every engine — while the groups' grants are kept for switching back on.
 */

const COMPANY = '1';
const quiet = { info() {}, warn() {}, error() {} };

// OpenFGA emulated from the database's grants, as in record-rules-parity.test.js.
const sqlReader = (store) => ({
  async listGrantedObjects(userId) {
    const user = store.getUserById(userId);
    const objects = [];
    for (const company of store.listCompanies()) {
      const superAdminHere = Boolean(user?.isSuperAdmin) && (user.companyIds || []).includes(company.id);
      for (const perm of superAdminHere ? allPermissions() : store.getEffectivePermissions(userId, company.id)) {
        const cut = perm.indexOf(':');
        objects.push(`permission:${company.id}/${perm.slice(0, cut)}/${perm.slice(cut + 1)}`);
      }
    }
    return objects;
  },
});

const build = (engine = 'legacy') => {
  const dbPath = path.join(makeTmpDir(`taskflow-modules-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet,
    authzEngine: engine, permissionReader: sqlReader(store), tupleWriter: { async write() {} },
  }).listen(0);
  server.unref();
  // The demo seed has no platform super admin (bootstrap creates one), so add one.
  const superAdmin = store.createUser({
    name: 'Platform Admin', email: 'platform@modules.test', password: 'x',
    role: 'Admin', companyIds: [], companyRoles: [], isSuperAdmin: true,
  });
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  assert.ok(admin && store.getUserById(superAdmin.id).isSuperAdmin, 'a company admin and a super admin exist');
  return {
    app: server, store, admin,
    adminAuth: `Bearer ${store.issueToken(admin.id)}`,
    superAuth: `Bearer ${store.issueToken(superAdmin.id)}`,
  };
};

const switchOff = (ctx, modules) =>
  request(ctx.app).put(`/companies/${COMPANY}`).set('Authorization', ctx.superAuth).send({ disabledModules: modules });

test('only the platform administrator switches modules, and only switchable ones', async () => {
  const ctx = build();
  const { app, store, adminAuth, superAuth } = ctx;

  const byAdmin = await request(app).put(`/companies/${COMPANY}`).set('Authorization', adminAuth)
    .send({ disabledModules: ['payroll'] });
  assert.equal(byAdmin.status, 403);

  const version = store.getAuthzVersion();
  const rename = await request(app).put(`/companies/${COMPANY}`).set('Authorization', adminAuth)
    .send({ name: 'Renamed Company' });
  assert.equal(rename.status, 200);
  assert.deepEqual(rename.body.disabledModules, []);
  assert.equal(store.getAuthzVersion(), version, 'an unrelated edit does not make clients refetch');

  for (const bad of [['settings'], ['dashboard'], ['no-such-module'], 'payroll']) {
    const res = await switchOff(ctx, bad);
    assert.equal(res.status, 400, `refuses ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(store.getDisabledModules(COMPANY), [], 'refused changes store nothing');

  const off = await switchOff(ctx, ['payroll', 'hr', 'payroll']);
  assert.equal(off.status, 200);
  assert.deepEqual(off.body.disabledModules, ['hr', 'payroll']);
  assert.ok(store.getAuthzVersion() > version, 'open browsers learn of the switch');

  const listed = await request(app).get('/companies').set('Authorization', adminAuth);
  assert.deepEqual(listed.body.find((c) => c.id === COMPANY).disabledModules, ['hr', 'payroll']);

  const created = await request(app).post('/companies').set('Authorization', superAuth)
    .send({ name: 'Modules Co', disabledModules: ['crm'] });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.disabledModules, ['crm']);
  assert.deepEqual(store.getDisabledModules(created.body.id), ['crm']);

  const catalogue = await request(app).get('/permissions/catalogue').set('Authorization', adminAuth);
  assert.deepEqual([...catalogue.body.alwaysOnModules].sort(), ['dashboard', 'settings']);
});

for (const engine of ['legacy', 'openfga']) {
  test(`a switched-off module is refused for everyone, admins included (${engine})`, async () => {
    const ctx = build(engine);
    const { app, store, adminAuth } = ctx;
    const project = store.listProjects().find((p) => p.companyId === COMPANY);
    const task = store.listTasks().find((t) => t.companyId === COMPANY && !t.isPrivate);
    assert.ok(project && task, 'seed has a project and a task in the company');

    const payroll = () => request(app).get(`/companies/${COMPANY}/payroll-runs`).set('Authorization', adminAuth);
    const projectRead = () => request(app).get(`/projects/${project.id}`).set('Authorization', adminAuth);
    const taskRead = () => request(app).get(`/tasks/${task.id}`).set('Authorization', adminAuth);
    assert.equal((await payroll()).status, 200);
    assert.equal((await projectRead()).status, 200);
    assert.equal((await taskRead()).status, 200);

    assert.equal((await switchOff(ctx, ['payroll', 'projects', 'tasks'])).status, 200);

    const refused = await payroll();
    assert.equal(refused.status, 403);
    assert.match(refused.body.message ?? refused.text, /turned off/);
    assert.equal((await projectRead()).status, 403);
    assert.equal((await taskRead()).status, 403);
    const projects = await request(app).get('/projects').set('Authorization', adminAuth);
    assert.ok(!projects.body.some((p) => p.companyId === COMPANY), 'project lists leave the company out');
    const tasks = await request(app).get('/tasks').set('Authorization', adminAuth);
    assert.ok(!tasks.body.some((t) => t.companyId === COMPANY), 'task lists leave the company out');
    const createTask = await request(app).post('/tasks').set('Authorization', adminAuth)
      .send({ companyId: COMPANY, title: 'While tasks are off', status: 'To Do', priority: 'Medium', projectId: project.id });
    assert.equal(createTask.status, 403, createTask.text);

    assert.equal((await switchOff(ctx, [])).status, 200);
    assert.equal((await payroll()).status, 200);
    assert.equal((await projectRead()).status, 200);
    assert.equal((await taskRead()).status, 200);
  });
}

test('the feed leaves out a switched-off module, and the groups keep their grants', async () => {
  const ctx = build('openfga');
  const { app, store, admin, adminAuth } = ctx;
  const feed = async () =>
    (await request(app).get(`/auth/permissions?companyId=${COMPANY}`).set('Authorization', adminAuth)).body;

  const before = await feed();
  assert.deepEqual(before.disabledModules, []);
  assert.ok(before.permissions.includes('payroll:read'));

  await switchOff(ctx, ['payroll']);
  const during = await feed();
  assert.deepEqual(during.disabledModules, ['payroll']);
  assert.ok(!during.permissions.some((p) => p.startsWith('payroll:')));
  assert.ok(store.getEffectivePermissions(admin.id, COMPANY).includes('payroll:read'), 'grants are kept');
  assert.deepEqual(store.listUserIdsWithPermission(COMPANY, 'payroll:read', ['Admin']), [], 'nobody is notified');

  await switchOff(ctx, []);
  assert.deepEqual((await feed()).permissions, before.permissions, 'switching back on restores the same access');
});
