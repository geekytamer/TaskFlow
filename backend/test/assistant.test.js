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
  // fetch turns %2e%2e into .. and \ into /, then normalizes: such an id would reach another route.
  for (const bad of ['%2e%2e', '%2E%2e', '%2e', 'a%2fb', 'a\\b', '%E0%A4%A']) {
    assert.equal(matchOp(ops, 'GET', `/companies/${bad}/invoices`), undefined, bad);
  }
  assert.equal(matchOp(ops, 'GET', '/companies/abc-123/invoices')?.path, '/companies/:companyId/invoices');
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
  assert.match(s.model.seen[1].at(-1).content, /^Result of your code:\n.*tf\.createTasks/s, 'findApi lists the recipe first');
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

test('replies the model offers become buttons, not text', async () => {
  const s = setup([say('Two tasks are open.\n» Show the overdue ones\n» أنشئ مهمة جديدة')]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'x' });
  const reply = res.body.items.at(-1);
  assert.equal(reply.text, 'Two tasks are open.');
  assert.deepEqual(reply.suggestions, ['Show the overdue ones', 'أنشئ مهمة جديدة']);
});

test('several changes in one script wait together and run together', async () => {
  const s = setup([
    say("```js\nfor (const t of ['Bank', 'Client', 'Materials']) await api.post('/tasks', { title: t, companyId: '1', priority: 'Medium', status: 'Done' }, 'Record ' + t);\nreturn 3;\n```"),
    say('Three tasks are ready; confirm below.'),
    say('All three are recorded.'),
  ]);
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'bank, client, materials' });
  const actions = asked.body.items.at(-1).actions;
  assert.equal(actions.length, 3);
  const before = s.store.listTasks().length;
  const done = await s.as(s.admin.id).post(`/assistant/threads/${asked.body.id}/decide`, { confirm: actions.map((a) => a.id) });
  assert.equal(s.store.listTasks().length, before + 3);
  assert.equal(done.body.items.at(-1).text, 'All three are recorded.');
  assert.equal(s.model.seen.length, 3, 'one follow-up for the whole batch');
});

test('a filter the endpoint ignored is pointed out; returned records become cards without show()', async () => {
  const s = setup([
    say("```js\nconst rows = await api.get('/tasks?companyId=1&status=Overdue');\nreturn rows.slice(0, 2);\n```"),
    say('Here.'),
  ]);
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'overdue?' });
  assert.match(s.model.seen[1].at(-1).content, /WARNING: GET \/tasks\?companyId=1&status=Overdue ignored the filter status=Overdue/);
  assert.equal(res.body.items.at(-1).cards.length, 2);
});

test('ignoredFilters: a filter that matched is not reported', () => {
  const { ignoredFilters } = require('../dist/assistant/hints');
  assert.deepEqual(ignoredFilters('/x?status=Done', [{ status: 'Done' }, { status: 'done' }]), []);
  assert.deepEqual(ignoredFilters('/x?status=Sent,Overdue', [{ status: 'Sent' }, { status: 'Overdue' }]), []);
  assert.deepEqual(ignoredFilters('/x?status=Overdue', [{ status: 'Done' }]), ['status=Overdue']);
  assert.deepEqual(ignoredFilters('/x?start=2026-11-02', [{ title: 'a' }]), []);
});

test('a file attached in the chat is filed on a record once confirmed; others cannot use it', async () => {
  const steps = [];
  const s = setup(steps);
  const tiny = Buffer.from('%PDF-1.4 receipt').toString('base64');
  const up = await s.as(s.admin.id).post('/assistant/files', { companyId: '1', fileName: 'receipt.pdf', mimeType: 'application/pdf', contentBase64: tiny });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const fileId = up.body.id;
  const task = s.store.listTasks().find((t) => t.companyId === '1');
  steps.push(
    (messages) => {
      assert.match(messages.at(-1).content, new RegExp(`receipt.pdf.*fileId: ${fileId}`));
      assert.match(messages[0].content, /Files they attached/);
      return { content: "```js\nreturn await api.post('/companies/1/records/task/" + task.id + "/attachments', { fileId: '" + fileId + "', note: 'Receipt' }, 'Attach receipt.pdf to the task');\n```" };
    },
    say('Ready to attach; confirm below.'),
    say('Attached.'),
  );
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'attach this to the task', fileIds: [fileId] });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.deepEqual(asked.body.items[0].files.map((f) => f.name), ['receipt.pdf']);
  assert.equal(asked.body.items[0].text, 'attach this to the task', 'the file note is not shown as text');
  const action = asked.body.items.at(-1).actions[0];
  assert.deepEqual(action.body, { fileId, note: 'Receipt' }, 'the proposal stays small');
  const done = await s.as(s.admin.id).post(`/assistant/threads/${asked.body.id}/decide`, { confirm: [action.id] });
  assert.equal(done.status, 200);
  const attachments = s.store.listRecordAttachments('1', 'task', task.id);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, 'receipt.pdf');
  assert.equal(done.body.items.at(-1).cards[0].title, 'receipt.pdf', 'what was made is shown as a card');
  // Someone else cannot attach or read that file.
  assert.equal((await s.as('user-3').post('/assistant/chat', { companyId: '1', message: 'x', fileIds: [fileId] })).status, 400);
  assert.equal((await s.as('user-3').get(`/assistant/files/${fileId}`)).status, 404);
  assert.equal((await s.as(s.admin.id).get(`/assistant/files/${fileId}`)).status, 200);
  const bad = await s.as(s.admin.id).post('/assistant/files', { companyId: '1', fileName: 'x.exe', mimeType: 'application/x-msdownload', contentBase64: tiny });
  assert.equal(bad.status, 415);
});

