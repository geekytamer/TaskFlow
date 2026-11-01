const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The Peak Flexi section in TaskFlow: overview, accounts with their controls,
 * campaign requests against the balance, website leads, and settings.
 * Reviewers see it; only Admins and Accountants change accounts or settings.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-flexi-section-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Agency', website: '', address: '' });
  const user = (role, name, email, companyId = company.id) => store.createUser({
    name, email, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }],
  });
  const admin = user('Admin', 'Ivan Admin', 'ivan@peak.test');
  const manager = user('Manager', 'Sara Manager', 'sara@peak.test');
  const accountant = user('Accountant', 'Layla Accountant', 'layla@peak.test');
  const employee = user('Employee', 'Eli Employee', 'eli@peak.test');
  const outsider = user('Admin', 'Omar Outsider', 'omar@other.test', other.id);
  const sent = [];
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy', portalCompanyId: company.id,
    sendPortalInvite: async (msg) => { sent.push(msg); return { sent: true }; },
  }).listen(0);
  server.unref();
  const as = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const client = (name) => store.createContact({ companyId: company.id, kind: 'Organization', name, roles: ['Client'], ownerUserId: manager.id });
  const file = (contactId) => store.thread.addFile({ companyId: company.id, contactId, uploader: { kind: 'portal', portalUserId: 'pu-1' }, fileName: 'cr.pdf', mimeType: 'application/pdf', content: PDF }).id;
  const apply = (contactId) => store.flexi.submit({ companyId: company.id, contactId, kind: 'activation', crNumber: '123', fileIds: [file(contactId)], createdBy: 'pu-1', termsVersion: 1 });
  const enable = (contactId, amount = 850) => store.flexi.approve(apply(contactId).id, { amount, reviewerId: manager.id });
  const base = `/companies/${company.id}/flexi`;
  return { server, store, company, other, admin, manager, accountant, employee, outsider, sent, as, client, file, apply, enable, base };
};

const request_ = (ctx, contactId, budget, payWith = 'full', title = 'Launch') => {
  const opportunity = ctx.store.createOpportunity({ companyId: ctx.company.id, contactId, title, stage: 'New', serviceType: 'Influencer campaign', expectedRevenue: budget ?? 0 });
  return ctx.store.requests.create({ companyId: ctx.company.id, contactId, portalUserId: 'pu-1', title, objective: 'A launch campaign for our new branch.', budget, startDate: null, endDate: null, platforms: [], influencerIds: [], opportunityId: opportunity.id, payWith });
};

test('overview: totals, and each alert kind', async () => {
  const ctx = build();
  const a = ctx.client('Al Noor Dates');
  const b = ctx.client('Sidr Honey');
  const c = ctx.client('Waves Gym');
  ctx.enable(a.id, 1000);
  ctx.enable(b.id, 500);
  ctx.store.flexi.freeze(b.id, { reason: 'Late', userId: ctx.admin.id });
  const stale = ctx.apply(c.id);
  ctx.store.db.prepare('UPDATE flexi_applications SET createdAt = ? WHERE id = ?').run(new Date(Date.now() - 3 * 86400000).toISOString(), stale.id);
  // a used 900 of 1000 through an open invoice
  const clientId = ctx.store.getContactById(a.id).clientId;
  const inv = await request(ctx.server).post('/invoices').set(ctx.as(ctx.admin)).send({
    companyId: ctx.company.id, clientId, issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'Sent', taxRate: 0, lineItems: [{ itemType: 'Manual', description: 'Reel', quantity: 1, unitPrice: 900, amount: 900 }],
  });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  request_(ctx, a.id, 400, 'flexi', 'Ramadan');

  const res = await request(ctx.server).get(`${ctx.base}/overview`).set(ctx.as(ctx.manager));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.totals, { balance: 1500, used: 900, available: 100, active: 1, frozen: 1, waiting: 1 });
  assert.deepEqual(res.body.alerts.staleApplications.map((x) => x.contactName), ['Waves Gym']);
  assert.deepEqual(res.body.alerts.nearLimit.map((x) => x.name), ['Al Noor Dates']);
  assert.deepEqual(res.body.alerts.frozen.map((x) => x.name), ['Sidr Honey']);
  assert.deepEqual(res.body.alerts.overBudgetRequests.map((x) => x.title), ['Ramadan']);
});

