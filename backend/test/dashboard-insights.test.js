const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { dashboardInsights } = require('../dist/dashboard/insights');
const { makeTmpDir } = require('./helpers/tmp');

/** The dashboard's period figures: each against the window before, from records already kept. */

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY);
const ahead = (d) => new Date(Date.now() + d * DAY);

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-insights-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const mk = (role, email) => store.createUser({ name: `${role} ${email}`, email, password: 'Password1!', role, companyIds: ['1'], companyRoles: [{ companyId: '1', role }] });
  return { app, store, mk };
}

const invoice = (store, client, total, issued, due, status = 'Sent') => store.createInvoice({
  companyId: '1', clientId: client.id, contactId: client.id, status, total, issueDate: issued, dueDate: due,
  lineItems: [{ description: 'Work', quantity: 1, unitPrice: total, amount: total, itemType: 'Manual' }],
});
const kpi = (out, id) => out.kpis.find((k) => k.id === id);

test('money: billed, collected and net cash for the window against the one before, with a forecast', () => {
  const { store } = setup();
  const base = dashboardInsights(store, '1', { userId: 'x', variant: 'Accountant' }, 30);
  const org = (name) => store.createContact({ companyId: '1', kind: 'Organization', name, roles: ['Client'] });
  const hotel = org('Insight Hotel');
  const cafe = org('Insight Cafe');

  const recent = invoice(store, hotel, 1000, ago(5), ahead(10));
  invoice(store, cafe, 300, ago(10), ago(2)); // overdue, unpaid
  const older = invoice(store, hotel, 400, ago(45), ago(20));
  invoice(store, hotel, 9999, ago(3), ahead(5), 'Draft'); // a draft is not billed
  store.createPayment({ invoiceId: recent.id, amount: 600, paidAt: ago(1) });
  store.createPayment({ invoiceId: older.id, amount: 400, paidAt: ago(40) });
  store.createExpense({ companyId: '1', category: 'Fuel', amount: 50, expenseDate: ago(3) });

  const out = dashboardInsights(store, '1', { userId: 'x', variant: 'Accountant' }, 30);
  assert.equal(kpi(out, 'revenue').value - kpi(base, 'revenue').value, 1300, 'the two issued this window, not the draft');
  assert.equal(kpi(out, 'revenue').previous - kpi(base, 'revenue').previous, 400);
  assert.equal(kpi(out, 'collected').value - kpi(base, 'collected').value, 600);
  assert.equal(kpi(out, 'collected').previous - kpi(base, 'collected').previous, 400);
  assert.equal(kpi(out, 'net-cash').value - kpi(base, 'net-cash').value, 550, 'collected less the expense');
  assert.equal(kpi(out, 'receivables').value - kpi(base, 'receivables').value, 700);
  assert.equal(kpi(out, 'revenue').spark.length, 6);
  assert.equal(out.cashflow.length, 6);

  assert.equal(out.forecast.weeks.length, 4);
  const incoming = out.forecast.weeks.reduce((n, w) => n + w.incoming, 0) - base.forecast.weeks.reduce((n, w) => n + w.incoming, 0);
  assert.equal(incoming, 400, 'the open 400 due in 10 days lands in the next 30 days');
  assert.equal(out.forecast.weeks[1].incoming - base.forecast.weeks[1].incoming, 400, 'in the second week');
  assert.equal(out.forecast.overdueIncoming - base.forecast.overdueIncoming, 300, 'the late 300 is shown apart');

  const top = out.topClients.find((c) => c.clientId === hotel.id);
  assert.equal(top.billed, 1000);
  assert.equal(top.name, 'Insight Hotel');
  assert.ok(!out.pipeline && !out.team, 'an accountant sees the money only');

  const year = dashboardInsights(store, '1', { userId: 'x', variant: 'Accountant' }, 365);
  assert.equal(year.cashflow.length, 12);
});

test('work and sales: won deals, win rate, pipeline, stale deals, tasks done on time, team load', () => {
  const { store, mk } = setup();
  const sara = mk('Employee', 'sara.insights@x.example');
  const client = store.createContact({ companyId: '1', kind: 'Organization', name: 'Deal Co', roles: ['Client'] });
  const base = dashboardInsights(store, '1', { userId: 'x', variant: 'Manager' }, 30);
  const deal = (stage, value) => store.createOpportunity({ companyId: '1', contactId: client.id, title: `D ${stage} ${value}`, serviceType: 'Influencer campaign', stage: 'New', expectedRevenue: value, probability: 50 });
  store.updateOpportunityStage(deal('Won', 800).id, 'Won');
  store.updateOpportunityStage(deal('Lost', 200).id, 'Lost');
  store.updateOpportunityStage(deal('Proposal', 500).id, 'Proposal');

  const project = store.createProject({ name: 'Insights', description: '', color: '#fff', companyId: '1', visibility: 'Public' });
  const task = (title, due, extra = {}) => store.createTask({ title, description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: '1', projectId: project.id, assignedUserIds: [sara.id], dueDate: due, ...extra });
  const onTime = task('On time', ahead(2));
  const late = task('Late', ago(3));
  task('Still open and late', ago(1));
  store.updateTask(onTime.id, { status: 'Done' });
  store.updateTask(late.id, { status: 'Done' });

  const out = dashboardInsights(store, '1', { userId: 'x', variant: 'Manager' }, 30);
  assert.equal(kpi(out, 'won-deals').value - kpi(base, 'won-deals').value, 800);
  assert.equal(typeof kpi(out, 'won-deals').sub.value, 'number');
  const proposal = (o) => o.pipeline.find((p) => p.stage === 'Proposal');
  assert.equal(proposal(out).count - proposal(base).count, 1);
  assert.equal(proposal(out).value - proposal(base).value, 500);
  assert.equal(proposal(out).weighted - proposal(base).weighted, 250);

  assert.equal(kpi(out, 'tasks-done').value - kpi(base, 'tasks-done').value, 2);
  const mine = dashboardInsights(store, '1', { userId: sara.id, variant: 'Employee' }, 30);
  assert.equal(kpi(mine, 'tasks-done').value, 2, 'her own two');
  assert.equal(kpi(mine, 'on-time').value, 50, 'one of two by its due date');
  assert.ok(!mine.team && !mine.cashflow && !mine.pipeline, 'an employee sees their own tasks only');
  assert.equal(mine.throughput.length, 8);
  assert.equal(mine.throughput.at(-1).completed, 2);

  const load = out.team.find((r) => r.userId === sara.id);
  assert.deepEqual({ open: load.open, overdue: load.overdue }, { open: 1, overdue: 1 });
  assert.ok(!out.cashflow, 'a manager does not see the money');
});

