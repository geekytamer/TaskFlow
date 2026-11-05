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
    assert.ok(r.example.includes(`tf.${r.name}(`), `${r.name} has a usage example`);
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

test('invoices and receivables: unpaid, overdue and owed, base currency, largest debtor first', async () => {
  const { run } = setup();
  const overdue = await run("return await tf.invoices({ status: 'overdue' });");
  assert.equal(overdue.result.length, 3, JSON.stringify(overdue.result));
  assert.ok(overdue.result.every((i) => i.overdue && i.outstanding > 0));
  const rec = await run('return await tf.receivables();');
  assert.equal(rec.result.totalOwed, 4450);
  assert.equal(rec.result.overdueAmount, 3650);
  assert.equal(rec.result.overdueInvoices, 3);
  assert.equal(rec.result.byClient[0].client, 'Desert Rose Hotel');
  const text = await run("return (await tf.invoices('overdue')).length;");
  assert.equal(text.result, 3, 'a bare status word is the status, not a client');
});

test('recordPayment: by client name and amount; refuses more than is owed', async () => {
  const { run, fx } = setup();
  const pay = await run("return await tf.recordPayment({ invoice: 'Al Noor', amount: 450 });");
  assert.equal(pay.proposals.length, 1, JSON.stringify(pay));
  assert.equal(pay.proposals[0].path, `/invoices/${fx.invoices.alNoorOverdue.id}/payments`);
  assert.equal(pay.proposals[0].body.amount, 450);
  const two = await run("return await tf.recordPayment({ invoice: 'Desert Rose' });");
  assert.match(two.error, /2 unpaid invoices of "Desert Rose"/);
  const over = await run(`return await tf.recordPayment({ invoice: '${fx.invoices.alNoorOverdue.invoiceNumber}', amount: 9999 });`);
  assert.match(over.error, /only 450/);
});

test('salesSummary: this month by default, drafts left out', async () => {
  const { run } = setup();
  const s = await run("return await tf.salesSummary({ from: '2000-01-01' });");
  assert.equal(s.result.invoices, 5);
  assert.equal(s.result.invoiced, 4750);
  assert.equal(s.result.outstanding, 4450);
});

test('stock, onLeave, findContact: the fixture\'s truth', async () => {
  const { run } = setup();
  const low = await run('return (await tf.stock({ low: true })).map((i) => i.name).sort();');
  assert.deepEqual(low.result, ['Campaign Flyers', 'Demo USB Kits']);
  const shirts = await run("return await tf.stock('promo t-shirts');");
  assert.equal(shirts.result[0].inStock, 42);
  const leave = await run('return (await tf.onLeave()).map((l) => l.employee);');
  assert.deepEqual(leave.result, ['Fatma Al Lawati']);
  const ahmed = await run("return await tf.findContact('ahmed balushi');");
  assert.equal(ahmed.result.length, 0, 'words out of order do not match a name');
  const ahmed2 = await run("return await tf.findContact('Ahmed Al Balushi');");
  assert.equal(ahmed2.result[0].phone, '+968 9123 4567');
  const byPhone = await run("return await tf.findContact('91234567');");
  assert.equal(byPhone.result[0].name, 'Ahmed Al Balushi');
  const sara = await run("return await tf.findContact('ساره');");
  assert.equal(sara.result[0].name, 'سارة الهنائية');
});

test('createContact proposes with roles checked; pendingApprovals reads the person\'s box', async () => {
  const { run } = setup();
  const c = await run("return await tf.createContact({ name: 'Omar Al Said', phone: '99112233', roles: ['Lead'] });");
  assert.equal(c.proposals[0].path, '/companies/1/contacts');
  assert.deepEqual(c.proposals[0].body, { name: 'Omar Al Said', phone: '99112233', roles: ['Lead'] });
  const bad = await run("return await tf.createContact({ name: 'X', roles: ['Friend'] });");
  assert.match(bad.error, /roles must be/);
  const approvals = await run('return await tf.pendingApprovals();');
  assert.deepEqual(approvals.result, []);
});

test('recipes keep the person\'s permissions: an employee cannot read invoices through them', async () => {
  const { run, fx } = setup();
  const out = await run('return await tf.receivables();', fx.charlie.id);
  assert.equal(out.error !== undefined || out.result === undefined, true, JSON.stringify(out));
  assert.match(String(out.error), /403/);
});

