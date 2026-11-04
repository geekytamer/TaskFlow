const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { runInSandbox } = require('../dist/assistant/sandbox');
const { assistantOps, searchOps, matchOp } = require('../dist/assistant/catalogue');
const { ModelUnavailableError } = require('../dist/assistant/model');
const { cleanReply } = require('../dist/assistant/agent');
const { makeTmpDir } = require('./helpers/tmp');

/** The in-app assistant: a sandbox for the model's scripts, the person's own permissions, changes that wait for them. */

const quietHost = { call: async () => null };

/** A model that answers from a list: each entry is a function of the messages it was sent. */
function scripted(steps) {
  const seen = [];
  const chat = async (messages, tools) => {
    seen.push(messages);
    const step = steps.shift();
    if (!step) return { content: 'done' };
    return step(messages, tools);
  };
  return { chat, seen };
}
const runScript = (code) => () => ({ content: null, tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name: 'run_script', arguments: JSON.stringify({ code }) } }] });
const search = (query) => () => ({ content: null, tool_calls: [{ id: `s${Math.random()}`, type: 'function', function: { name: 'search_api', arguments: JSON.stringify({ query }) } }] });
const say = (text) => () => ({ content: text });
const lastTool = (messages) => JSON.parse(messages.filter((m) => m.role === 'tool').at(-1).content);

function setup(steps, extra = {}) {
  const dbPath = path.join(makeTmpDir('taskflow-assistant-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const model = scripted(steps);
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, assistant: { chat: extra.chat ?? model.chat, modelName: 'test-model' } }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const as = (id) => {
    const auth = `Bearer ${store.issueToken(id)}`;
    return {
      get: (url) => request(app).get(url).set('Authorization', auth),
      post: (url, body) => request(app).post(url).set('Authorization', auth).send(body ?? {}),
    };
  };
  const project = store.listProjects().find((p) => p.companyId === '1');
  return { store, app, admin, as, model, project };
}

test('sandbox: a script returns a value and reaches nothing but api', async () => {
  const r = await runInSandbox('return { f: typeof fetch, r: typeof require, p: typeof process, t: typeof setTimeout, x: 1 + 1 };', quietHost);
  assert.deepEqual(r.value, { f: 'undefined', r: 'undefined', p: 'undefined', t: 'undefined', x: 2 });
});

test('sandbox: a loop that never ends is stopped, and so is a flood of calls', async () => {
  const loop = await runInSandbox('while (true) {}', quietHost, { timeoutMs: 200, maxCalls: 5, memoryBytes: 32e6 });
  assert.equal(loop.ok, false);
  assert.match(loop.error, /too long/);
  const flood = await runInSandbox('for (let i = 0; i < 10; i++) await api.get("/x"); return 1;', quietHost, { timeoutMs: 5000, maxCalls: 5, memoryBytes: 32e6 });
  assert.equal(flood.ok, false);
  assert.match(flood.error, /too many api calls/);
});

test('sandbox: api calls go to the host with method, path, body and summary; errors come back as exceptions', async () => {
  const calls = [];
  const host = { call: async (m, p, b, s) => { calls.push([m, p, b, s]); if (p === '/bad') { const e = new Error('403 no'); e.status = 403; throw e; } return { ok: p }; } };
  const r = await runInSandbox(`
    const a = await api.get('/a');
    await api.post('/b', { n: 1 }, 'make b');
    let caught = null;
    try { await api.get('/bad'); } catch (e) { caught = e.message + ' ' + e.status; }
    console.log('hi', { y: 2 });
    return { a, caught };`, host);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.value, { a: { ok: '/a' }, caught: '403 no 403' });
  assert.deepEqual(calls, [['GET', '/a', undefined, undefined], ['POST', '/b', { n: 1 }, 'make b'], ['GET', '/bad', undefined, undefined]]);
  assert.deepEqual(r.logs, ['hi {"y":2}']);
});

test('catalogue: the staff API without sign-in, portal, admin or the assistant itself', () => {
  const ops = assistantOps();
  assert.ok(ops.length > 300);
  assert.ok(!ops.some((o) => o.path.startsWith('/assistant') || o.path.startsWith('/auth') || o.path.startsWith('/portal-api') || o.permission === 'public'));
  assert.equal(matchOp(ops, 'POST', '/tasks')?.path, '/tasks');
  assert.equal(matchOp(ops, 'GET', '/companies/1/invoices?status=Overdue')?.path, '/companies/:companyId/invoices');
  assert.equal(matchOp(ops, 'POST', '/assistant/threads/x/decide'), undefined);
  assert.equal(matchOp(ops, 'GET', '/companies/../invoices'), undefined);
  assert.ok(searchOps(ops, 'overdue invoices').some((o) => o.path === '/companies/:companyId/invoices'));
});

test('cleanReply drops a thinking model\'s reasoning', () => {
  assert.equal(cleanReply('<think>hmm</think>\nHello'), 'Hello');
  assert.equal(cleanReply(null), '');
});

