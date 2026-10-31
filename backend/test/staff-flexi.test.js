const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Staff review Peak Flexi applications in TaskFlow: approve with a balance
 * and terms, or reject with a reason. Only Admins, Managers and Accountants
 * may, and the client hears the decision in their portal conversation.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-staff-flexi-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Agency', website: '', address: '' });
  const user = (role, name, email, companyId = company.id) => store.createUser({
    name, email, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }],
  });
  const manager = user('Manager', 'Sara Manager', 'sara@peak.test');
  const accountant = user('Accountant', 'Layla Accountant', 'layla@peak.test');
  const employee = user('Employee', 'Eli Employee', 'eli@peak.test');
  const outsider = user('Admin', 'Omar Outsider', 'omar@other.test', other.id);
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: manager.id });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy', portalCompanyId: company.id,
  }).listen(0);
  server.unref();
  const as = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const file = (name = 'cr.pdf') => store.thread.addFile({
    companyId: company.id, contactId: client.id, uploader: { kind: 'portal', portalUserId: 'pu-1' }, fileName: name, mimeType: 'application/pdf', content: PDF,
  }).id;
  const apply = () => store.flexi.submit({ companyId: company.id, contactId: client.id, kind: 'activation', crNumber: '1234567', fileIds: [file()], createdBy: 'pu-1' });
  const base = `/companies/${company.id}/flexi-applications`;
  return { server, store, company, manager, accountant, employee, outsider, client, as, apply, file, base };
};

test('a manager approves with 850 and the client is told in their portal conversation', async () => {
  const ctx = build();
  const app = ctx.apply();
  const list = await request(ctx.server).get(`${ctx.base}?status=new`).set(ctx.as(ctx.manager));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].contactName, 'Al Noor Dates');
  assert.equal(list.body[0].files.length, 1);

  const res = await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'approved');
  assert.equal(ctx.store.flexi.balanceOf(ctx.client.id).balance, 850);

  const thread = ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id);
  const last = ctx.store.conversations.messages(thread.id).at(-1);
  assert.match(last.body, /850/);
  assert.deepEqual([last.authorType, last.visibility, last.authorUserId], ['staff', 'external', ctx.manager.id]);
});

test('an amount that is zero, negative, text or missing is refused and nothing changes', async () => {
  const ctx = build();
  const app = ctx.apply();
  for (const body of [{ amount: 0 }, { amount: -5 }, { amount: 'abc' }, {}, { amount: 850, maxMonths: 0 }, { amount: 850, upfrontPct: 120 }]) {
    const res = await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(ctx.store.flexi.get(app.id).status, 'new');
  assert.equal(ctx.store.flexi.balanceOf(ctx.client.id).enabled, false);
});

test('rejecting needs a reason, and the client hears it', async () => {
  const ctx = build();
  const app = ctx.apply();
  assert.equal((await request(ctx.server).post(`${ctx.base}/${app.id}/reject`).set(ctx.as(ctx.manager)).send({})).status, 400);
  const res = await request(ctx.server).post(`${ctx.base}/${app.id}/reject`).set(ctx.as(ctx.manager)).send({ reviewNote: 'The CR copy is unreadable' });
  assert.equal(res.status, 200);
  const thread = ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id);
  assert.match(ctx.store.conversations.messages(thread.id).at(-1).body, /The CR copy is unreadable/);
});

test('an employee gets 403, an accountant can approve, another company gets 403', async () => {
  const ctx = build();
  const app = ctx.apply();
  assert.equal((await request(ctx.server).get(ctx.base).set(ctx.as(ctx.employee))).status, 403);
  assert.equal((await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.employee)).send({ amount: 850 })).status, 403);
  assert.equal((await request(ctx.server).get(ctx.base).set(ctx.as(ctx.outsider))).status, 403);
  assert.equal((await request(ctx.server).get(ctx.base)).status, 401);
  const ok = await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.accountant)).send({ amount: 600, upfrontPct: 35, maxMonths: 3 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.approvedAmount, ok.body.upfrontPct, ok.body.maxMonths], [600, 35, 3]);
});

test('approving twice is refused', async () => {
  const ctx = build();
  const app = ctx.apply();
  await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850 });
  const again = await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 5000 });
  assert.equal(again.status, 409);
  assert.equal(ctx.store.flexi.balanceOf(ctx.client.id).balance, 850);
});

test('the contact summary returns the balance and the history, and papers download for reviewers only', async () => {
  const ctx = build();
  const app = ctx.apply();
  await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850 });
  const res = await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/flexi`).set(ctx.as(ctx.accountant));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.balance.balance, res.body.balance.available, res.body.applications.length], [850, 850, 1]);
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/flexi`).set(ctx.as(ctx.employee))).status, 403);

  const fileId = res.body.applications[0].files[0].id;
  const url = `${ctx.base}/${app.id}/files/${fileId}/content`;
  assert.equal((await request(ctx.server).get(url).set(ctx.as(ctx.accountant))).status, 200);
  assert.equal((await request(ctx.server).get(url).set(ctx.as(ctx.employee))).status, 403);
  const stray = ctx.file('other.pdf');
  assert.equal((await request(ctx.server).get(`${ctx.base}/${app.id}/files/${stray}/content`).set(ctx.as(ctx.accountant))).status, 404, 'a file not on this application');
});

