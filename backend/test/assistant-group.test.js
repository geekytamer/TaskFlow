const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');
const { seedFixture } = require('../eval/assistant/fixture');

/**
 * The assistant over a whole group: reads cover every company of the group the
 * person can open (each under its own permissions), changes name their company,
 * and a company the person cannot open is never read or named.
 */
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-assistant-group-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const fx = seedFixture(store, new Date().toISOString().slice(0, 10));
  const group = fx.group;
  const steps = [];
  const chat = async () => (steps.shift() ?? (() => ({ content: 'ok' })))();
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, assistant: { chat, modelName: 'test-model' } }).listen(0);
  app.unref();
  /** One script in a conversation (scope 'group' over the group by default); its result and proposals. */
  const run = async (code, { who = fx.admin.id, companyId = group.id, scope = 'group' } = {}) => {
    steps.push(() => ({ content: `\`\`\`js\n${code}\n\`\`\`` }), () => ({ content: 'ok' }));
    const res = await request(app).post('/assistant/chat').set('Authorization', `Bearer ${store.issueToken(who)}`).send({ companyId, scope, message: 'do it' });
    if (res.status !== 200) return { status: res.status, body: res.body };
    const thread = store.getAssistantThread(res.body.id);
    const resultMsg = thread.messages.find((m) => m.role === 'user' && /^Result of your code:/.test(m.content));
    return { status: 200, ...JSON.parse(resultMsg.content.replace(/^Result of your code:\n/, '')), proposals: store.listAssistantActions(res.body.id), thread };
  };
  return { store, fx, group, run, app };
}

test('group mode opens only on a group, for someone who can open it', async () => {
  const { run, fx } = setup();
  const notGroup = await run('return 1;', { companyId: '1' });
  assert.equal(notGroup.status, 400);
  assert.match(notGroup.body.message, /not a group/);
  const outsider = await run('return 1;', { who: fx.charlie.id });
  assert.equal(outsider.status, 403);
});

test('reads cover the whole group: rows say their company; summaries come per company with totals per currency', async () => {
  const { run } = setup();
  const tasks = await run('return (await tf.myTasks({ everyone: true })).map((t) => t.company);');
  assert.ok(tasks.result.includes('Innovate Corp'), JSON.stringify(tasks));
  const rec = await run('return await tf.receivables();');
  const innovate = rec.result.companies.find((c) => c.company === 'Innovate Corp');
  assert.equal(innovate.totalOwed, 4450);
  const currency = innovate.currency;
  const total = rec.result.companies.filter((c) => c.currency === currency).reduce((s, c) => s + c.totalOwed, 0);
  assert.equal(rec.result.totalsByCurrency[currency].totalOwed, total);
  assert.ok(rec.thread.messages[0].content, 'asked');
});

test('a change in the whole group names its company; without it the companies are listed; with it the card says which', async () => {
  const { run } = setup();
  const missing = await run("return await tf.createTasks([{ title: 'Call the bank' }]);");
  assert.match(missing.error, /say which company[\s\S]*Innovate Corp/);
  assert.equal(missing.proposals.length, 0);
  const named = await run("return await tf.createTasks({ company: 'Innovate', tasks: [{ title: 'Call the bank' }] });");
  assert.equal(named.proposals.length, 1, JSON.stringify(named.error));
  assert.equal(named.proposals[0].body.companyId, '1');
  assert.equal(named.proposals[0].companyId, '1');
  assert.match(named.proposals[0].summary, /^Innovate Corp — Create the task: Call the bank/);
});

test('coverage is the person\'s: a company of the group they cannot open is never read or named; nor written to by a raw call', async () => {
  const { store, run, fx, group } = setup();
  // Samantha manages Innovate Corp and is made an Admin of the group, but is not a member of Synergy Solutions.
  store.addCompanyMembership(fx.samantha.id, group.id, 'Admin');
  const covered = await run('return COMPANIES.map((c) => c.name);', { who: fx.samantha.id });
  assert.equal(covered.status, 200, JSON.stringify(covered));
  assert.ok(!covered.result.includes('Synergy Solutions'), JSON.stringify(covered.result));
  assert.ok(covered.result.includes('Innovate Corp'));
  const raw = await run("return await api.post('/tasks', { title: 'x', companyId: '2', priority: 'Low' }, 'x');", { who: fx.samantha.id });
  assert.match(raw.error, /not part of this conversation/);
  const rawRead = await run("return await api.get('/companies/2/contacts');", { who: fx.samantha.id });
  assert.match(rawRead.error, /not part of this conversation/);
});

