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

  // The admin page opens a company to edit its modules, membership or not.
  const opened = await request(app).get(`/companies/${created.body.id}`).set('Authorization', superAuth);
  assert.equal(opened.status, 200);
  assert.deepEqual(opened.body.disabledModules, ['crm']);
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

const setModulesOff = (store, modules) => store.updateCompany(COMPANY, { disabledModules: modules });

test('a switched-off module sends no notifications and hides the ones already sent', () => {
  const { store, admin } = build();
  const employee = store.listUsers().find((u) => u.email === 'charlie.d@innovatecorp.com');
  const send = () => store.notify({ companyId: COMPANY, userIds: [employee.id], type: 'task_due', title: 'Due soon: probe' });

  assert.equal(send().length, 1);
  const visible = () => store.listNotifications(employee.id).filter((n) => n.title === 'Due soon: probe').length;
  const unread = store.unreadNotificationCount(employee.id);
  assert.equal(visible(), 1);

  setModulesOff(store, ['tasks']);
  assert.deepEqual(send(), [], 'nothing new is sent');
  assert.equal(visible(), 0, 'earlier ones are hidden');
  assert.equal(store.unreadNotificationCount(employee.id), unread - 1);
  assert.ok(!store.listPendingDigestNotifications().some((n) => n.title === 'Due soon: probe'), 'and left out of the digest');

  setModulesOff(store, []);
  assert.equal(visible(), 1, 'switching back on shows them again');
  assert.ok(admin);
});

test('automatic follow-ups need CRM and the module of their source record', () => {
  const { store } = build();
  const contact = store.createContact({ companyId: COMPANY, name: 'Follow-up Probe' });
  const schedule = (sourceId) => store.scheduleAutomaticFollowup({
    companyId: COMPANY, contactId: contact.id, trigger: 'InvoiceOverdue', sourceType: 'invoice', sourceId,
    summary: 'probe', nextAction: 'probe', offsetDays: 0,
  });
  setModulesOff(store, ['crm']);
  assert.equal(schedule('probe-1'), undefined);
  setModulesOff(store, ['invoices']);
  assert.equal(schedule('probe-2'), undefined);
  setModulesOff(store, []);
  assert.ok(schedule('probe-3'), 'with both on it is scheduled');
});

test('a switched-off WhatsApp module takes in no messages', async () => {
  const { app, store } = build();
  const instance = store.upsertWhatsappInstance(COMPANY, { idInstance: '1101', apiToken: 'probe-token' });
  assert.ok(instance.webhookToken, 'the instance has a webhook token');
  const deliver = (id) => request(app).post(`/whatsapp/webhook/${instance.webhookToken}`).send({
    typeWebhook: 'incomingMessageReceived', idMessage: id, timestamp: Math.floor(Date.now() / 1000),
    senderData: { chatId: '96890000000@c.us' }, messageData: { textMessageData: { textMessage: 'hello' } },
  });
  const stored = (id) => store.listWhatsappMessages(COMPANY, { limit: 500 }).some((m) => m.externalId === id);

  setModulesOff(store, ['whatsapp']);
  const ignored = await deliver('probe-off');
  assert.equal(ignored.status, 200, 'still acknowledged, so the provider stops retrying');
  assert.equal(ignored.body.ignored, true);
  assert.equal(stored('probe-off'), false);

  setModulesOff(store, []);
  assert.equal((await deliver('probe-on')).status, 200);
  assert.equal(stored('probe-on'), true);
});

test('the dashboard leaves out figures from a switched-off module', () => {
  const { store, admin } = build();
  const payload = () => store.getDashboardPayload(COMPANY, { userId: admin.id, role: 'Admin' });
  const taskItems = (p) => [
    ...p.metrics.map((m) => m.id), ...p.charts.map((c) => c.id), ...p.alerts.map((a) => a.id),
  ].filter((id) => /task/.test(id));
  assert.ok(taskItems(payload()).length > 0, 'tasks show while the module is on');
  setModulesOff(store, ['tasks', 'projects']);
  const off = payload();
  assert.deepEqual(taskItems(off), []);
  assert.ok(!off.quickActions.some((a) => a.route === '/projects'));
  assert.ok(off.metrics.length > 0, 'other figures remain');
});