test('a switched-off module drops its figures', () => {
  const { store } = setup();
  store.updateCompany('1', { disabledModules: ['crm', 'invoices'] });
  const out = dashboardInsights(store, '1', { userId: 'x', variant: 'Admin' }, 30);
  assert.ok(!out.pipeline && !out.cashflow);
  assert.ok(!out.kpis.some((k) => k.id === 'revenue' || k.id === 'won-deals'));
  assert.ok(out.kpis.some((k) => k.id === 'tasks-done'));
});

test('the route follows the dashboard variant and checks the period', async () => {
  const { app, store, mk } = setup();
  const acc = mk('Accountant', 'acc.insights@x.example');
  const emp = mk('Employee', 'emp.insights@x.example');
  const get = (u, q = '') => request(app).get(`/companies/1/dashboard/insights${q}`).set('Authorization', `Bearer ${store.issueToken(u.id)}`);

  const forAcc = await get(acc, '?days=90');
  assert.equal(forAcc.status, 200);
  assert.equal(forAcc.body.days, 90);
  assert.ok(forAcc.body.cashflow && !forAcc.body.team);
  const forEmp = await get(emp);
  assert.equal(forEmp.status, 200);
  assert.equal(forEmp.body.days, 30);
  assert.ok(!forEmp.body.cashflow && forEmp.body.throughput);
  assert.equal((await get(acc, '?days=7')).status, 400);
  assert.equal((await request(app).get('/companies/1/dashboard/insights')).status, 401);
});

test('a finished task keeps its finishing time through later edits, and a task finished part by part counts', async () => {
  const { store, mk } = setup();
  const a = mk('Employee', 'a.done@x.example');
  const b = mk('Employee', 'b.done@x.example');
  const project = store.createProject({ name: 'Done P', description: '', color: '#fff', companyId: '1', visibility: 'Public' });
  const t = store.createTask({ title: 'Edit me', description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: '1', projectId: project.id, assignedUserIds: [a.id] });
  store.updateTask(t.id, { status: 'Done' });
  const first = store.taskCompletionTimes('1').get(t.id).getTime();
  await new Promise((r) => setTimeout(r, 15));
  store.updateTask(t.id, { title: 'Renamed later' });
  assert.equal(store.taskCompletionTimes('1').get(t.id).getTime(), first, 'a rename is not a second finish');
  // Reopened and finished again: the new finish counts.
  await new Promise((r) => setTimeout(r, 15));
  store.updateTask(t.id, { status: 'In Progress' });
  store.updateTask(t.id, { status: 'Done' });
  assert.ok(store.taskCompletionTimes('1').get(t.id).getTime() > first);

  const shared = store.createTask({ title: 'Shared', description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: '1', projectId: project.id, assignedUserIds: [a.id, b.id] });
  store.setTaskPart(shared.id, a.id, { status: 'Done' });
  assert.ok(!store.taskCompletionTimes('1').has(shared.id), 'one part done is not the task done');
  store.setTaskPart(shared.id, b.id, { status: 'Done' });
  assert.ok(store.taskCompletionTimes('1').has(shared.id), 'the last part finishes the task');
});

test('on time is empty, not 0%, when nothing dated was finished; due today is not overdue; private tasks stay out of team load', () => {
  const { store, mk } = setup();
  const sara = mk('Employee', 'sara.edge@x.example');
  const mine = dashboardInsights(store, '1', { userId: sara.id, variant: 'Employee' }, 30);
  assert.equal(kpi(mine, 'on-time').value, null);

  const c = store.createContact({ companyId: '1', kind: 'Organization', name: 'Today Co', roles: ['Client'] });
  const base = dashboardInsights(store, '1', { userId: 'x', variant: 'Accountant' }, 30);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  invoice(store, c, 250, ago(3), today);
  const out = dashboardInsights(store, '1', { userId: 'x', variant: 'Accountant' }, 30);
  assert.equal(out.forecast.overdueIncoming - base.forecast.overdueIncoming, 0, 'due today is not late');
  assert.equal(out.forecast.weeks[0].incoming - base.forecast.weeks[0].incoming, 250, 'it is in this week');
  assert.equal(out.forecast.weeks[0].from, today.toISOString().slice(0, 10), 'the first week starts today');

  const project = store.createProject({ name: 'Priv', description: '', color: '#fff', companyId: '1', visibility: 'Public' });
  store.createTask({ title: 'Private', description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: '1', projectId: project.id, assignedUserIds: [sara.id], isPrivate: true, ownerId: sara.id });
  const team = dashboardInsights(store, '1', { userId: 'x', variant: 'Manager' }, 30).team;
  assert.ok(!team.some((r) => r.userId === sara.id), 'a private task is not counted for others');
});
