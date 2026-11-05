const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { runInSandbox } = require('../dist/assistant/sandbox');
const { RECIPES, searchRecipes } = require('../dist/assistant/recipes');
const { norm, pickOne, dateArg } = require('../dist/assistant/recipes/util');
const { makeTmpDir } = require('./helpers/tmp');
const { seedFixture } = require('../eval/assistant/fixture');

/** Recipes run through the real API as the person; a scripted model calls them. */
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-recipes-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const today = new Date().toISOString().slice(0, 10);
  const fx = seedFixture(store, today);
  const steps = [];
  const chat = async () => (steps.shift() ?? (() => ({ content: 'done' })))();
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, assistant: { chat, modelName: 'test-model' } }).listen(0);
  app.unref();
  /** Runs one script as `who` (admin by default); returns the script's result and what was proposed. */
  const run = async (code, who = fx.admin.id, message = 'do it') => {
    steps.push(() => ({ content: `\`\`\`js\n${code}\n\`\`\`` }), () => ({ content: 'ok' }));
    const res = await request(app).post('/assistant/chat').set('Authorization', `Bearer ${store.issueToken(who)}`).send({ companyId: '1', message });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const thread = store.getAssistantThread(res.body.id);
    const resultMsg = thread.messages.find((m) => m.role === 'user' && /^Result of your code:/.test(m.content));
    const parsed = JSON.parse(resultMsg.content.replace(/^Result of your code:\n/, ''));
    return { ...parsed, proposals: store.listAssistantActions(res.body.id), view: res.body };
  };
  return { store, fx, run };
}

test('recipes: names are letters only and unique; every recipe is found by its own words', () => {
  const names = RECIPES.map((r) => r.name);
  assert.equal(new Set(names).size, names.length);
  for (const r of RECIPES) {
    assert.match(r.name, /^[a-zA-Z]+$/);
    assert.ok(searchRecipes(r.words[0]).some((x) => x.name === r.name), r.name);
  }
});

test('util: norm, pickOne and dateArg', () => {
  assert.equal(norm('  أحمد  "البلوشي" '), 'احمد البلوشي');
  const rows = [{ id: 'a', t: 'Call the supplier' }, { id: 'b', t: 'Call the bank' }];
  assert.equal(pickOne(rows, 'call the supplier', (r) => r.t, 'task').id, 'a');
  assert.equal(pickOne(rows, 'b', (r) => r.t, 'task').id, 'b');
  assert.throws(() => pickOne(rows, 'call', (r) => r.t, 'task'), /several tasks match/);
  assert.throws(() => pickOne(rows, 'nothing', (r) => r.t, 'task'), /no task matches/);
  assert.equal(dateArg({ today: '2026-11-05' }, 'tomorrow', 'd'), '2026-11-06');
  assert.equal(dateArg({ today: '2026-11-05' }, 'غدا', 'd'), '2026-11-06');
  assert.throws(() => dateArg({ today: '2026-11-05' }, 'next tuesday', 'd'), /YYYY-MM-DD/);
});

test('sandbox: constants and tf are there; a recipe call goes to the host as RECIPE', async () => {
  const calls = [];
  const host = { call: async (m, p, b) => { calls.push([m, p, b]); return { ok: true }; } };
  const r = await runInSandbox("return [COMPANY_ID, ME, TODAY, typeof tf.myTasks, await tf.myTasks({ due: 'week' })];", host, undefined, { globals: { COMPANY_ID: '1', ME: 'u1', TODAY: '2026-11-05' }, recipes: ['myTasks'] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.value, ['1', 'u1', '2026-11-05', 'function', { ok: true }]);
  assert.deepEqual(calls, [['RECIPE', 'myTasks', { due: 'week' }]]);
});

test('myTasks: the person\'s open tasks by default; overdue and week filters', async () => {
  const { run, fx } = setup();
  const open = await run('return await tf.myTasks();');
  assert.ok(open.result.some((t) => t.title === 'Call the supplier'));
  assert.ok(!open.result.some((t) => t.status === 'Done'));
  const overdue = await run("return await tf.myTasks({ due: 'overdue' });");
  assert.deepEqual(overdue.result.map((t) => t.title), ['Call the supplier']);
  const week = await run("return await tf.myTasks({ due: 'week' });");
  assert.ok(week.result.some((t) => t.title === 'Prepare Q4 report'));
  assert.equal(overdue.proposals.length, 0);
  assert.ok(fx.tasks.callSupplier.id);
});

test('createTasks: one proposal per task, done ones dated today, summary in the person\'s language', async () => {
  const { run, fx } = setup();
  const out = await run("return await tf.createTasks([{ title: 'Visit the bank', status: 'Done' }, { title: 'Call Omar', dueDate: 'tomorrow', priority: 'High' }]);", fx.admin.id, 'سجل المهام');
  assert.equal(out.proposals.length, 2);
  const [a, b] = out.proposals;
  assert.equal(a.body.status, 'Done');
  assert.equal(a.body.dueDate, fx.today);
  assert.deepEqual(a.body.assignedUserIds, [fx.admin.id]);
  assert.equal(b.body.dueDate, fx.tomorrow);
  assert.equal(b.body.priority, 'High');
  assert.match(a.summary, /تسجيل مهمة منجزة/);
});

test('updateTask and logTime find the task by title; assignTo finds the person by name', async () => {
  const { run, fx } = setup();
  const upd = await run("return await tf.updateTask({ task: 'prepare q4 report', assignTo: 'Samantha', status: 'In Progress' });");
  assert.equal(upd.proposals.length, 1, JSON.stringify(upd));
  assert.equal(upd.proposals[0].method, 'PUT');
  assert.equal(upd.proposals[0].path, `/tasks/${fx.tasks.q4Report.id}`);
  assert.deepEqual(upd.proposals[0].body, { status: 'In Progress', assignedUserIds: [fx.samantha.id] });
  const time = await run("return await tf.logTime({ task: 'Prepare Q4 report', hours: 2 });");
  assert.equal(time.proposals[0].path, `/tasks/${fx.tasks.q4Report.id}/time-entries`);
  assert.deepEqual(time.proposals[0].body, { hours: 2, spentOn: fx.today });
  const bad = await run("return await tf.updateTask({ task: 'nope', status: 'Done' });");
  assert.match(bad.error, /no task matches "nope"/);
});
