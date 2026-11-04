const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { taskWeek, weekStartOf } = require('../dist/tasks/task-week');
const { makeTmpDir } = require('./helpers/tmp');

/** Tasks bundle 3: estimates, when a task was finished, and the weekly report. */

const DAY = 864e5;

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-week-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (id) => {
    const auth = `Bearer ${store.issueToken(id)}`;
    return {
      get: (url) => request(app).get(url).set('Authorization', auth),
      post: (url, body) => request(app).post(url).set('Authorization', auth).send(body ?? {}),
      put: (url, body) => request(app).put(url).set('Authorization', auth).send(body ?? {}),
    };
  };
  const project = store.listProjects().find((p) => p.companyId === '1');
  const newTask = (extra) => as(admin.id).post('/tasks', { title: 'Edit the video', projectId: project.id, companyId: '1', priority: 'Medium', assignedUserIds: ['user-3'], ...extra });
  return { store, app, admin, as, project, newTask };
}

test('weekStartOf is the Monday of the week', () => {
  assert.equal(weekStartOf(new Date('2026-11-04T15:00:00Z')).toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(weekStartOf(new Date('2026-11-08T23:00:00Z')).toISOString(), '2026-11-02T00:00:00.000Z', 'Sunday belongs to the week before');
  assert.equal(weekStartOf(new Date('2026-11-09T00:00:00Z')).toISOString(), '2026-11-09T00:00:00.000Z');
});

test('taskWeek: done in the week, due and open, overdue, and time per person', () => {
  const start = new Date('2026-11-02T00:00:00Z');
  const now = new Date('2026-11-05T12:00:00Z');
  const t = (id, extra) => ({ id, title: id, projectId: 'p', status: 'To Do', assignedUserIds: ['u1'], ...extra });
  const week = taskWeek([
    t('done', { status: 'Done', completedAt: new Date('2026-11-03T10:00:00Z') }),
    t('doneBefore', { status: 'Done', completedAt: new Date('2026-10-30T10:00:00Z') }),
    t('later', { dueDate: new Date('2026-11-07T00:00:00Z') }),
    t('late', { dueDate: new Date('2026-11-03T00:00:00Z') }),
    t('nobody', { assignedUserIds: [], dueDate: new Date('2026-11-06T00:00:00Z') }),
  ], [{ userId: 'u1', userName: 'Huda', minutes: 90 }], (id) => (id === 'u1' ? 'Huda' : id), start, now);
  const [p] = week.people;
  assert.equal(p.name, 'Huda');
  assert.deepEqual(p.done.map((x) => x.id), ['done']);
  assert.deepEqual(p.dueOpen.map((x) => x.id), ['later']);
  assert.deepEqual(p.overdue.map((x) => x.id), ['late']);
  assert.equal(p.loggedMinutes, 90);
  assert.deepEqual(week.totals, { done: 1, dueOpen: 1, overdue: 1, loggedMinutes: 90, unassignedOpen: 1 });
});

test('an estimate is set and cleared; finishing stamps completedAt and reopening clears it', async () => {
  const { as, admin, newTask, store } = setup();
  const res = await newTask({ estimateMinutes: 150 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.estimateMinutes, 150);
  assert.equal((await newTask({ estimateMinutes: 0.5 })).status, 400, 'whole minutes');
  const id = res.body.id;
  store.createTimeEntry({ companyId: '1', taskId: id, userId: 'user-3', minutes: 45 });
  const read = (await as(admin.id).get(`/tasks/${id}`)).body;
  assert.equal(read.loggedMinutes, 45);
  assert.equal(read.completedAt, undefined);

  const done = await as(admin.id).put(`/tasks/${id}`, { status: 'Done' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const finished = (await as(admin.id).get(`/tasks/${id}`)).body;
  assert.ok(finished.completedAt, 'stamped');
  assert.ok(Math.abs(Date.parse(finished.completedAt) - Date.now()) < 60000);
  assert.equal(finished.estimateMinutes, 150, 'a status change keeps the estimate');

  await as(admin.id).put(`/tasks/${id}`, { status: 'In Progress', estimateMinutes: null });
  const reopened = (await as(admin.id).get(`/tasks/${id}`)).body;
  assert.equal(reopened.completedAt, undefined);
  assert.equal(reopened.estimateMinutes, undefined, 'cleared');
});

test('the weekly report shows only the tasks the reader may see', async () => {
  const { as, admin, newTask, store, project } = setup();
  const visible = await newTask({ title: 'Public work', dueDate: new Date(Date.now() + DAY).toISOString() });
  const hidden = await as(admin.id).post('/tasks', { title: 'Admin private', projectId: project.id, companyId: '1', priority: 'Low', isPrivate: true, assignedUserIds: [admin.id] });
  assert.equal(hidden.status, 201, JSON.stringify(hidden.body));
  store.createTimeEntry({ companyId: '1', taskId: visible.body.id, userId: 'user-3', minutes: 30 });
  store.createTimeEntry({ companyId: '1', taskId: hidden.body.id, userId: admin.id, minutes: 60 });

  const mine = await as('user-3').get('/companies/1/tasks/week');
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  const titles = mine.body.people.flatMap((p) => [...p.done, ...p.dueOpen, ...p.overdue]).map((t) => t.title);
  assert.ok(!titles.includes('Admin private'), 'a private task stays private');
  assert.equal(mine.body.totals.loggedMinutes, 30, 'and so does the time on it');

  const all = await as(admin.id).get('/companies/1/tasks/week');
  assert.ok(all.body.people.find((p) => p.userId === admin.id), 'the owner sees it');
  assert.equal(all.body.totals.loggedMinutes, 90);
});

test('on Monday morning managers hear about last week, once', () => {
  const { store, newTask } = setup();
  return newTask({}).then((res) => {
    store.db.prepare("UPDATE tasks SET status = 'Done' WHERE id = ?").run(res.body.id);
    store.db.prepare('UPDATE tasks SET completedAt = ? WHERE id = ?').run('2026-11-04T10:00:00.000Z', res.body.id);
    const monday = new Date('2026-11-09T05:00:00Z');
    assert.equal(store.sweepWeeklyTaskReports(new Date('2026-11-09T03:00:00Z')), 0, 'not before 04:00 UTC');
    assert.ok(store.sweepWeeklyTaskReports(monday) >= 1);
    assert.equal(store.sweepWeeklyTaskReports(new Date('2026-11-09T06:00:00Z')), 0, 'once per week');
    const sent = store.db.prepare("SELECT body FROM notifications WHERE type = 'task_week'").all();
    assert.ok(sent.length >= 1);
    assert.match(sent[0].body, /^\d+ done, \d+ overdue, [\d.]+ h logged\.$/);
  });
});
