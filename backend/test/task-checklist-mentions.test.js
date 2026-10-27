const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** Seed: admin (Admin 1-3), user-2 Manager of 1, user-3/user-5 Employees of 1, user-4 Manager of 2 only. */
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-checklist-'), 'taskflow.db');
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
      patch: (url, body) => request(app).patch(url).set('Authorization', auth).send(body ?? {}),
      del: (url) => request(app).delete(url).set('Authorization', auth),
    };
  };
  const project = store.listProjects().find((p) => p.companyId === '1');
  const newTask = async (extra = {}) => {
    const res = await as(admin.id).post('/tasks', { title: 'Prepare the shoot', projectId: project.id, companyId: '1', priority: 'Medium', assignedUserIds: ['user-3'], ...extra });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };
  const notes = (userId, type) => store.db.prepare('SELECT title FROM notifications WHERE userId = ? AND type = ?').all(userId, type);
  return { store, admin, as, newTask, notes };
}

test('a checklist inside a task: add, tick, rename, remove; the task carries the count', async () => {
  const { as, newTask } = setup();
  const task = await newTask();
  const a = await as('user-3').post(`/tasks/${task.id}/checklist`, { text: 'Book the studio' });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const b = (await as('user-3').post(`/tasks/${task.id}/checklist`, { text: 'Charge the batteries' })).body;
  assert.equal((await as('user-3').post(`/tasks/${task.id}/checklist`, { text: '  ' })).status, 400);

  const ticked = await as('user-3').patch(`/tasks/${task.id}/checklist/${a.body.id}`, { done: true });
  assert.equal(ticked.status, 200);
  assert.equal(ticked.body.done, true);
  assert.ok(ticked.body.doneAt);

  const items = (await as('user-3').get(`/tasks/${task.id}/checklist`)).body;
  assert.deepEqual(items.map((i) => [i.text, i.done]), [['Book the studio', true], ['Charge the batteries', false]]);

  const listed = (await as('user-3').get('/tasks')).body.find((t) => t.id === task.id);
  assert.deepEqual(listed.checklist, { done: 1, total: 2 });

  assert.equal((await as('user-3').patch(`/tasks/${task.id}/checklist/${b.id}`, { text: 'Charge all batteries' })).body.text, 'Charge all batteries');
  assert.equal((await as('user-3').del(`/tasks/${task.id}/checklist/${b.id}`)).status, 200);
  assert.equal((await as('user-3').get(`/tasks/${task.id}/checklist`)).body.length, 1);
});

test('a checklist is only for people who can see the task', async () => {
  const { as, newTask } = setup();
  const task = await newTask({ isPrivate: true });
  assert.equal((await as('user-4').get(`/tasks/${task.id}/checklist`)).status, 403, 'another company');
  assert.equal((await as('user-5').post(`/tasks/${task.id}/checklist`, { text: 'sneak' })).status, 404, 'a private task of someone else');
  const item = (await as('user-3').post(`/tasks/${task.id}/checklist`, { text: 'mine' })).body;
  const other = await newTask();
  assert.equal((await as('user-3').patch(`/tasks/${other.id}/checklist/${item.id}`, { done: true })).status, 404, 'an item belongs to its own task');
});

test('@mentions in a comment reach the people named, never someone who cannot see the task', async () => {
  const { as, newTask, notes } = setup();
  const task = await newTask();
  const res = await as('user-3').post(`/tasks/${task.id}/comments`, { content: '@Samantha can you check?', mentionIds: ['user-2', 'user-4', 'nobody'] });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(notes('user-2', 'task_mention').length, 1, 'the manager named gets it');
  assert.equal(notes('user-4', 'task_mention').length, 0, 'someone from another company never does');

  // A private task: a colleague who cannot see it is not told about it, even when named.
  const secret = await newTask({ title: 'POISON private plan', isPrivate: true });
  await as('user-3').post(`/tasks/${secret.id}/comments`, { content: 'hey', mentionIds: ['user-5'] });
  assert.equal(notes('user-5', 'task_mention').length, 0);
  assert.ok(!JSON.stringify(notes('user-5', 'task_mention')).includes('POISON'));
});