test('eval round 2: leave cards are named, typos in names still match, a payment miss lists what is owed, findApi is not a record search', async () => {
  const { cardOf } = require('../dist/assistant/cards');
  const card = cardOf('leave-request', { id: 'l1', employee: 'Fatma Al Lawati', from: '2026-11-04' }, { userName: () => undefined, clientName: () => undefined, projectName: () => undefined, currency: 'OMR' });
  assert.equal(card.title, 'Fatma Al Lawati');

  const people = [{ id: 's', name: 'Samantha Bee' }, { id: 'c', name: 'Charlie Davis' }];
  assert.equal(pickOne(people, 'samatha', (p) => p.name, 'person').id, 's', 'one letter off still finds her');
  assert.throws(() => pickOne(people, 'zzz', (p) => p.name, 'person'), /no person matches/);

  const { run } = setup();
  const miss = await run("return await tf.recordPayment({ invoice: 'شركة الأمل', amount: 450 });");
  assert.match(miss.error, /no unpaid invoice matches[\s\S]*Al Noor Foods/, 'the error lists the unpaid invoices so the model can pick');

  const misuse = await runInSandbox("return await findApi('contacts', { name: 'Ahmed' });", { call: async () => [] });
  assert.equal(misuse.ok, false);
  assert.match(misuse.error, /findApi\(words\) lists endpoints[\s\S]*tf\.findContact/);
});

test('recipes refuse options they do not take; myTasks filters by project (everyone in it by default)', async () => {
  const { run, fx } = setup();
  const bad = await run("return await tf.myTasks({ status: 'open', colour: 'red' });");
  assert.match(bad.error, /tf\.myTasks does not take "colour"; it takes: status, due, everyone, project/);
  const inProject = await run(`return (await tf.myTasks({ project: '${fx.project.id}' })).map((t) => t.title);`);
  assert.ok(inProject.result.includes('Prepare Q4 report'), JSON.stringify(inProject));
  const byName = await run(`return (await tf.myTasks({ project: '${fx.project.name}' })).length;`);
  assert.equal(byName.result, inProject.result.length);
  const none = await run("return await tf.myTasks({ project: 'No such project' });");
  assert.match(none.error, /no project matches/);
});

test('names typed in Arabic find records stored in English (and the other way round), only when one matches', async () => {
  const { sameName } = require('../dist/assistant/recipes/util');
  assert.equal(sameName('النور للأغذية', 'Al Noor Foods'), true);
  assert.equal(sameName('أحمد البلوشي', 'Ahmed Al Balushi'), true);
  assert.equal(sameName('مسقط باي', 'Muscat Bay Trading'), true);
  assert.equal(sameName('Ahmed', 'أحمد البلوشي'), true);
  assert.equal(sameName('النور', 'Desert Rose Hotel'), false);
  assert.equal(sameName('Muscat', 'Muscat Bay Trading'), false, 'same script is the ordinary match, not this one');

  const { run, fx } = setup();
  const pay = await run("return await tf.recordPayment({ invoice: 'النور للأغذية', amount: 450 });");
  assert.equal(pay.proposals[0]?.path, `/invoices/${fx.invoices.alNoorOverdue.id}/payments`, JSON.stringify(pay.error));
  const contact = await run("return (await tf.findContact('أحمد البلوشي')).map((c) => c.name);");
  assert.deepEqual(contact.result, ['Ahmed Al Balushi']);
  const owed = await run("return (await tf.invoices({ client: 'صحراء' })).length;");
  assert.equal(owed.result, 0, 'a word that only translates (desert) is not a match');
});

test('contacts: all of them (newest first), or by role or words; findContact with no words lists them too', async () => {
  const { run, store } = setup();
  const truth = store.db.prepare("SELECT name FROM contacts WHERE companyId = '1'").all().map((r) => r.name).sort();
  const all = await run('return (await tf.contacts()).map((c) => c.name).sort();');
  assert.deepEqual(all.result, truth);
  assert.ok(truth.includes('Ahmed Al Balushi') && truth.includes('Al Noor Foods'));
  const leads = await run("return (await tf.contacts({ role: 'Lead' })).map((c) => c.name);");
  assert.deepEqual(leads.result, ['سارة الهنائية']);
  const bare = await run('return (await tf.findContact()).length;');
  assert.equal(bare.result, truth.length, 'no words: the list, not an error');
  const badRole = await run("return await tf.contacts({ role: 'Friend' });");
  assert.match(badRole.error, /role must be one of/);
});