test('decisions are recorded on the contact activity with the reviewer', async () => {
  const ctx = build();
  const app = ctx.apply();
  await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850 });
  const events = ctx.store.listActivityEvents(ctx.company.id, { entityType: 'contact', entityId: ctx.client.id });
  const approved = events.find((e) => e.action === 'flexi_approved');
  assert.ok(approved);
  assert.equal(approved.actorUserId, ctx.manager.id);
});

test('a decision or a withdrawal closes the review follow-up', async () => {
  const ctx = build();
  const omarSession = async () => {
    const { token } = ctx.store.portal.inviteUser({ companyId: ctx.company.id, audience: 'client', contactId: ctx.client.id, email: 'omar@alnoor.test', name: 'Omar', role: 'client_admin', createdByUserId: ctx.manager.id });
    ctx.store.portal.acceptInvitation(token, 'correct horse battery');
    const res = await request(ctx.server).post('/portal-api/client/auth/login').send({ email: 'omar@alnoor.test', password: 'correct horse battery' });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  const omar = await omarSession();
  const fileId = (await request(ctx.server).post('/portal-api/client/files').set(omar).send({ fileName: 'cr.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64') })).body.id;
  const active = () => ctx.store.listFollowupEntities(ctx.company.id, { status: 'active', entityType: 'contact', entityId: ctx.client.id });
  const first = (await request(ctx.server).post('/portal-api/client/flexi/applications').set(omar).send({ kind: 'activation', crNumber: '1', fileIds: [fileId] })).body;
  assert.equal(active().length, 1);
  await request(ctx.server).post(`/portal-api/client/flexi/applications/${first.id}/withdraw`).set(omar);
  assert.equal(active().length, 0, 'withdrawn');

  const fileId2 = (await request(ctx.server).post('/portal-api/client/files').set(omar).send({ fileName: 'cr2.pdf', contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64') })).body.id;
  const second = (await request(ctx.server).post('/portal-api/client/flexi/applications').set(omar).send({ kind: 'activation', crNumber: '1', fileIds: [fileId2] })).body;
  assert.equal(active().length, 1);
  await request(ctx.server).post(`${ctx.base}/${second.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850 });
  assert.equal(active().length, 0, 'approved');
});

test('a blank or text down payment is refused instead of becoming 0%', async () => {
  const ctx = build();
  const app = ctx.apply();
  for (const upfrontPct of ['', '35', 'abc']) {
    assert.equal((await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850, upfrontPct })).status, 400, JSON.stringify(upfrontPct));
  }
  assert.equal((await request(ctx.server).post(`${ctx.base}/${app.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850, maxMonths: '6' })).status, 400);
  assert.equal(ctx.store.flexi.get(app.id).status, 'new');
});

test('an application carries the client current terms, so an increase can keep them', async () => {
  const ctx = build();
  const first = ctx.apply();
  await request(ctx.server).post(`${ctx.base}/${first.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 850, upfrontPct: 35, maxMonths: 6 });
  const inc = ctx.store.flexi.submit({ companyId: ctx.company.id, contactId: ctx.client.id, kind: 'increase', requestedAmount: 3000, fileIds: [ctx.file('s.pdf'), ctx.file('v.pdf')], createdBy: 'pu-1' });
  const res = await request(ctx.server).get(`${ctx.base}/${inc.id}`).set(ctx.as(ctx.manager));
  assert.deepEqual(res.body.currentTerms, { upfrontPct: 35, maxMonths: 6 });
  await request(ctx.server).post(`${ctx.base}/${inc.id}/approve`).set(ctx.as(ctx.manager)).send({ amount: 3000 });
  assert.equal(ctx.store.flexi.balanceOf(ctx.client.id).upfrontPct, 35, 'omitted terms keep the current down payment');
});

test("an admin of another company cannot open, decide or download this company's application through their own company", async () => {
  const ctx = build();
  const app = ctx.apply();
  const theirs = `/companies/${ctx.outsider.companyIds[0]}/flexi-applications/${app.id}`;
  const fileId = ctx.store.thread.filesOf('flexi_application', app.id)[0].id;
  assert.equal((await request(ctx.server).get(theirs).set(ctx.as(ctx.outsider))).status, 404);
  assert.equal((await request(ctx.server).post(`${theirs}/approve`).set(ctx.as(ctx.outsider)).send({ amount: 5000 })).status, 404);
  assert.equal((await request(ctx.server).get(`${theirs}/files/${fileId}/content`).set(ctx.as(ctx.outsider))).status, 404);
  assert.equal(ctx.store.flexi.get(app.id).status, 'new');
});
