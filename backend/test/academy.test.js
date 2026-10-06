const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * TaskFlow Academy: every trainee practises in their own practice company,
 * which never leaks into real companies, lists, totals or email; missions are
 * checked on that company's data; unfinished missions lock modules in real
 * companies (with grace, exemptions and a super-admin bypass).
 */

const quiet = { info() {}, warn() {}, error() {} };

function setup({ enforce = true } = {}) {
  const dbPath = path.join(makeTmpDir('taskflow-academy-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy', logger: quiet, academyEnforce: enforce }).listen(0);
  app.unref();
  const as = (user) => (req) => req.set('Authorization', `Bearer ${store.issueToken(user.id)}`);
  const newUser = (role, email) => store.createUser({ name: email.split('@')[0], email, password: 'Password1!', role, companyIds: ['1'], companyRoles: [{ companyId: '1', role }] });
  const root = store.createUser({ name: 'Root', email: 'root@x.example', password: 'Password1!', role: 'Admin', companyIds: [], companyRoles: [], isSuperAdmin: true });
  return { app, store, as, newUser, root };
}

const start = async (ctx, user) => {
  const res = await ctx.as(user)(request(ctx.app).post('/academy/start')).send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

test('a practice company is created once, belongs to its trainee alone, and opens with capital in the bank', async () => {
  const ctx = setup();
  const sara = ctx.newUser('Accountant', 'sara@x.example');
  const first = await start(ctx, sara);
  const again = await start(ctx, sara);
  assert.ok(first.practiceCompanyId);
  assert.equal(again.practiceCompanyId, first.practiceCompanyId, 'idempotent');
  const company = ctx.store.getCompanyById(first.practiceCompanyId);
  assert.deepEqual([company.isTraining, company.trainingOwnerUserId], [true, sara.id]);
  const roles = ctx.store.getUserById(sara.id).companyRoles;
  assert.deepEqual(roles.find((r) => r.companyId === company.id).role, 'Admin');
  const impact = (await ctx.as(sara)(request(ctx.app).get('/academy/impact'))).body;
  assert.deepEqual([impact.cash, impact.profit, impact.balanced], [20000, 0, true]);
});

test('a practice company never shows to anyone else, never counts, never emails, and nobody can be added to it', async () => {
  const ctx = setup();
  const sara = ctx.newUser('Admin', 'sara@x.example');
  const omar = ctx.newUser('Admin', 'omar@x.example');
  const { practiceCompanyId } = await start(ctx, sara);
  const listFor = async (u) => (await ctx.as(u)(request(ctx.app).get('/companies'))).body.map((c) => c.id);
  assert.ok((await listFor(sara)).includes(practiceCompanyId));
  assert.equal((await listFor(omar)).includes(practiceCompanyId), false);
  assert.equal((await listFor(ctx.root)).includes(practiceCompanyId), false, 'not even the super admin');
  const realCompanies = ctx.store.listCompanies().filter((c) => !c.isTraining).length;
  assert.equal(ctx.store.getAdminOverview().companies, realCompanies);

  const before = ctx.store.getAdminOverview().invoices;
  const hotel = ctx.store.createClient({ name: 'Al Noor Hotel', email: 'hotel@x.example', address: 'Muscat', companyId: practiceCompanyId });
  ctx.store.createInvoice({ invoiceNumber: 'P-1', companyId: practiceCompanyId, clientId: hotel.id, issueDate: new Date(), dueDate: new Date(Date.now() - 86400000), status: 'Sent', lineItems: [{ itemType: 'Manual', description: 'x', quantity: 1, unitPrice: 50, amount: 50 }] });
  assert.equal(ctx.store.getAdminOverview().invoices, before, 'practice invoices are not counted');

  ctx.store.notify({ companyId: practiceCompanyId, userIds: [sara.id], type: 'invoice_overdue', title: 'Overdue in practice' });
  ctx.store.notify({ companyId: practiceCompanyId, userIds: [sara.id], type: 'followup_assigned', title: 'Normal in practice' });
  const pending = ctx.store.listPendingDigestNotifications().filter((n) => n.companyId === practiceCompanyId);
  assert.equal(pending.length, 0, 'nothing waits to be emailed');
  assert.ok(ctx.store.listNotifications(sara.id).some((n) => n.title === 'Overdue in practice'), 'still shown in the app');

  const added = await ctx.as(ctx.root)(request(ctx.app).post('/users')).send({ name: 'Intruder', email: 'in@x.example', password: 'Password1!', companyIds: [practiceCompanyId], companyRoles: [{ companyId: practiceCompanyId, role: 'Employee' }] });
  assert.equal(added.status, 400);
  const moved = await ctx.as(ctx.root)(request(ctx.app).put(`/users/${omar.id}`)).send({ companyRoles: [{ companyId: '1', role: 'Admin' }, { companyId: practiceCompanyId, role: 'Admin' }] });
  assert.equal(moved.status, 400);
});

test('objectives count only what the trainee did in the practice company, after it was created', async () => {
  const ctx = setup({ enforce: false });
  const sara = ctx.newUser('Employee', 'sara@x.example');
  const { practiceCompanyId } = await start(ctx, sara);
  const objective = async (missionId, id) => (await ctx.as(sara)(request(ctx.app).get('/academy/me'))).body.missions.find((m) => m.id === missionId)?.objectives.find((o) => o.id === id)?.done;

  ctx.store.createProject({ name: 'Real work', description: '', color: '#000', companyId: '1', visibility: 'Public', memberIds: [sara.id] });
  assert.equal(await objective('get-work-done', 'project'), false, 'a real-company project does not count');
  const res = await ctx.as(sara)(request(ctx.app).post('/projects')).send({ name: 'Warehouse tidy', description: '', color: '#10b981', companyId: practiceCompanyId, visibility: 'Public', memberIds: [sara.id] });
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  assert.equal(await objective('get-work-done', 'project'), true);
  // Seeded defaults never count: an admin's fresh practice company has run-company still to do.
  const admin = ctx.newUser('Admin', 'admin2@x.example');
  await start(ctx, admin);
  const run = (await ctx.as(admin)(request(ctx.app).get('/academy/me'))).body.missions.find((m) => m.id === 'run-company');
  assert.deepEqual(run.objectives.map((o) => o.done), [false, false, false]);
});

test('first-day steps are reported by the browser; a mission completes once and its XP counts once', async () => {
  const ctx = setup({ enforce: false });
  const sara = ctx.newUser('Employee', 'sara@x.example');
  await start(ctx, sara);
  const report = (o) => ctx.as(sara)(request(ctx.app).post(`/academy/objectives/first-day/${o}`)).send({});
  assert.equal((await ctx.as(sara)(request(ctx.app).post('/academy/objectives/get-work-done/project')).send({})).status, 400, 'checked steps cannot be reported');
  await report('open-dashboard');
  await report('open-notifications');
  const done = (await report('switch-language')).body;
  assert.equal(done.missions.find((m) => m.id === 'first-day').status, 'done');
  assert.equal(done.xp, 50);
  const again = (await report('switch-language')).body;
  assert.equal(again.xp, 50, 'once');
  assert.deepEqual(done.missions.map((m) => m.id), ['first-day', 'get-work-done', 'win-customer'], 'an employee path');
});

test('unfinished missions lock modules in real companies, not in practice; grace, exemptions and super admins open them', async () => {
  const ctx = setup({ enforce: true });
  const nora = ctx.newUser('Manager', 'nora@x.example');
  const crm = (u, companyId = '1') => ctx.as(u)(request(ctx.app).get(`/companies/${companyId}/opportunities`));
  const locked = await crm(nora);
  assert.equal(locked.status, 403);
  assert.deepEqual([locked.body.code, locked.body.module, locked.body.missionId], ['ACADEMY_LOCKED', 'crm', 'win-customer']);

  const { practiceCompanyId } = await start(ctx, nora);
  assert.equal((await crm(nora, practiceCompanyId)).status, 200, 'practice is never locked');

  ctx.store.academy.complete(nora.id, 'win-customer', 100);
  assert.equal((await crm(nora)).status, 200, 'unlocked by its mission');
  const invoices = () => ctx.as(nora)(request(ctx.app).get('/companies/1/invoices'));
  assert.equal((await invoices()).status, 403, 'other modules stay locked');
  assert.equal((await ctx.as(nora)(request(ctx.app).get('/companies/1/expenses'))).status, 200, 'finance is not on a manager’s path');

  assert.equal((await ctx.as(ctx.root)(request(ctx.app).post('/academy/exemptions')).send({ userId: nora.id, module: 'invoices', reason: 'Joined from our auditor' })).status, 201);
  assert.equal((await invoices()).status, 200, 'exempt from one module');
  assert.equal((await ctx.as(nora)(request(ctx.app).post('/academy/exemptions')).send({ userId: nora.id, module: '*', reason: 'self' })).status, 403, 'only the super admin exempts');

  const old = ctx.newUser('Manager', 'old@x.example');
  ctx.store.academy.setPractice(old.id, null, {});
  ctx.store.db.prepare('UPDATE academy_state SET graceUntil = ? WHERE userId = ?').run(new Date(Date.now() + 86400000).toISOString(), old.id);
  assert.equal((await crm(old)).status, 200, 'grace keeps everything open');
  ctx.store.db.prepare('UPDATE academy_state SET graceUntil = ? WHERE userId = ?').run(new Date(Date.now() - 1000).toISOString(), old.id);
  assert.equal((await crm(old)).status, 403, 'and ends');
});

test('the impact panel follows the books: an expense moves cash, expenses and profit by its amount', async () => {
  const ctx = setup({ enforce: false });
  const sara = ctx.newUser('Accountant', 'sara@x.example');
  const { practiceCompanyId } = await start(ctx, sara);
  const impact = async () => (await ctx.as(sara)(request(ctx.app).get('/academy/impact'))).body;
  const before = await impact();
  const res = await ctx.as(sara)(request(ctx.app).post(`/companies/${practiceCompanyId}/expenses`)).send({ category: 'Fuel', amount: 75 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const after = await impact();
  assert.deepEqual([after.cash - before.cash, after.expenses - before.expenses, after.profit - before.profit], [-75, 75, -75]);
  const statements = (await ctx.as(sara)(request(ctx.app).get('/academy/statements'))).body;
  assert.equal(statements.balanceSheet.totalAssets, statements.balanceSheet.totalLiabilitiesAndEquity, 'the mini balance sheet balances');
});

test('reset gives a fresh practice company and keeps finished missions', async () => {
  const ctx = setup({ enforce: false });
  const sara = ctx.newUser('Employee', 'sara@x.example');
  const { practiceCompanyId } = await start(ctx, sara);
  ctx.store.academy.complete(sara.id, 'first-day', 50);
  const res = await ctx.as(sara)(request(ctx.app).post('/academy/reset')).send({});
  assert.equal(res.status, 200);
  assert.notEqual(res.body.practiceCompanyId, practiceCompanyId);
  assert.equal(ctx.store.getCompanyById(practiceCompanyId), undefined);
  assert.equal(res.body.missions.find((m) => m.id === 'first-day').status, 'done');
  assert.equal(ctx.store.getUserById(sara.id).companyRoles.some((r) => r.companyId === practiceCompanyId), false);
});