test('a read runs, a change waits for the person, and runs as them once confirmed', async () => {
  const steps = [];
  const s = setup(steps);
  const { admin, project } = s;
  steps.push(
    search('task create'),
    runScript(`
      const tasks = await api.get('/tasks?companyId=1');
      const made = await api.post('/tasks', { title: 'Call the supplier', projectId: '${project.id}', companyId: '1', priority: 'High', assignedUserIds: ['${admin.id}'] }, 'Create the task "Call the supplier"');
      return { count: tasks.length, made };`),
    say('I prepared the task. Confirm it below.'),
    say('The task is created.'),
  );
  const before = s.store.listTasks().length;
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'Add a task to call the supplier' });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const view = asked.body;
  assert.equal(view.pending, 1);
  const reply = view.items.at(-1);
  assert.equal(reply.role, 'assistant');
  assert.equal(reply.text, 'I prepared the task. Confirm it below.');
  assert.equal(reply.actions.length, 1);
  assert.equal(reply.actions[0].summary, 'Create the task "Call the supplier"');
  assert.equal(s.store.listTasks().length, before, 'nothing changes before the person confirms');

  const searched = s.model.seen[1].find((m) => m.role === 'tool').content;
  assert.match(searched, /POST \/tasks/);
  const ran = lastTool(s.model.seen[2]);
  assert.equal(ran.result.made.pending, true);
  assert.ok(ran.result.count >= 0);

  const decided = await s.as(s.admin.id).post(`/assistant/threads/${view.id}/decide`, { confirm: [reply.actions[0].id] });
  assert.equal(decided.status, 200, JSON.stringify(decided.body));
  assert.equal(s.store.listTasks().length, before + 1);
  assert.ok(s.store.listTasks().some((t) => t.title === 'Call the supplier'));
  assert.equal(decided.body.pending, 0);
  assert.equal(decided.body.items.find((i) => i.actions.length).actions[0].status, 'done');
  assert.equal(decided.body.items.at(-1).text, 'The task is created.');
  assert.match(s.model.seen[3].at(-1).content, /Done: Create the task/);

  const again = await s.as(s.admin.id).post(`/assistant/threads/${view.id}/decide`, { confirm: [reply.actions[0].id] });
  assert.equal(again.status, 200);
  assert.equal(s.store.listTasks().length, before + 1, 'a second click does not run it twice');
});

test('the assistant has the person\'s permissions, not more', async () => {
  const s = setup([
    search('invoices'),
    runScript(`try { await api.get('/companies/1/invoices'); return 'read'; } catch (e) { return 'refused ' + e.status; }`),
    runScript(`await api.get('/assistant/threads'); return 1;`),
    say('I cannot see invoices.'),
  ]);
  const employee = 'user-3';
  const res = await s.as(employee).post('/assistant/chat', { companyId: '1', message: 'show invoices' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const found = s.model.seen[1].find((m) => m.role === 'tool').content;
  assert.doesNotMatch(found, /\/companies\/:companyId\/invoices\b/, 'search shows only what the person may use');
  assert.equal(lastTool(s.model.seen[2]).result, 'refused 403');
  assert.match(lastTool(s.model.seen[3]).error, /not a TaskFlow endpoint/);
});

test('someone else\'s conversation and changes are out of reach', async () => {
  const s = setup([runScript(`await api.post('/tasks', { title: 'xx', companyId: '1', priority: 'Low' }, 'make x'); return 1;`), say('ok')]);
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'x' });
  const id = asked.body.id;
  assert.equal((await s.as('user-3').get(`/assistant/threads/${id}`)).status, 404);
  const actionId = asked.body.items.at(-1).actions[0].id;
  assert.equal((await s.as('user-3').post(`/assistant/threads/${id}/decide`, { confirm: [actionId] })).status, 404);
  assert.equal(s.store.getAssistantAction(actionId).status, 'pending');
  assert.equal((await s.as('user-3').post('/assistant/chat', { companyId: 'no-such-company', message: 'x' })).status, 403);
});

test('a declined change is noted and nothing runs', async () => {
  const s = setup([runScript(`await api.post('/tasks', { title: 'yy', companyId: '1', priority: 'Low' }, 'make y'); return 1;`), say('Confirm below.')]);
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'y' });
  const before = s.store.listTasks().length;
  const actionId = asked.body.items.at(-1).actions[0].id;
  const res = await s.as(s.admin.id).post(`/assistant/threads/${asked.body.id}/decide`, { decline: [actionId] });
  assert.equal(res.status, 200);
  assert.equal(s.store.getAssistantAction(actionId).status, 'declined');
  assert.equal(s.store.listTasks().length, before);
  assert.equal(s.model.seen.length, 2, 'a decline does not wake the model');
});

test('a model that cannot be reached gives a clear 503, and no model at all says the assistant is off', async () => {
  const s = setup([], { chat: async () => { throw new ModelUnavailableError('The assistant\'s model is not reachable (ECONNREFUSED).'); } });
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'hi' });
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'ASSISTANT_OFFLINE');
  const status = await s.as(s.admin.id).get('/assistant/status');
  assert.deepEqual(status.body, { enabled: true, model: 'test-model' });
});

