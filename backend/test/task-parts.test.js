const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Seed: admin (Admin of 1-3), user-2 Manager of 1, user-3 and user-5 Employees
 * of 1. A task for two people: each has a part and finishes it on their own.
 */
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-task-parts-'), 'taskflow.db');
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
    };
  };
  const project = store.listProjects().find((p) => p.companyId === '1' && p.visibility === 'Public') ?? store.listProjects().find((p) => p.companyId === '1');
  const newTask = async (assignees, extra = {}) => {
    const res = await as(admin.id).post('/tasks', {
      title: 'Shoot the clip', projectId: project.id, companyId: '1', priority: 'Medium', assignedUserIds: assignees, ...extra,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };
  const notes = (userId) => store.db.prepare("SELECT type, title FROM notifications WHERE userId = ? AND type LIKE 'task_%'").all(userId);
  return { app, store, admin, as, newTask, notes, dbPath };
}

const part = (task, userId) => task.parts.find((p) => p.userId === userId);

test('two people on one task: each finishes their own part, the task stays open for the other', async () => {
  const { admin, as, newTask, notes } = setup();
  const task = await newTask(['user-3', 'user-5']);
  assert.equal(task.parts.length, 2);
  assert.ok(task.parts.every((p) => p.status === 'To Do'));

  // Ahmed (user-3) labels nothing and finishes his part.
  const ahmed = await as('user-3').patch(`/tasks/${task.id}/parts/user-3`, { status: 'Done' });
  assert.equal(ahmed.status, 200, JSON.stringify(ahmed.body));
  assert.equal(ahmed.body.status, 'In Progress', 'the task is still open');
  assert.equal(part(ahmed.body, 'user-3').status, 'Done');
  assert.equal(part(ahmed.body, 'user-5').status, 'To Do');
  assert.ok(part(ahmed.body, 'user-3').doneAt);

  // Mohammed (user-5) and the task's owner hear that Ahmed's part is done.
  assert.ok(notes('user-5').some((n) => n.type === 'task_part_done'));
  assert.ok(notes(admin.id).some((n) => n.type === 'task_part_done'));
  assert.ok(!notes('user-3').some((n) => n.type === 'task_part_done'), 'not the person who finished');

  // The last part closes the task, and the owner hears it is complete.
  const mohammed = await as('user-5').patch(`/tasks/${task.id}/parts/user-5`, { status: 'Done' });
  assert.equal(mohammed.body.status, 'Done');
  assert.ok(notes(admin.id).some((n) => n.type === 'task_completed'));
});

test('a part is changed by its own person, the task owner or a manager; not by a colleague', async () => {
  const { admin, as, newTask } = setup();
  const task = await newTask(['user-3', 'user-5']);
  assert.equal((await as('user-3').patch(`/tasks/${task.id}/parts/user-5`, { status: 'Done' })).status, 403);
  assert.equal((await as('user-3').patch(`/tasks/${task.id}/parts/user-3`, { label: 'Editing' })).status, 403, 'labels are set by whoever runs the task');
  const labelled = await as(admin.id).patch(`/tasks/${task.id}/parts/user-5`, { label: 'Filming and editing' });
  assert.equal(labelled.status, 200);
  assert.equal(part(labelled.body, 'user-5').label, 'Filming and editing');
  assert.equal((await as('user-2').patch(`/tasks/${task.id}/parts/user-5`, { status: 'In Progress' })).status, 200, 'a manager may');
  assert.equal((await as(admin.id).patch(`/tasks/${task.id}/parts/user-2`, { status: 'Done' })).status, 404, 'not on the task');
  assert.equal((await as(admin.id).patch(`/tasks/${task.id}/parts/user-5`, { status: 'Sideways' })).status, 400);
});

test('closing or reopening the whole task moves every part with it', async () => {
  const { admin, as, newTask } = setup();
  const task = await newTask(['user-3', 'user-5']);
  const closed = await as(admin.id).put(`/tasks/${task.id}`, { status: 'Done' });
  assert.equal(closed.status, 200);
  assert.ok(closed.body.parts.every((p) => p.status === 'Done'));
  const reopened = await as(admin.id).put(`/tasks/${task.id}`, { status: 'To Do' });
  assert.ok(reopened.body.parts.every((p) => p.status === 'To Do'));
});

test('parts follow the assignees; a one-person task has none', async () => {
  const { admin, as, newTask } = setup();
  const solo = await newTask(['user-3']);
  assert.deepEqual(solo.parts, []);

  const task = await newTask(['user-3', 'user-5']);
  await as('user-3').patch(`/tasks/${task.id}/parts/user-3`, { status: 'Done' });
  await as('user-5').patch(`/tasks/${task.id}/parts/user-5`, { status: 'Done' });
  // Someone joins a finished task: it opens again for them.
  const joined = await as(admin.id).put(`/tasks/${task.id}`, { assignedUserIds: ['user-3', 'user-5', 'user-2'] });
  assert.equal(joined.body.parts.length, 3);
  assert.equal(part(joined.body, 'user-2').status, 'To Do');
  assert.equal(joined.body.status, 'In Progress');
  // Back to one person: the parts go, the task carries on as before.
  const single = await as(admin.id).put(`/tasks/${task.id}`, { assignedUserIds: ['user-2'] });
  assert.deepEqual(single.body.parts, []);
});

test('the task list carries parts, so each person sees their own state', async () => {
  const { as, newTask } = setup();
  const task = await newTask(['user-3', 'user-5']);
  await as('user-3').patch(`/tasks/${task.id}/parts/user-3`, { status: 'Done' });
  const list = (await as('user-5').get('/tasks')).body;
  const seen = list.find((t) => t.id === task.id);
  assert.equal(part(seen, 'user-3').status, 'Done');
  assert.equal(part(seen, 'user-5').status, 'To Do');
});

test('new statuses and the Urgent priority', async () => {
  const { admin, as, newTask } = setup();
  const task = await newTask(['user-3'], { priority: 'Urgent' });
  assert.equal(task.priority, 'Urgent');
  for (const status of ['Waiting', 'In Review', 'In Progress', 'Done', 'To Do']) {
    assert.equal((await as(admin.id).put(`/tasks/${task.id}`, { status })).body.status, status);
  }
  assert.equal((await as(admin.id).put(`/tasks/${task.id}`, { status: 'Lost' })).status, 400);
  assert.equal((await as(admin.id).put(`/tasks/${task.id}`, { priority: 'Critical' })).status, 400);
});

test('tasks that already had several people get a part each, in the task\'s state', async () => {
  const { store, newTask, dbPath } = setup();
  const task = await newTask(['user-3', 'user-5']);
  store.db.prepare("UPDATE tasks SET status = 'Done' WHERE id = ?").run(task.id);
  store.db.prepare('DELETE FROM task_parts').run();
  store.db.prepare("DELETE FROM schema_migrations WHERE id = '139_task_parts'").run();
  store.db.exec('DROP TABLE task_parts');
  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  const parts = reopened.getTaskById(task.id).parts;
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.status === 'Done'));
});