test('accounts: list, filter, and the account file', async () => {
  const ctx = build();
  const a = ctx.client('Al Noor Dates');
  const b = ctx.client('Sidr Honey');
  ctx.enable(a.id, 1000);
  ctx.enable(b.id, 500);
  ctx.store.flexi.freeze(b.id, { reason: 'Late', userId: ctx.admin.id });
  request_(ctx, a.id, 300, 'flexi');

  const all = await request(ctx.server).get(`${ctx.base}/accounts`).set(ctx.as(ctx.manager));
  assert.deepEqual(all.body.map((x) => [x.name, x.state, x.balance]).sort(), [['Al Noor Dates', 'active', 1000], ['Sidr Honey', 'frozen', 500]]);
  assert.ok(all.body[0].since);
  assert.equal(all.body[0].currency, 'USD');
  const frozen = await request(ctx.server).get(`${ctx.base}/accounts?state=frozen`).set(ctx.as(ctx.manager));
  assert.deepEqual(frozen.body.map((x) => x.name), ['Sidr Honey']);

  const file = await request(ctx.server).get(`${ctx.base}/accounts/${a.id}`).set(ctx.as(ctx.manager));
  assert.equal(file.status, 200);
  assert.equal(file.body.account.name, 'Al Noor Dates');
  assert.ok(file.body.events.some((e) => e.kind === 'approved'));
  assert.equal(file.body.applications.length, 1);
  assert.deepEqual(file.body.requests.map((r) => r.budget), [300]);
  assert.deepEqual(file.body.openInvoices, []);
});

test('account actions: a manager is refused; an accountant and an admin can; a reason is required', async () => {
  const ctx = build();
  const a = ctx.client('Al Noor Dates');
  ctx.enable(a.id);
  const url = (action) => `${ctx.base}/accounts/${a.id}/${action}`;
  assert.equal((await request(ctx.server).post(url('freeze')).set(ctx.as(ctx.manager)).send({ reason: 'Late' })).status, 403);
  assert.equal((await request(ctx.server).post(url('freeze')).set(ctx.as(ctx.accountant)).send({})).status, 400);
  const frozen = await request(ctx.server).post(url('freeze')).set(ctx.as(ctx.accountant)).send({ reason: 'Late' });
  assert.equal(frozen.status, 200, JSON.stringify(frozen.body));
  assert.equal(frozen.body.state, 'frozen');
  assert.equal((await request(ctx.server).post(url('unfreeze')).set(ctx.as(ctx.admin)).send({ reason: 'Paid' })).body.state, 'active');
  const adjusted = await request(ctx.server).post(url('adjust')).set(ctx.as(ctx.admin)).send({ amount: 2000, reason: 'Good payer' });
  assert.equal(adjusted.body.balance, 2000);
  assert.equal((await request(ctx.server).post(url('adjust')).set(ctx.as(ctx.admin)).send({ amount: 0, reason: 'x' })).status, 400);
  assert.equal((await request(ctx.server).post(url('close')).set(ctx.as(ctx.admin)).send({ reason: 'Asked to close' })).body.state, 'closed');
  assert.equal((await request(ctx.server).post(url('freeze')).set(ctx.as(ctx.admin)).send({ reason: 'x' })).status, 409);
});

test('campaign requests are flagged against the balance', async () => {
  const ctx = build();
  const a = ctx.client('Al Noor Dates');
  const b = ctx.client('Sidr Honey');
  const c = ctx.client('Plain Client');
  ctx.enable(a.id, 1000);
  request_(ctx, a.id, 400, 'flexi', 'Fits');
  request_(ctx, a.id, 5000, 'flexi', 'Too big');
  request_(ctx, b.id, 300, 'flexi', 'No account');
  request_(ctx, c.id, 300, 'full', 'Cash, no account');
  const res = await request(ctx.server).get(`${ctx.base}/requests`).set(ctx.as(ctx.manager));
  const byTitle = Object.fromEntries(res.body.map((r) => [r.title, r.flag]));
  assert.deepEqual(byTitle, { Fits: null, 'Too big': 'over_budget', 'No account': 'no_account' });
  assert.equal(res.body.find((r) => r.title === 'Fits').available, 1000);
});

