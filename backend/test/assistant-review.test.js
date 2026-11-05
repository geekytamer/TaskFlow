const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { fieldsOf, changesOf, applyEdits, inverseOf, areaOf, docTypeOf, labelOf } = require('../dist/assistant/review');
const { parseAssistantSettings, mayUseAssistant, DEFAULT_ASSISTANT_SETTINGS } = require('../dist/assistant/settings');
const { assistantOps } = require('../dist/assistant/catalogue');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');
const { seedFixture } = require('../eval/assistant/fixture');

const names = (key, value) => ({ u1: 'Samantha Bee', p1: 'Website' }[value]);

test('review: fields of a body — scalars editable, ids read-only by name, enums as choices, dates as dates', () => {
  const hint = { text: '', values: { priority: ['Low', 'Medium', 'High', 'Urgent'] } };
  const fields = fieldsOf({ title: 'Call', companyId: '1', priority: 'High', dueDate: '2026-11-06', assignedUserIds: ['u1'], estimateMinutes: 30, description: 'Long words' }, hint, names);
  const by = Object.fromEntries(fields.map((f) => [f.key, f]));
  assert.equal(by.companyId, undefined, 'the company is never a field');
  assert.deepEqual(by.title, { key: 'title', label: 'Title', kind: 'text', value: 'Call' });
  assert.equal(by.priority.kind, 'select');
  assert.deepEqual(by.priority.options, ['Low', 'Medium', 'High', 'Urgent']);
  assert.equal(by.dueDate.kind, 'date');
  assert.equal(by.assignedUserIds.kind, 'readonly');
  assert.equal(by.assignedUserIds.display, 'Samantha Bee');
  assert.equal(by.estimateMinutes.kind, 'number');
  assert.equal(by.description.kind, 'longtext');
  assert.equal(labelOf('assignedUserIds'), 'Assigned user');
});

test('review: changes before → after, only what differs, ids by name', () => {
  const changes = changesOf({ status: 'To Do', priority: 'High', assignedUserIds: [], dueDate: '2026-11-08T00:00:00.000Z' }, { status: 'Done', priority: 'High', assignedUserIds: ['u1'], dueDate: '2026-11-09' }, names);
  assert.deepEqual(changes, [
    { key: 'status', label: 'Status', from: 'To Do', to: 'Done' },
    { key: 'assignedUserIds', label: 'Assigned user', from: '—', to: 'Samantha Bee' },
    { key: 'dueDate', label: 'Due date', from: '2026-11-08', to: '2026-11-09' },
  ]);
});

test('review: edits change only fields already there, keep types, respect choices', () => {
  const hint = { text: '', values: { priority: ['Low', 'Medium', 'High'] } };
  const body = { title: 'Call', priority: 'High', hours: 2, companyId: '1', assignedUserIds: ['u1'] };
  assert.deepEqual(applyEdits(body, { title: 'Call Omar', hours: '1.5', priority: 'Low' }, hint), { ...body, title: 'Call Omar', hours: 1.5, priority: 'Low' });
  assert.throws(() => applyEdits(body, { status: 'Done' }, hint), /Status cannot be changed here/);
  assert.throws(() => applyEdits(body, { companyId: '2' }, hint), /cannot be changed here/);
  assert.throws(() => applyEdits(body, { assignedUserIds: ['u2'] }, hint), /cannot be changed here/);
  assert.throws(() => applyEdits(body, { priority: 'Huge' }, hint), /must be one of/);
  assert.throws(() => applyEdits(body, { hours: 'two' }, hint), /must be a number/);
  assert.throws(() => applyEdits({ dueDate: '2026-11-06' }, { dueDate: 'soon' }), /YYYY-MM-DD/);
});

test('review: the inverse of a creation is the matching delete; of an edit, the old values; a delete has none', () => {
  const ops = assistantOps();
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/tasks', body: {} }, null, { id: 't9' }), { method: 'DELETE', path: '/tasks/t9' });
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/companies/1/contacts', body: {} }, null, { id: 'c9' }), { method: 'DELETE', path: '/contacts/c9' });
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/invoices/i1/payments', body: {} }, null, { id: 'p9' }), { method: 'DELETE', path: '/invoices/i1/payments/p9' });
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/tasks/t1/time-entries', body: {} }, null, { id: 'e9' }), { method: 'DELETE', path: '/time-entries/e9' });
  assert.equal(inverseOf(ops, { method: 'POST', path: '/tasks/t1/comments', body: {} }, null, { id: 'm9' }), null, 'no delete route: no undo');
  assert.equal(inverseOf(ops, { method: 'POST', path: '/projects/p1/members', body: {} }, null, { id: 'p1' }), null, 'an action on a record returns that record: nothing to delete');
  assert.deepEqual(inverseOf(ops, { method: 'PUT', path: '/tasks/t1', body: { status: 'Done', dueDate: '2026-11-09' } }, { status: 'To Do', title: 'x' }, {}), { method: 'PUT', path: '/tasks/t1', body: { status: 'To Do', dueDate: null } });
  assert.equal(inverseOf(ops, { method: 'PUT', path: '/tasks/t1', body: { status: 'Done' } }, null, {}), null, 'no before: no undo');
  assert.equal(inverseOf(ops, { method: 'DELETE', path: '/tasks/t1' }, { id: 't1' }, {}), null);
});