test('a company conversation stays in its company: another company\'s records are not read from it', async () => {
  const { run } = setup();
  const other = await run("return await api.get('/companies/2/contacts');", { companyId: '1', scope: 'company' });
  assert.match(other.error, /not part of this conversation[\s\S]*switch/);
});

test('review fixes: a member company that switched the assistant off is left out; raw reads stay inside the conversation', async () => {
  const { store, run, fx } = setup();
  const otherProject = store.listProjects().find((p) => p.companyId === '2');
  const synergyTask = store.createTask({ title: 'Synergy only task', description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: '2', projectId: otherProject.id, assignedUserIds: [fx.admin.id], ownerId: fx.admin.id });
  store.saveAssistantSettings('2', { enabled: false }, fx.admin.id);
  const covered = await run('return COMPANIES.map((c) => c.name);');
  assert.ok(!covered.result.includes('Synergy Solutions'), 'its own setting wins over the group');
  const list = await run("return (await api.get('/tasks?companyId=1')).map((t) => t.title);", { companyId: '1', scope: 'company' });
  assert.ok(!list.result.includes('Synergy only task'), 'rows of another company are left out of a raw list');
  const one = await run(`return await api.get('/tasks/${synergyTask.id}');`, { companyId: '1', scope: 'company' });
  assert.match(one.error, /not part of this conversation/);
});

test('lookup() of a person comes with their phone and email (from the contacts the person may read)', async () => {
  const { run } = setup();
  const r = await run("return (await lookup('Ahmed Al Balushi')).filter((f) => f.kind === 'contact');", { companyId: '1', scope: 'company' });
  assert.equal(r.result[0].phone, '+968 9123 4567', JSON.stringify(r));
});

test('a script that returns nothing after a helper is told the helper\'s real field names', async () => {
  const { run } = setup();
  const r = await run('const r = await tf.receivables(); return r.byClient[0].name;', { companyId: '1', scope: 'company' });
  assert.match(r.logs.join('\n'), /a field you used may not exist[\s\S]*tf\.receivables → [\s\S]*byClient/);
});

test('whole group: a read for one named company answers as that company; a company named on each item of a change is taken from there', async () => {
  const { run } = setup();
  const one = await run("const r = await tf.receivables({ company: 'Innovate Corp' }); return { owed: r.totalOwed, company: r.company };");
  assert.deepEqual(one.result, { owed: 4450, company: 'Innovate Corp' }, JSON.stringify(one));
  const items = await run("return await tf.createTasks([{ title: 'Call the bank', company: 'Innovate Corp' }, { title: 'Pay rent', company: 'Synergy' }]);");
  assert.equal(items.proposals.length, 2, JSON.stringify(items.error));
  assert.deepEqual(items.proposals.map((p) => p.companyId).sort(), ['1', '2']);
  assert.ok(items.proposals.every((p) => !('company' in p.body)), 'the company name is not sent to the endpoint');
  const mixed = await run("return await tf.createTasks([{ title: 'A', company: 'Innovate Corp' }, { title: 'B' }]);");
  assert.match(mixed.error, /say which company/);
  assert.equal(mixed.proposals.length, 0);
});

test('lookup() finds a person typed in the other script (أحمد البلوشي → Ahmed Al Balushi), with their phone', async () => {
  const { run } = setup();
  const r = await run("return (await lookup('أحمد البلوشي')).filter((f) => f.kind === 'contact').map((f) => [f.title, f.phone]);", { companyId: '1', scope: 'company' });
  assert.deepEqual(r.result, [['Ahmed Al Balushi', '+968 9123 4567']], JSON.stringify(r));
});

test('a helper list read as one record (fields all missing) is pointed out even when cards were shown', async () => {
  const { run } = setup();
  const r = await run("const item = await tf.stock({ item: 'promo' }); await show(item); return { inStock: item?.inStock, unit: item?.unit };", { companyId: '1', scope: 'company' });
  assert.match(r.logs.join('\n'), /a field you used may not exist[\s\S]*tf\.stock → /);
});
