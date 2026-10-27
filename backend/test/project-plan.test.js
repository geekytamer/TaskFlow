const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const DAY = 24 * 60 * 60 * 1000;

/** Seed: admin (Admin 1-3), user-2 Manager of 1, user-3/user-5 Employees of 1, user-4 Manager of 2 only. */
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-plan-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (id) => {
    const auth = `Bearer ${store.issueToken(id)}`;
    return {
      get: (url) => request(app).get(url).set('Authorization', auth),
      post: (url, body) => request(app).post(url).set('Authorization', auth).send(body ?? {}),
      put: (url, body) => request(app).put(url).set('Authorization', auth).send(body ?? {}),
      patch: (url, body) => request(app).patch(url).set('Authorization', auth).send(body ?? {}),
      del: (url) => request(app).delete(url).set('Authorization', auth),
    };
  };
  const newProject = async (extra = {}) => {
    const res = await as(admin.id).post('/projects', { name: 'Ramadan campaign', companyId: '1', visibility: 'Public', memberIds: ['user-3'], ...extra });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };
  const newTask = async (projectId, extra = {}) => {
    const res = await as(admin.id).post('/tasks', { title: 'Shoot', projectId, companyId: '1', priority: 'Medium', assignedUserIds: ['user-3'], ...extra });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };
  return { store, admin, as, newProject, newTask };
}

test('a project has a status, start and end dates and a budget; the end can not come before the start', async () => {
  const { admin, as, newProject } = setup();
  const start = new Date(Date.now() + DAY).toISOString();
  const end = new Date(Date.now() + 10 * DAY).toISOString();
  const p = await newProject({ status: 'Planning', startDate: start, endDate: end, budget: 5000 });
  assert.deepEqual([p.status, p.startDate, p.endDate, p.budget], ['Planning', start, end, 5000]);
  const listed = (await as(admin.id).get('/projects')).body.find((x) => x.id === p.id);
  assert.equal(listed.status, 'Planning');
  assert.equal(listed.budgetAlertLevel, undefined, 'internal alert state stays inside');

  assert.equal((await as(admin.id).put(`/projects/${p.id}`, { endDate: new Date(Date.now() - DAY).toISOString() })).status, 400);
  assert.equal((await as(admin.id).put(`/projects/${p.id}`, { status: 'Paused' })).status, 400);
  assert.equal((await as(admin.id).put(`/projects/${p.id}`, { budget: -1 })).status, 400);
  const cleared = (await as(admin.id).put(`/projects/${p.id}`, { status: 'Active', budget: null, endDate: null })).body;
  assert.deepEqual([cleared.status, cleared.budget, cleared.endDate], ['Active', null, null]);
  // An older project with none of this reads as Active.
  assert.equal((await newProject({ name: 'Plain' })).status, 'Active');
});

test('stages: managers add them, tasks join one, progress counts per stage; employees only read', async () => {
  const { as, admin, newProject, newTask } = setup();
  const p = await newProject();
  const prep = await as(admin.id).post(`/projects/${p.id}/milestones`, { name: 'Preparation', dueDate: new Date(Date.now() + 3 * DAY).toISOString() });
  assert.equal(prep.status, 201, JSON.stringify(prep.body));
  assert.equal((await as('user-3').post(`/projects/${p.id}/milestones`, { name: 'Mine' })).status, 403, 'an employee can not add stages');
  assert.equal((await as(admin.id).post(`/projects/${p.id}/milestones`, { name: '  ' })).status, 400);

  const a = await newTask(p.id, { milestoneId: prep.body.id });
  await newTask(p.id, { title: 'Edit', milestoneId: prep.body.id });
  await as(admin.id).put(`/tasks/${a.id}`, { status: 'Done' });

  const stages = (await as('user-3').get(`/projects/${p.id}/milestones`)).body;
  assert.deepEqual(stages.map((s) => [s.name, s.done, s.total]), [['Preparation', 1, 2]]);

  // A stage from another project is refused.
  const other = await newProject({ name: 'Other' });
  const foreign = (await as(admin.id).post(`/projects/${other.id}/milestones`, { name: 'Elsewhere' })).body;
  assert.equal((await as(admin.id).post('/tasks', { title: 'X1', projectId: p.id, companyId: '1', priority: 'Low', milestoneId: foreign.id })).status, 400);
  // Moving a task to another project lets go of its stage.
  const moved = (await as(admin.id).put(`/tasks/${a.id}`, { projectId: other.id })).body;
  assert.equal(moved.milestoneId, undefined);

  // Removing a stage keeps its tasks.
  assert.equal((await as(admin.id).del(`/projects/${p.id}/milestones/${prep.body.id}`)).status, 200);
  assert.equal((await as(admin.id).get('/tasks')).body.filter((t) => t.projectId === p.id).length, 1);
  assert.equal((await as(admin.id).get(`/projects/${p.id}/milestones`)).body.length, 0);
});