test('contact summaries and record timelines respect switched-off modules', async () => {
  const ctx = build();
  const { app, store, adminAuth } = ctx;
  const summary = async (id) => (await request(app).get(`/contacts/${id}/summary`).set('Authorization', adminAuth)).body;
  const client = store.createContact({ companyId: COMPANY, name: 'Summary Probe' });
  const now = new Date();
  const invoice = store.createInvoice({
    companyId: COMPANY, clientId: client.id, contactId: client.id,
    issueDate: now, dueDate: new Date(now.getTime() + 7 * 86400000), status: 'Sent', total: 100,
    lineItems: [{ description: 'Probe', quantity: 1, unitPrice: 100, amount: 100, itemType: 'Manual' }],
  });
  assert.equal((await summary(client.id)).invoices.length, 1, 'the invoice shows while invoices are on');

  const task = store.listTasks().find((t) => t.companyId === COMPANY && !t.isPrivate);
  const timeline = () => request(app).get(`/companies/${COMPANY}/records/task/${task.id}/timeline`).set('Authorization', adminAuth);
  assert.equal((await timeline()).status, 200);

  setModulesOff(store, ['invoices', 'tasks']);
  const off = await summary(client.id);
  assert.deepEqual(off.invoices, []);
  assert.equal(off.totals.invoiceCount, 0);
  assert.equal((await timeline()).status, 403);
  const attachments = await request(app).get(`/companies/${COMPANY}/records/invoice/${invoice.id}/attachments`).set('Authorization', adminAuth);
  assert.equal(attachments.status, 403);
});

test('the management report leaves out switched-off modules', () => {
  const { store } = build();
  setModulesOff(store, ['inventory', 'purchasing']);
  const summary = store.getManagementReportSummary(COMPANY);
  assert.deepEqual(summary.inventory, { totalItems: 0, stockValue: 0, lowStockCount: 0, outOfStockCount: 0 });
  assert.deepEqual(summary.lowStockItems, []);
  assert.equal(summary.purchases.openOrders, 0);
  assert.deepEqual(summary.topSuppliers, []);
});

test('every switchable module sits in exactly one area, and presets name only switchable modules', async () => {
  const { app, adminAuth } = build();
  const { modules, alwaysOnModules, featureModules, moduleAreas, modulePresets } =
    (await request(app).get('/permissions/catalogue').set('Authorization', adminAuth)).body;
  const switchable = [...modules.map((m) => m.key).filter((k) => !alwaysOnModules.includes(k)), ...featureModules].sort();
  assert.deepEqual(moduleAreas.flatMap((a) => a.modules).sort(), switchable);
  assert.deepEqual(featureModules.sort(), ['academy', 'flexi', 'followups', 'inbox', 'influencers']);
  assert.deepEqual(modulePresets.map((p) => p.key), ['everything', 'factory', 'agency', 'trading', 'services']);
  for (const preset of modulePresets) {
    assert.ok(preset.disabledModules.every((k) => switchable.includes(k)), `${preset.key} names real modules`);
  }
});

test('features without permissions of their own are refused by path, record routes included', async () => {
  const ctx = build();
  const { app, store, adminAuth, superAuth } = ctx;
  const get = (url) => request(app).get(url).set('Authorization', adminAuth);
  const contact = store.createContact({ companyId: COMPANY, kind: 'Organization', name: 'Al Noor', roles: ['Client'] });
  const followup = await request(app).post(`/companies/${COMPANY}/followups`).set('Authorization', adminAuth)
    .send({ entityId: contact.id, title: 'Call back', dueAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(followup.status, 201, followup.text);

  const urls = {
    inbox: `/companies/${COMPANY}/inbox`,
    teamChats: `/companies/${COMPANY}/team-chats`,
    followups: `/companies/${COMPANY}/followups`,
    portalUsers: `/companies/${COMPANY}/portal-users`,
    flexi: `/companies/${COMPANY}/flexi/overview`,
  };
  for (const [name, url] of Object.entries(urls)) {
    assert.equal((await get(url)).status, 200, `${name} is on to begin with`);
  }

  const created = await request(app).post('/companies').set('Authorization', superAuth)
    .send({ name: 'Plain Factory', disabledModules: ['inbox', 'followups', 'influencers', 'flexi'] });
  assert.equal(created.status, 201, created.text);
  assert.deepEqual(created.body.disabledModules, ['flexi', 'followups', 'inbox', 'influencers']);

  assert.equal((await switchOff(ctx, ['flexi', 'followups', 'inbox', 'influencers'])).status, 200);
  for (const [name, url] of Object.entries(urls)) {
    const res = await get(url);
    assert.equal(res.status, 403, `${name} is refused`);
    assert.equal(res.body.code, 'MODULE_OFF');
  }
  const refused = await get(urls.followups);
  assert.equal(refused.body.module, 'followups');
  assert.match(refused.body.message, /^Follow-ups is turned off for this company\.$/);
  const record = await request(app).post(`/followups/${followup.body.id}/done`).set('Authorization', adminAuth).send({});
  assert.equal(record.status, 403, 'a record route finds its company and is refused too');
  assert.equal((await get(`/companies/${COMPANY}/contacts`)).status, 200, 'the rest of the company is untouched');

  assert.equal((await switchOff(ctx, [])).status, 200);
  for (const [name, url] of Object.entries(urls)) {
    assert.equal((await get(url)).status, 200, `${name} is back on`);
  }
});