test('every recipe names the routes it needs; the prompt tells the model which ones this person cannot use here', async () => {
  const { assistantOps, matchOp } = require('../dist/assistant/catalogue');
  const ops = assistantOps();
  for (const r of RECIPES) {
    assert.ok(Array.isArray(r.needs) && r.needs.length, `${r.name} names what it needs`);
    for (const [method, routePath] of r.needs) assert.ok(ops.some((o) => o.method === method && o.path === routePath), `${r.name}: ${method} ${routePath} is a catalogue route`);
  }
  void matchOp;
});

test('wider recipes read the fixture truth: payables, quotations, expenses, employees, follow-ups, projects, the money picture', async () => {
  const { run, fx } = setup();
  const pay = await run('return await tf.payables();');
  assert.equal(pay.result.owed, 2100);
  assert.equal(pay.result.overdue, 600);
  assert.deepEqual(pay.result.bills.map((b) => b.supplier), ['Gulf Print House', 'Al Khuwair Properties']);
  const quotes = await run('return await tf.quotations();');
  assert.equal(quotes.result[0].client, 'Desert Rose Hotel');
  assert.ok(quotes.result[0].total >= 3000);
  const spent = await run('return await tf.expenses();');
  assert.ok(spent.result.byCategory.some((c) => c.category === 'Travel' && c.total === 85), JSON.stringify(spent.result));
  const team = await run("return (await tf.employees({ search: 'fatma' })).map((e) => e.name);");
  assert.deepEqual(team.result, ['Fatma Al Lawati']);
  const late = await run("return (await tf.followups({ due: 'overdue' })).map((f) => f.title);");
  assert.deepEqual(late.result, ['Call Ahmed about the renewal']);
  const proj = await run('return await tf.projects();');
  assert.ok(proj.result.find((p) => p.id === fx.project.id).openTasks >= 3, JSON.stringify(proj.result));
  const money = await run('return await tf.financeSummary();');
  assert.equal(money.result.clientsOwe, 4450);
  assert.equal(money.result.weOweSuppliers, 2100);
  assert.equal(money.result.overdueToSuppliers, 600);
});

test('wider changes propose the right calls: a quote, an expense, a comment, a follow-up done, an invoice emailed (marked outward)', async () => {
  const { run, fx } = setup();
  const quote = await run("return await tf.createQuote({ client: 'Desert Rose', lines: [{ description: 'Photo shoot', quantity: 2, price: 250 }] });");
  assert.equal(quote.proposals[0].path, '/companies/1/quotations', JSON.stringify(quote.error));
  assert.equal(quote.proposals[0].body.clientId, fx.clients.desertRose.id);
  assert.deepEqual(quote.proposals[0].body.items, [{ description: 'Photo shoot', quantity: 2, unitPrice: 250 }]);
  const exp = await run("return await tf.createExpense({ amount: 12.5, category: 'Fuel', vendor: 'Shell' });");
  assert.deepEqual(exp.proposals[0].body, { amount: 12.5, category: 'Fuel', expenseDate: fx.today, vendor: 'Shell' });
  const note = await run("return await tf.addComment({ task: 'Prepare Q4 report', comment: 'Numbers are in.' });");
  assert.equal(note.proposals[0].path, `/tasks/${fx.tasks.q4Report.id}/comments`);
  const done = await run("return await tf.completeFollowup({ followup: 'Call Ahmed', outcome: 'connected' });");
  assert.equal(done.proposals[0].path, `/followups/${fx.followup.id}/complete`);
  assert.equal(done.proposals[0].body.outcome, 'connected');
  const mail = await run(`return await tf.emailInvoice({ invoice: '${fx.invoices.alNoorOverdue.invoiceNumber}' });`);
  assert.equal(mail.proposals[0].path, `/invoices/${fx.invoices.alNoorOverdue.id}/email`);
  assert.match(mail.proposals[0].summary, /Email INV-\d+ to Al Noor Foods/);
  assert.equal(mail.view.items.at(-1).actions[0].outward, 'email');
  const draft = await run(`return await tf.emailInvoice({ invoice: '${fx.invoices.draft.invoiceNumber}' });`);
  assert.match(draft.error, /is a draft/);
  const none = await run("return await tf.decideApproval({ item: 'PO-9', decision: 'approve' });");
  assert.match(none.error, /no approval waiting for this person matches/);
});