test('a change with a wrong body is refused before it reaches the person, with the expected shape', async () => {
  const s = setup([
    runScript(`try { await api.post('/tasks', { name: 'x', companyId: 1, priority: 'high' }, 'make x'); } catch (e) { return e.message; }`),
    runScript(`return await api.post('/tasks', { title: 'Call', companyId: 1, priority: 'High' }, 'make it');`),
    say('Confirm below.'),
  ]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'x' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const refused = lastTool(s.model.seen[1]).result;
  assert.match(refused, /missing title/);
  assert.match(refused, /priority must be one of Low, Medium, High, Urgent/);
  const second = lastTool(s.model.seen[2]);
  assert.ok(second.logs.some((l) => /NOT DONE YET/.test(l)), 'the model is told the change is not done');
  const action = res.body.items.at(-1).actions[0];
  assert.equal(action.body.companyId, '1', 'numeric ids become strings');
});

test('after a read, the model is shown the real fields; an empty return is pointed out', async () => {
  const s = setup([
    runScript(`const rows = await api.get('/tasks?companyId=1'); rows.length;`),
    say('ok'),
  ]);
  await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'tasks?' });
  const out = lastTool(s.model.seen[1]);
  assert.ok(out.logs.some((l) => /^GET \/tasks\?companyId=1 → array\(\d+\) of \{ .*title.*status/.test(l)), JSON.stringify(out.logs));
  assert.ok(out.logs.some((l) => /returned nothing/.test(l)));
});

test('an empty answer gets one hidden nudge', async () => {
  const s = setup([say(''), say('Here you go.')]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'hello' });
  assert.equal(res.body.items.at(-1).text, 'Here you go.');
  assert.equal(res.body.items.filter((i) => i.role === 'user').length, 1, 'the nudge is not shown');
  assert.match(s.model.seen[1].at(-1).content, /^Continue/);
});

test('text mode: the model writes a js block, the server runs it, the result comes back; search works inside the code', async () => {
  const s = setup([
    say("I'll look.\n```js\nconst found = await search('create task');\nreturn found.slice(0, 2);\n```"),
    say('```js\nreturn await api.post(\'/tasks\', { title: \'From text\', companyId: \'1\', priority: \'Low\' }, \'Create the task From text\');\n```'),
    say('Prepared; confirm below.'),
  ]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'make a task' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.match(s.model.seen[1].at(-1).content, /^Result of your code:\n.*POST \/tasks/s);
  assert.match(s.model.seen[2].at(-1).content, /NOT DONE YET/);
  const items = res.body.items;
  assert.deepEqual(items.map((i) => i.role), ['user', 'assistant'], 'code and results are not shown as chat');
  assert.equal(items[1].text, 'Prepared; confirm below.');
  assert.equal(items[1].actions[0].summary, 'Create the task From text');
});

test('the same code twice is not run again; the model is told to change approach', async () => {
  const block = '```js\nreturn 1;\n```';
  const s = setup([say(block), say(block), say('One.')]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'x' });
  assert.equal(res.body.items.at(-1).text, 'One.');
  assert.match(s.model.seen[2].at(-1).content, /already ran exactly this code/);
});

test('show(rows) turns records of any kind into cards with links, from just their ids', async () => {
  const s = setup([
    say("```js\nconst tasks = await api.get('/tasks?companyId=1');\nawait show(tasks.slice(0, 2).map(t => ({ id: t.id })));\nconst inv = await api.get('/companies/1/invoices');\nawait show(inv.slice(0, 1));\nreturn tasks.length;\n```"),
    say('Here they are.'),
  ]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'show me' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const reply = res.body.items.at(-1);
  assert.equal(reply.text, 'Here they are.');
  const tasks = reply.cards.filter((c) => c.kind === 'task');
  assert.equal(tasks.length, 2);
  const task = s.store.listTasks().find((t) => t.id === tasks[0].id);
  assert.equal(tasks[0].title, task.title, 'the full record is used though the script passed only the id');
  assert.equal(tasks[0].href, `/tasks?task=${task.id}`);
  assert.ok(tasks[0].status);
  const invoices = reply.cards.filter((c) => c.kind === 'invoice');
  if (invoices.length) {
    assert.match(invoices[0].href, /^\/invoice\//);
    assert.ok(invoices[0].amount && typeof invoices[0].amount.value === 'number');
  }
  assert.match(s.model.seen[1].at(-1).content, /shown to the person as cards/);
});

test('cards: kinds come from the endpoint path', () => {
  const { kindOfPath } = require('../dist/assistant/cards');
  assert.equal(kindOfPath('/companies/:companyId/purchase-orders'), 'purchase-order');
  assert.equal(kindOfPath('/tasks'), 'task');
  assert.equal(kindOfPath('/companies/:companyId/opportunities'), 'opportunity');
  assert.equal(kindOfPath('/companies/:companyId/invoices'), 'invoice');
});
