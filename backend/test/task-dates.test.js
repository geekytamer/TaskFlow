const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-dates-'), 'taskflow.db');
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
      post: (url, body) => request(app).post(url).set('Authorization', auth).send(body ?? {}),
      put: (url, body) => request(app).put(url).set('Authorization', auth).send(body ?? {}),
      patch: (url, body) => request(app).patch(url).set('Authorization', auth).send(body ?? {}),
    };
  };
  const project = store.listProjects().find((p) => p.companyId === '1');
  const newTask = (extra) => as(admin.id).post('/tasks', { title: 'Shoot the ad', projectId: project.id, companyId: '1', priority: 'Medium', assignedUserIds: ['user-3'], ...extra });
  const notes = (userId, type) => store.db.prepare('SELECT title, body FROM notifications WHERE userId = ? AND type = ?').all(userId, type);
  return { store, admin, as, newTask, notes };
}

test('a task can run from a start date to a due date; the start can not come after the end', async () => {
  const { as, admin, newTask } = setup();
  const start = new Date(Date.now() + 2 * DAY);
  const due = new Date(Date.now() + 5 * DAY);
  const res = await newTask({ startDate: start.toISOString(), dueDate: due.toISOString() });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(new Date(res.body.startDate).getTime(), start.getTime());

  assert.equal((await newTask({ startDate: due.toISOString(), dueDate: start.toISOString() })).status, 400);
  // A partial edit is checked against the date already on the task.
  assert.equal((await as(admin.id).put(`/tasks/${res.body.id}`, { startDate: new Date(Date.now() + 9 * DAY).toISOString() })).status, 400);
  const cleared = await as(admin.id).put(`/tasks/${res.body.id}`, { startDate: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.startDate, undefined);
});

test('the people on it hear the day it starts, once; the owner hears when half the time went and nobody started', async () => {
  const { store, admin, newTask, notes } = setup();
  const start = new Date(Date.now() + 1 * DAY);
  const due = new Date(Date.now() + 5 * DAY);
  const task = (await newTask({ startDate: start.toISOString(), dueDate: due.toISOString() })).body;

  store.sweepTaskStartAlerts(new Date());
  assert.equal(notes('user-3', 'task_start').length, 0, 'not before it starts');
  store.sweepTaskStartAlerts(new Date(start.getTime() + 60_000));
  store.sweepTaskStartAlerts(new Date(start.getTime() + 2 * 60_000));
  assert.equal(notes('user-3', 'task_start').length, 1, 'once');

  store.sweepTaskStartAlerts(new Date(start.getTime() + DAY));
  assert.equal(notes(admin.id, 'task_behind').length, 0, 'a quarter of the way is not behind');
  const halfway = new Date(start.getTime() + 2.1 * DAY);
  store.sweepTaskStartAlerts(halfway);
  store.sweepTaskStartAlerts(new Date(halfway.getTime() + 60_000));
  const behind = notes(admin.id, 'task_behind');
  assert.equal(behind.length, 1);
  assert.match(behind[0].body, /Charlie|has not started/);

  // Started in time: no behind alert.
  const other = (await newTask({ title: 'On time', startDate: start.toISOString(), dueDate: due.toISOString() })).body;
  store.updateTask(other.id, { status: 'In Progress' });
  const before = notes(admin.id, 'task_behind').length;
  store.sweepTaskStartAlerts(halfway);
  assert.equal(notes(admin.id, 'task_behind').length, before);
  assert.ok(task.id);
});

test('a task made already started sends no extra start alert; a repeating span keeps its length', async () => {
  const { store, as, admin, newTask, notes } = setup();
  await newTask({ title: 'Now', startDate: new Date(Date.now() - DAY).toISOString(), dueDate: new Date(Date.now() + DAY).toISOString() });
  store.sweepTaskStartAlerts(new Date());
  assert.equal(notes('user-3', 'task_start').length, 0);

  const start = new Date(Date.now() - DAY);
  const due = new Date(Date.now() + 2 * DAY);
  const rep = (await newTask({ title: 'Weekly shoot', recurrence: 'weekly', startDate: start.toISOString(), dueDate: due.toISOString() })).body;
  const done = (await as(admin.id).put(`/tasks/${rep.id}`, { status: 'Done' })).body;
  const next = store.getTaskById(done.recurrenceNextId);
  assert.equal(next.dueDate.getTime() - next.startDate.getTime(), due.getTime() - start.getTime());
  assert.equal(next.dueDate.getTime() - due.getTime(), 7 * DAY);
});