test('a document from a template: the blanks are checked against the template, then it is made and shown', async () => {
  const steps = [];
  const s = setup(steps);
  const tpl = await s.as(s.admin.id).post('/companies/1/document-templates', { name: 'Salary certificate', type: 'certificate', manualFields: [{ key: 'employee', label: 'Employee name' }, { key: 'salary', label: 'Monthly salary' }] });
  assert.equal(tpl.status, 201, JSON.stringify(tpl.body));
  steps.push(
    say("```js\ntry { await api.post('/companies/1/documents', { templateId: '" + tpl.body.id + "', fieldValues: { name: 'Ahmed' } }, 'x'); } catch (e) { return e.message; }\n```"),
    say("```js\nreturn await api.post('/companies/1/documents', { templateId: '" + tpl.body.id + "', fieldValues: { employee: 'Ahmed', salary: '900 OMR' } }, 'Make the salary certificate for Ahmed');\n```"),
    say('The certificate is ready to make; confirm below.'),
    say('Made.'),
  );
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'salary certificate for Ahmed, 900 OMR' });
  assert.match(s.model.seen[1].at(-1).content, /does not have: name\. Its blanks: employee \(Employee name\), salary/);
  const action = asked.body.items.at(-1).actions[0];
  const done = await s.as(s.admin.id).post(`/assistant/threads/${asked.body.id}/decide`, { confirm: [action.id] });
  const card = done.body.items.at(-1).cards[0];
  assert.equal(card.kind, 'document');
  assert.match(card.href, /^\/document\//);
});

test('progress: while it works the screen can ask what it is doing; the prompt names the areas the person can use', async () => {
  let seenStep;
  let s;
  s = setup([async (messages) => {
    const p = await s.as(s.admin.id).get('/assistant/progress/req-12345678');
    seenStep = p.body.step;
    assert.match(messages[0].content, /Areas they can use here: .*tasks/);
    return { content: 'ok' };
  }]);
  await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'hi', requestId: 'req-12345678' });
  assert.deepEqual(seenStep, { kind: 'thinking' });
  assert.deepEqual((await s.as('user-3').get('/assistant/progress/req-12345678')).body, { step: null });
});

test('lookup() finds records by name through global search; a change on an undefined id is refused; plural kinds are corrected', async () => {
  const s = setup([
    say("```js\nconst found = await lookup('Develop landing');\nreturn found;\n```"),
    say("```js\ntry { await api.post('/companies/1/records/task/undefined/attachments', { fileId: 'x' }, 'x'); } catch (e) { return e.message; }\n```"),
    say('ok'),
  ]);
  await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'find it' });
  const found = JSON.parse(s.model.seen[1].at(-1).content.replace(/^Result of your code:\n/, '')).result;
  assert.ok(found.some((f) => f.kind === 'task' && /landing/i.test(f.title)), JSON.stringify(found));
  assert.match(s.model.seen[2].at(-1).content, /has a missing id/);
  const { soundPath } = require('../dist/routes/assistant');
  assert.equal(soundPath('/companies/1/records/tasks/t1/attachments'), '/companies/1/records/task/t1/attachments');
  assert.equal(soundPath('/companies/1/records/sales-orders/o1/attachments'), '/companies/1/records/sales_order/o1/attachments');
  assert.throws(() => soundPath('/companies/1/records/planets/p1/attachments'), /cannot take attachments/);
});