test('summary: progress and lateness for everyone who sees the project; budget only for those who see money', async () => {
  const { store, as, admin, newProject, newTask } = setup();
  const p = await newProject({ budget: 1000, endDate: new Date(Date.now() - 2 * DAY).toISOString(), startDate: new Date(Date.now() - 9 * DAY).toISOString() });
  const t = await newTask(p.id);
  await newTask(p.id, { title: 'Two' });
  await as(admin.id).put(`/tasks/${t.id}`, { status: 'Done' });
  store.db.prepare('UPDATE users SET costRatePerHour = 100 WHERE id = ?').run('user-3');
  store.createTimeEntry({ companyId: '1', taskId: t.id, userId: 'user-3', minutes: 300 });
  store.createExpense({ companyId: '1', category: 'Equipment', amount: 400, projectId: p.id });

  const mgr = (await as('user-2').get(`/projects/${p.id}/summary`)).body;
  assert.deepEqual(mgr.progress, { done: 1, total: 2, pct: 50 });
  assert.equal(mgr.late, true);
  assert.deepEqual([mgr.budget.labor, mgr.budget.expenses, mgr.budget.total, mgr.budget.pct], [500, 400, 900, 90]);

  const emp = (await as('user-3').get(`/projects/${p.id}/summary`)).body;
  assert.equal(emp.budget, null, 'an employee sees progress, not money');
  assert.equal((await as('user-4').get(`/projects/${p.id}/summary`)).status, 403, 'another company');
});

test('budget alerts: once at 80%, once over, to admins and managers; a new budget starts fresh', async () => {
  const { store, newProject, newTask } = setup();
  const p = await newProject({ budget: 1000 });
  const t = await newTask(p.id);
  const alerts = () => store.db.prepare("SELECT userId, title FROM notifications WHERE type = 'project_budget'").all();
  store.createExpense({ companyId: '1', category: 'Equipment', amount: 700, projectId: p.id });
  store.sweepProjectBudgetAlerts();
  assert.equal(alerts().length, 0, '70% is fine');
  store.createExpense({ companyId: '1', category: 'Equipment', amount: 150, projectId: p.id });
  store.sweepProjectBudgetAlerts();
  const at80 = alerts();
  // Days later (the short notification dedupe long gone): still no repeat.
  store.db.prepare("UPDATE notifications SET type = 'seen_budget' WHERE type = 'project_budget'").run();
  store.sweepProjectBudgetAlerts();
  assert.equal(alerts().length, 0, 'no repeat of the 80% alert');
  store.db.prepare("UPDATE notifications SET type = 'project_budget' WHERE type = 'seen_budget'").run();
  assert.ok(at80.length >= 2, 'admins and the manager');
  assert.ok(at80.every((a) => /85%/.test(a.title)));
  assert.ok(!at80.some((a) => a.userId === 'user-3'), 'not employees');
  store.createExpense({ companyId: '1', category: 'Equipment', amount: 200, projectId: p.id });
  store.sweepProjectBudgetAlerts();
  assert.equal(alerts().filter((a) => /Over budget/.test(a.title)).length, at80.length);
  store.updateProject(p.id, { budget: 5000 });
  store.sweepProjectBudgetAlerts();
  assert.equal(alerts().length, at80.length * 2, 'a bigger budget: no new alert');
  assert.ok(t.id);
});

