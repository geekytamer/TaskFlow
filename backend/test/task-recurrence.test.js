const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { nextDueDate } = require('../dist/tasks/task-recurrence');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-recur-'), 'taskflow.db');
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
  const project = store.listProjects().find((p) => p.companyId === '1');
  const rounds = (title) => store.listTasks().filter((t) => t.title === title);
  return { store, admin, as, project, rounds };
}

test('next due date: one period on, never in the past, month ends kept', () => {
  const now = new Date(2026, 9, 27, 10);
  assert.equal(nextDueDate('daily', new Date(2026, 9, 27), now).getDate(), 28);
  assert.equal(nextDueDate('weekly', new Date(2026, 9, 27), now).toDateString(), new Date(2026, 10, 3).toDateString());
  assert.equal(nextDueDate('monthly', new Date(2026, 0, 31), new Date(2026, 0, 1)).toDateString(), new Date(2026, 1, 28).toDateString());
  // A weekly task left for a month jumps to the next week still ahead.
  assert.ok(nextDueDate('weekly', new Date(2026, 8, 1), now) >= new Date(2026, 9, 27));
});

test('finishing a repeating task makes the next round once, with its steps unticked', async () => {
  const { admin, as, project, rounds } = setup();
  const created = await as(admin.id).post('/tasks', {
    title: 'Weekly report', projectId: project.id, companyId: '1', priority: 'Medium',
    assignedUserIds: ['user-3'], recurrence: 'weekly', dueDate: new Date().toISOString(),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.recurrence, 'weekly');
  const step = (await as('user-3').post(`/tasks/${created.body.id}/checklist`, { text: 'Collect numbers' })).body;
  await as('user-3').patch(`/tasks/${created.body.id}/checklist/${step.id}`, { done: true });

  const done = await as('user-3').put(`/tasks/${created.body.id}`, { status: 'Done' });
  assert.equal(done.status, 200);
  assert.ok(done.body.recurrenceNextId, 'points at the next round');
  const all = rounds('Weekly report');
  assert.equal(all.length, 2);
  const next = all.find((t) => t.id === done.body.recurrenceNextId);
  assert.equal(next.status, 'To Do');
  assert.equal(next.recurrence, 'weekly');
  assert.deepEqual(next.assignedUserIds, ['user-3']);
  assert.ok(next.dueDate > new Date(created.body.dueDate));
  const steps = (await as('user-3').get(`/tasks/${next.id}/checklist`)).body;
  assert.deepEqual(steps.map((s) => [s.text, s.done]), [['Collect numbers', false]]);

  // Reopen and close again: no second copy.
  await as('user-3').put(`/tasks/${created.body.id}`, { status: 'In Progress' });
  await as('user-3').put(`/tasks/${created.body.id}`, { status: 'Done' });
  assert.equal(rounds('Weekly report').length, 2);
});

test('a shared repeating task rolls over when the last part is done; a plain task never does', async () => {
  const { admin, as, project, rounds } = setup();
  const shared = (await as(admin.id).post('/tasks', {
    title: 'Daily post', projectId: project.id, companyId: '1', priority: 'High',
    assignedUserIds: ['user-3', 'user-5'], recurrence: 'daily',
  })).body;
  await as(admin.id).patch(`/tasks/${shared.id}/parts/user-3`, { label: 'Filming' });
  await as('user-3').patch(`/tasks/${shared.id}/parts/user-3`, { status: 'Done' });
  assert.equal(rounds('Daily post').length, 1, 'one part left: not yet');
  await as('user-5').patch(`/tasks/${shared.id}/parts/user-5`, { status: 'Done' });
  const all = rounds('Daily post');
  assert.equal(all.length, 2);
  const next = all.find((t) => t.id !== shared.id);
  assert.deepEqual(next.parts.map((p) => [p.userId, p.label ?? null, p.status]), [['user-3', 'Filming', 'To Do'], ['user-5', null, 'To Do']]);

  const plain = (await as(admin.id).post('/tasks', { title: 'One-off', projectId: project.id, companyId: '1', priority: 'Low' })).body;
  await as(admin.id).put(`/tasks/${plain.id}`, { status: 'Done' });
  assert.equal(rounds('One-off').length, 1);

  // Stopping the repeat.
  const stop = await as(admin.id).put(`/tasks/${next.id}`, { recurrence: null });
  assert.equal(stop.body.recurrence, undefined);
  assert.equal((await as(admin.id).put(`/tasks/${next.id}`, { recurrence: 'hourly' })).status, 400);
});