test('leads: website applicants without a portal account; invite adds the Client role and a portal user', async () => {
  const ctx = build();
  const mk = (name, email) => ctx.store.createContact({
    companyId: ctx.company.id, kind: 'Organization', name, email, contactPerson: 'Salim', phone: '+968 9123 4567', roles: ['Lead'], tags: ['portal-signup', 'peak-flexi'],
    notes: 'Role: Business owner\nCommercial registration: 1234567\nServices wanted: Influencer campaigns, Design and branding',
  });
  const withEmail = mk('Sidr Coffee', 'salim@sidr.test');
  const noEmail = mk('Quiet Bakery', undefined);
  ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Other Lead', roles: ['Lead'], tags: ['portal-signup'] });

  const list = await request(ctx.server).get(`${ctx.base}/leads`).set(ctx.as(ctx.manager));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((l) => l.company).sort(), ['Quiet Bakery', 'Sidr Coffee']);
  const sidr = list.body.find((l) => l.company === 'Sidr Coffee');
  assert.deepEqual([sidr.crNumber, sidr.services, sidr.role], ['1234567', 'Influencer campaigns, Design and branding', 'Business owner']);

  assert.equal((await request(ctx.server).post(`${ctx.base}/leads/${withEmail.id}/invite`).set(ctx.as(ctx.manager))).status, 403);
  assert.equal((await request(ctx.server).post(`${ctx.base}/leads/${noEmail.id}/invite`).set(ctx.as(ctx.admin))).status, 400);
  const invited = await request(ctx.server).post(`${ctx.base}/leads/${withEmail.id}/invite`).set(ctx.as(ctx.admin));
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  assert.ok(ctx.store.getContactById(withEmail.id).roles.includes('Client'));
  assert.equal(ctx.store.portal.listUsers(ctx.company.id, { contactId: withEmail.id }).length, 1);
  assert.equal(ctx.sent.length, 1);
  const after = await request(ctx.server).get(`${ctx.base}/leads`).set(ctx.as(ctx.manager));
  assert.deepEqual(after.body.map((l) => l.company), ['Quiet Bakery']);
});

test('settings: reviewers read, only managers of Flexi save, terms bump the version', async () => {
  const ctx = build();
  const got = await request(ctx.server).get(`${ctx.base}/settings`).set(ctx.as(ctx.manager));
  assert.equal(got.status, 200);
  assert.equal(got.body.standardAmount, 850);
  assert.equal((await request(ctx.server).put(`${ctx.base}/settings`).set(ctx.as(ctx.manager)).send({ standardAmount: 900 })).status, 403);
  const saved = await request(ctx.server).put(`${ctx.base}/settings`).set(ctx.as(ctx.accountant)).send({ standardAmount: 900, termsEn: 'New terms.' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual([saved.body.standardAmount, saved.body.termsVersion], [900, 2]);
  assert.equal((await request(ctx.server).put(`${ctx.base}/settings`).set(ctx.as(ctx.admin)).send({ allowedMonths: [] })).status, 400);
});

test("another company's contact ids give 404 on every account and lead route; an employee gets 403", async () => {
  const ctx = build();
  const a = ctx.client('Al Noor Dates');
  ctx.enable(a.id);
  const theirs = `/companies/${ctx.other.id}/flexi`;
  for (const [method, url] of [['get', `${theirs}/accounts/${a.id}`], ['post', `${theirs}/accounts/${a.id}/freeze`], ['post', `${theirs}/leads/${a.id}/invite`]]) {
    const res = await request(ctx.server)[method](url).set(ctx.as(ctx.outsider)).send({ reason: 'x' });
    assert.equal(res.status, 404, url);
  }
  assert.equal(ctx.store.flexi.balanceOf(a.id).state, 'active');
  for (const url of ['overview', 'accounts', 'requests', 'leads', 'settings']) {
    assert.equal((await request(ctx.server).get(`${ctx.base}/${url}`).set(ctx.as(ctx.employee))).status, 403, url);
  }
});

test('client requests carry the pay choice and the Flexi balance check', async () => {
  const ctx = build();
  const a = ctx.client('Al Noor Dates');
  const b = ctx.client('Plain Client');
  ctx.enable(a.id, 1000);
  request_(ctx, a.id, 5000, 'flexi', 'Too big');
  request_(ctx, b.id, 300, 'flexi', 'No account');
  request_(ctx, b.id, 300, 'full', 'Cash');
  const res = await request(ctx.server).get(`/companies/${ctx.company.id}/portal-requests`).set(ctx.as(ctx.manager));
  assert.equal(res.status, 200);
  const byTitle = Object.fromEntries(res.body.map((r) => [r.title, r]));
  assert.deepEqual([byTitle['Too big'].payWith, byTitle['Too big'].flexi], ['flexi', { state: 'active', available: 1000, flag: 'over_budget' }]);
  assert.deepEqual(byTitle['No account'].flexi, { state: null, available: 0, flag: 'no_account' });
  assert.deepEqual([byTitle.Cash.payWith, byTitle.Cash.flexi], ['full', { state: null, available: 0, flag: null }]);
});