test('templates: save a project with its stages, tasks, steps and people, then start a new one on another date', async () => {
  const { store, as, admin, newProject, newTask } = setup();
  const start = new Date(2026, 9, 1, 9);
  const p = await newProject({ startDate: start.toISOString(), endDate: new Date(2026, 9, 11, 9).toISOString(), budget: 3000 });
  const stage = (await as(admin.id).post(`/projects/${p.id}/milestones`, { name: 'Filming', dueDate: new Date(2026, 9, 5, 9).toISOString() })).body;
  const t = await newTask(p.id, {
    title: 'Film the ad', assignedUserIds: ['user-3', 'user-5'], milestoneId: stage.id,
    startDate: new Date(2026, 9, 3, 9).toISOString(), dueDate: new Date(2026, 9, 5, 9).toISOString(),
  });
  await as(admin.id).post(`/tasks/${t.id}/checklist`, { text: 'Book the studio' });
  await as(admin.id).patch(`/tasks/${t.id}/parts/user-3`, { label: 'Camera' });

  assert.equal((await as('user-3').post(`/projects/${p.id}/template`, { name: 'Ad shoot' })).status, 403);
  const saved = await as(admin.id).post(`/projects/${p.id}/template`, { name: 'Ad shoot' });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const list = (await as('user-2').get('/companies/1/project-templates')).body;
  assert.deepEqual(list.map((x) => [x.name, x.tasks, x.milestones, x.lengthDays]), [['Ad shoot', 1, 1, 10]]);
  assert.equal((await as('user-4').get('/companies/1/project-templates')).status, 403);

  const newStart = new Date(2026, 10, 10, 9);
  const made = await as('user-2').post(`/project-templates/${saved.body.id}/projects`, { name: 'Eid ad', startDate: newStart.toISOString() });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.status, 'Planning');
  assert.equal(new Date(made.body.endDate).getDate(), 20);
  assert.equal(made.body.budget, 3000);
  const stages = store.projectPlan.milestones(made.body.id);
  assert.deepEqual(stages.map((s) => [s.name, new Date(s.dueDate).getDate()]), [['Filming', 14]]);
  const [copy] = store.listTasks().filter((x) => x.projectId === made.body.id);
  assert.equal(copy.title, 'Film the ad');
  assert.equal(copy.status, 'To Do');
  assert.equal(copy.milestoneId, stages[0].id);
  assert.deepEqual([copy.startDate.getDate(), copy.dueDate.getDate()], [12, 14]);
  assert.deepEqual(copy.parts.map((x) => [x.userId, x.label ?? null]), [['user-3', 'Camera'], ['user-5', null]]);
  assert.deepEqual(store.taskChecklist.forTask(copy.id).map((i) => [i.text, i.done]), [['Book the studio', false]]);

  // A task due before the project's official start keeps its place before it, never in the past.
  const early = await newProject({ name: 'Early', startDate: new Date(2026, 9, 10, 9).toISOString(), endDate: new Date(2026, 9, 15, 9).toISOString() });
  await newTask(early.id, { title: 'Brief', dueDate: new Date(2026, 9, 7, 9).toISOString() });
  const earlyTpl = (await as(admin.id).post(`/projects/${early.id}/template`, { name: 'Early' })).body;
  const fresh = (await as(admin.id).post(`/project-templates/${earlyTpl.id}/projects`, { name: 'Fresh', startDate: new Date(2026, 11, 1, 9).toISOString() })).body;
  const brief = store.listTasks().find((x) => x.projectId === fresh.id);
  assert.deepEqual([brief.dueDate.getMonth(), brief.dueDate.getDate()], [11, 1], 'the brief lands on the first day');
  assert.deepEqual([new Date(fresh.startDate).getDate(), new Date(fresh.endDate).getDate()], [4, 9], 'the project keeps its 3-day lead and its length');

  assert.equal((await as(admin.id).del(`/project-templates/${saved.body.id}`)).status, 200);
  assert.deepEqual((await as(admin.id).get('/companies/1/project-templates')).body.map((x) => x.name), ['Early']);
});

test('priority and archive: a project has a priority; an archived project stops reminding', async () => {
  const { store, as, admin, newProject, newTask } = setup();
  const p = await newProject({ priority: 'Urgent' });
  assert.equal(p.priority, 'Urgent');
  assert.equal((await newProject({ name: 'Default' })).priority, 'Medium');
  assert.equal((await as(admin.id).put(`/projects/${p.id}`, { priority: 'Someday' })).status, 400);

  const late = await newTask(p.id, { dueDate: new Date(Date.now() - DAY).toISOString() });
  const reminders = () => store.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'task_due' AND entityId = ?").get(late.id).n;
  store.sweepTaskDueReminders();
  assert.ok(reminders() > 0, 'an open overdue task reminds');
  store.db.prepare("DELETE FROM notifications WHERE type = 'task_due'").run();
  assert.equal((await as(admin.id).put(`/projects/${p.id}`, { status: 'Archived' })).body.status, 'Archived');
  store.sweepTaskDueReminders();
  assert.equal(reminders(), 0, 'archived: quiet');
});