test('makeDocument finds the template by name (Arabic too) and maps blanks by key or label', async () => {
  const steps = [];
  const s = setup(steps);
  const tpl = await s.as(s.admin.id).post('/companies/1/document-templates', { name: 'Salary certificate', type: 'certificate', manualFields: [{ key: 'employee', label: 'Employee name' }, { key: 'salary', label: 'Monthly salary' }] });
  assert.equal(tpl.status, 201, JSON.stringify(tpl.body));
  steps.push(
    say("```js\nreturn await makeDocument('شهادة راتب', { 'Employee name': 'أحمد', salary: '900' }, 'شهادة راتب لأحمد');\n```"),
    say('جاهزة للتأكيد.'),
  );
  const res = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'شهادة راتب لأحمد 900' });
  const action = res.body.items.at(-1).actions[0];
  assert.equal(action.body.templateId, tpl.body.id);
  assert.deepEqual(action.body.fieldValues, { employee: 'أحمد', salary: '900' });
  assert.equal(action.summary, 'شهادة راتب لأحمد');
});

test('sandbox: past the call limit the script still gets an error it can catch, and the rest runs', async () => {
  const r = await runInSandbox(`
    let n = 0, err = null;
    try { for (let i = 0; i < 10; i++) { await api.get('/x'); n++; } } catch (e) { err = e.message; }
    return { n, err };`, quietHost, { timeoutMs: 5000, maxCalls: 3, memoryBytes: 32e6 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.n, 3);
  assert.match(r.value.err, /too many api calls/);
});

test('background: the request answers at once, the thread says it is working, then has the answer', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const s = setup([], { chat: async () => { await gate; return { content: 'All done.' }; } });
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'hello', background: true });
  assert.equal(asked.status, 202, JSON.stringify(asked.body));
  assert.equal(asked.body.working, true);
  assert.equal(asked.body.items.at(-1).text, 'hello', 'the message is in the thread while it works');
  const busy = await s.as(s.admin.id).post('/assistant/chat', { threadId: asked.body.id, message: 'again', background: true });
  assert.equal(busy.status, 409);
  release();
  let view;
  for (let i = 0; i < 50; i++) {
    view = (await s.as(s.admin.id).get(`/assistant/threads/${asked.body.id}`)).body;
    if (!view.working) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(view.working, false);
  assert.equal(view.error, null);
  assert.equal(view.items.at(-1).text, 'All done.');
});

test('background: a model that fails is reported on the thread; changes it had proposed do not linger', async () => {
  let n = 0;
  const s = setup([], {
    chat: async () => {
      n += 1;
      if (n === 1) return { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_script', arguments: JSON.stringify({ code: "return await api.post('/tasks', { title: 'Lost', companyId: '1', priority: 'High' }, 'Create Lost');" }) } }] };
      throw new ModelUnavailableError('down');
    },
  });
  const asked = await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'make a task', background: true });
  assert.equal(asked.status, 202);
  let view;
  for (let i = 0; i < 50; i++) {
    view = (await s.as(s.admin.id).get(`/assistant/threads/${asked.body.id}`)).body;
    if (!view.working) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.deepEqual(view.error, { status: 503, message: 'down' });
  assert.equal(view.pending, 0, 'the proposal no message shows is expired');
  assert.ok(s.store.listAssistantActions(asked.body.id).every((a) => a.status === 'expired'));
});

test('prompt: the static part comes first and is the same for every person, company and day; it teaches tf and the constants', () => {
  const { systemPrompt, staticPrompt } = require('../dist/assistant/agent');
  const base = { userName: 'A', userId: 'u1', today: '2026-11-05', company: { id: '1', name: 'One', currency: 'OMR' }, companies: [] };
  const a = systemPrompt(base, 'text');
  const b = systemPrompt({ ...base, userName: 'B', userId: 'u2', today: '2026-11-06', company: { id: '2', name: 'Two', currency: 'USD' } }, 'text');
  const s = staticPrompt('text');
  assert.ok(a.startsWith(s) && b.startsWith(s));
  assert.ok(!s.includes('u1') && !s.includes('2026-11-05') && !s.includes('One'));
  assert.match(s, /tf\.myTasks/);
  assert.match(s, /COMPANY_ID/);
  assert.match(a.slice(s.length), /2026-11-05/);
});

test('findApi lists matching recipes before endpoints', async () => {
  const steps = [];
  const s = setup(steps);
  steps.push(say("```js\nreturn await findApi('overdue invoices');\n```"), say('ok'));
  await s.as(s.admin.id).post('/assistant/chat', { companyId: '1', message: 'which invoices are late' });
  const result = s.model.seen[1].at(-1).content;
  assert.match(result, /tf\.invoices/);
  assert.ok(result.indexOf('tf.invoices') < result.indexOf('GET /companies/:companyId/invoices'));
});