test('review: areas and approval document types', () => {
  assert.equal(areaOf({ permission: 'invoices.pay', path: '/invoices/:id/payments' }), 'invoices');
  assert.equal(areaOf({ permission: 'per_record', path: '/tasks/:taskId/time-entries' }), 'tasks');
  assert.equal(docTypeOf('purchase-order'), 'purchase_order');
  assert.equal(docTypeOf('task'), undefined);
});

test('settings: defaults, validation, who may use it', () => {
  const areas = ['tasks', 'contacts', 'invoices'];
  assert.deepEqual(parseAssistantSettings({}, areas), DEFAULT_ASSISTANT_SETTINGS);
  const s = parseAssistantSettings({ enabled: true, roles: ['Manager'], changeAreas: ['tasks'], maxChanges: 5, learn: false }, areas);
  assert.deepEqual(s, { enabled: true, roles: ['Admin', 'Manager'], changeAreas: ['tasks'], maxChanges: 5, learn: false }, 'Admin is always kept');
  assert.throws(() => parseAssistantSettings({ changeAreas: ['nope'] }, areas), /unknown area nope/);
  assert.throws(() => parseAssistantSettings({ maxChanges: 99 }, areas), /maxChanges/);
  assert.equal(mayUseAssistant(s, 'Employee', false), false);
  assert.equal(mayUseAssistant(s, 'Admin', false), true);
  assert.equal(mayUseAssistant({ ...s, enabled: false }, 'Admin', false), false, 'off is off for everyone');
});

function setupFx(steps = []) {
  const dbPath = path.join(makeTmpDir('taskflow-review-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const fx = seedFixture(store, new Date().toISOString().slice(0, 10));
  const chat = async () => (steps.shift() ?? (() => ({ content: 'ok' })))();
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, assistant: { chat, modelName: 'test-model' } }).listen(0);
  app.unref();
  const as = (who) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${store.issueToken(who)}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${store.issueToken(who)}`).send(body ?? {}),
    put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${store.issueToken(who)}`).send(body ?? {}),
  });
  /** One script, then a reply; returns the thread view. */
  const ask = async (code, who = fx.admin.id, message = 'do it') => {
    steps.push(() => ({ content: `\`\`\`js\n${code}\n\`\`\`` }), () => ({ content: 'Prepared.' }));
    const res = await as(who).post('/assistant/chat', { companyId: '1', message });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };
  return { store, fx, as, ask, steps };
}

test('confirm card: an edit shows before → after; the person edits before confirming and that is what runs', async () => {
  const { store, fx, as, ask } = setupFx();
  const view = await ask("return await tf.updateTask({ task: 'Prepare Q4 report', status: 'Done', priority: 'High' });");
  const a = view.items.at(-1).actions[0];
  assert.deepEqual(a.changes.map((c) => [c.key, c.from, c.to]), [['status', 'To Do', 'Done'], ['priority', 'Medium', 'High']]);
  assert.ok(a.fields.some((f) => f.key === 'status' && f.kind === 'select'));
  const decided = await as(fx.admin.id).post(`/assistant/threads/${view.id}/decide`, { confirm: [a.id], edits: { [a.id]: { status: 'In Review' } } });
  assert.equal(decided.status, 200, JSON.stringify(decided.body));
  assert.equal(store.getTaskById(fx.tasks.q4Report.id).status, 'In Review', 'the edited value ran');
  const after = decided.body.items.flatMap((i) => i.actions).find((x) => x.id === a.id);
  assert.deepEqual(after.edited, [{ key: 'status', label: 'Status', from: 'Done', to: 'In Review' }]);
  const bad = await ask("return await tf.updateTask({ task: 'Call the supplier', status: 'Done' });");
  const b = bad.items.at(-1).actions[0];
  const refused = await as(fx.admin.id).post(`/assistant/threads/${bad.id}/decide`, { confirm: [b.id], edits: { [b.id]: { companyId: '2' } } });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /cannot be changed here/);
  assert.equal(store.getTaskById(fx.tasks.callSupplier.id).status, 'In Progress', 'a refused edit runs nothing');
});

test('confirm card: a delete shows what goes and says it cannot be undone', async () => {
  const { fx, ask } = setupFx();
  const real = await ask(`return await api.delete('/tasks/' + (await tf.myTasks()).find((t) => t.title === 'Supplier note').id, 'Delete the supplier note');`);
  const a = real.items.at(-1).actions[0];
  assert.equal(a.method, 'DELETE');
  assert.equal(a.target.title, 'Supplier note');
  assert.equal(a.undoable, false);
  assert.ok(fx.tasks.supplierNote.id);
});