test('postpone: the project, its stages and its unfinished tasks move together; finished work stays; people hear', async () => {
  const { store, as, admin, newProject, newTask } = setup();
  const p = await newProject({ startDate: new Date(2026, 10, 1, 9).toISOString(), endDate: new Date(2026, 10, 20, 9).toISOString(), status: 'Active' });
  const stage = (await as(admin.id).post(`/projects/${p.id}/milestones`, { name: 'Filming', dueDate: new Date(2026, 10, 10, 9).toISOString() })).body;
  const open = await newTask(p.id, { startDate: new Date(2026, 10, 3, 9).toISOString(), dueDate: new Date(2026, 10, 5, 9).toISOString() });
  const done = await newTask(p.id, { title: 'Brief', dueDate: new Date(2026, 10, 2, 9).toISOString() });
  await as(admin.id).put(`/tasks/${done.id}`, { status: 'Done' });

  assert.equal((await as('user-3').post(`/projects/${p.id}/postpone`, { startDate: new Date(2026, 11, 1, 9).toISOString() })).status, 403);
  assert.equal((await as(admin.id).post(`/projects/${p.id}/postpone`, {})).status, 400);
  const res = await as(admin.id).post(`/projects/${p.id}/postpone`, { startDate: new Date(2026, 11, 1, 9).toISOString() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.days, 30);
  assert.equal(res.body.project.status, 'Planning', 'a later start is planning again');
  assert.equal(new Date(res.body.project.postponedFrom).getDate(), 1);
  assert.deepEqual([new Date(res.body.project.endDate).getMonth(), new Date(res.body.project.endDate).getDate()], [11, 20]);
  assert.equal(new Date(store.projectPlan.milestone(stage.id).dueDate).getDate(), 10);
  assert.equal(new Date(store.projectPlan.milestone(stage.id).dueDate).getMonth(), 11);
  const moved = store.getTaskById(open.id);
  assert.deepEqual([moved.startDate.getMonth(), moved.startDate.getDate(), moved.dueDate.getDate()], [11, 3, 5]);
  assert.equal(store.getTaskById(done.id).dueDate.getMonth(), 10, 'finished work keeps its date');
  const told = store.db.prepare("SELECT userId FROM notifications WHERE type = 'project_postponed'").all().map((r) => r.userId);
  assert.ok(told.includes('user-3'));

  // Moving again keeps the very first planned start.
  const again = (await as(admin.id).post(`/projects/${p.id}/postpone`, { startDate: new Date(2027, 0, 5, 9).toISOString() })).body;
  assert.equal(new Date(again.project.postponedFrom).getMonth(), 10);
});

test('complete: marks the project done, and closes its open tasks only when asked, without new rounds', async () => {
  const { store, as, admin, newProject, newTask } = setup();
  const p = await newProject();
  await newTask(p.id, { assignedUserIds: ['user-3', 'user-5'], recurrence: 'weekly', dueDate: new Date().toISOString() });
  await newTask(p.id, { title: 'Two' });

  assert.equal((await as('user-3').post(`/projects/${p.id}/complete`, {})).status, 403);
  const keep = (await as(admin.id).post(`/projects/${p.id}/complete`, { closeOpenTasks: false })).body;
  assert.deepEqual([keep.project.status, keep.closed], ['Done', 0]);
  assert.equal(store.listTasks().filter((t) => t.projectId === p.id && t.status !== 'Done').length, 2);

  const close = (await as(admin.id).post(`/projects/${p.id}/complete`, { closeOpenTasks: true })).body;
  assert.equal(close.closed, 2);
  const tasks = store.listTasks().filter((t) => t.projectId === p.id);
  assert.equal(tasks.length, 2, 'no next round of the repeating task');
  assert.ok(tasks.every((t) => t.status === 'Done'));
  assert.ok(tasks[0].parts.every((part) => part.status === 'Done') || tasks[1].parts.every((part) => part.status === 'Done'));
});
