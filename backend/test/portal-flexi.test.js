const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Peak Flexi in the client portal: a client sees their balance, applies for
 * it with papers, and staff are told. Nothing here crosses to another
 * company's contact, and staff details never reach the client.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const PDF64 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-flexi-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const user = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const manager = user('Manager', 'Sara Manager', 'sara@peak.test');
  const admin = user('Admin', 'Ivan Admin', 'ivan@peak.test');
  const employee = user('Employee', 'Eli Employee', 'eli@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: manager.id });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'], ownerUserId: manager.id });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer'] });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();

  const session = async (audience, contact, email, name = email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name,
      role: audience === 'client' ? 'client_admin' : 'influencer', createdByUserId: admin.id,
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  const upload = async (auth, fileName = 'cr.pdf') => {
    const res = await request(server).post('/portal-api/client/files').set(auth).send({ fileName, contentBase64: PDF64 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.id;
  };
  const activate = async (auth) => request(server).post('/portal-api/client/flexi/applications').set(auth)
    .send({ kind: 'activation', crNumber: '1234567', fileIds: [await upload(auth)] });

  return { server, store, company, manager, admin, employee, client, rival, lina, session, upload, activate };
};

test('a client activates with CR and a file; admins and managers are told and a follow-up is raised', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test', 'Omar Al Noor');
  const res = await ctx.activate(omar);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.status, 'new');
  assert.equal(res.body.files.length, 1);

  const told = (u) => ctx.store.listNotifications(u.id).filter((n) => n.title === 'Peak Flexi application: Al Noor Dates');
  assert.equal(told(ctx.manager).length, 1);
  assert.equal(told(ctx.admin).length, 1);
  assert.equal(told(ctx.employee).length, 0);
  assert.equal(told(ctx.manager)[0].link, `/crm/flexi?id=${res.body.id}`);
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { entityType: 'contact', entityId: ctx.client.id });
  assert.equal(followups.length, 1);
});

test('GET shows the open application, then the balance after staff approve', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const empty = await request(ctx.server).get('/portal-api/client/flexi').set(omar);
  assert.equal(empty.status, 200);
  assert.deepEqual([empty.body.balance.enabled, empty.body.open, empty.body.last], [false, null, null]);
  assert.equal('clientId' in empty.body.balance, false);

  const app = (await ctx.activate(omar)).body;
  const pending = await request(ctx.server).get('/portal-api/client/flexi').set(omar);
  assert.equal(pending.body.open.id, app.id);

  ctx.store.flexi.approve(app.id, { amount: 850, reviewNote: 'INTERNAL-NOTE-POISON', reviewerId: ctx.manager.id });
  const ready = await request(ctx.server).get('/portal-api/client/flexi').set(omar);
  assert.equal(ready.body.balance.balance, 850);
  assert.equal(ready.body.balance.available, 850);
  assert.equal(ready.body.open, null);
  assert.equal(ready.body.last.status, 'approved');
  assert.equal(JSON.stringify(ready.body).includes('INTERNAL-NOTE-POISON'), false, 'an approval note stays internal');
});

test('a double submit is refused and makes no second application', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await ctx.activate(omar)).status, 201);
  const again = await ctx.activate(omar);
  assert.equal(again.status, 409);
  assert.equal(ctx.store.flexi.list(ctx.company.id, { contactId: ctx.client.id }).length, 1);
});

test("another company's client cannot withdraw or see the application, or download its papers", async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const huda = await ctx.session('client', ctx.rival, 'huda@sidr.test');
  const app = (await ctx.activate(omar)).body;

  assert.equal((await request(ctx.server).post(`/portal-api/client/flexi/applications/${app.id}/withdraw`).set(huda)).status, 404);
  const theirs = await request(ctx.server).get('/portal-api/client/flexi').set(huda);
  assert.deepEqual([theirs.body.open, theirs.body.last], [null, null]);
  assert.equal((await request(ctx.server).get(`/portal-api/client/files/${app.files[0].id}/content`)).status, 401);
  assert.equal((await request(ctx.server).get(`/portal-api/client/files/${app.files[0].id}/content`).set(huda)).status, 404);
  assert.equal((await request(ctx.server).get(`/portal-api/client/files/${app.files[0].id}/content`).set(omar)).status, 200, 'the owner can');

  const withdrawn = await request(ctx.server).post(`/portal-api/client/flexi/applications/${app.id}/withdraw`).set(omar);
  assert.equal(withdrawn.body.status, 'withdrawn');
});

test('an influencer cannot reach the client Flexi routes', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const res = await request(ctx.server).get('/portal-api/client/flexi').set(lina);
  assert.ok([401, 403].includes(res.status), String(res.status));
});

test('the client never sees who decided or internal fields', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const app = (await ctx.activate(omar)).body;
  ctx.store.flexi.reject(app.id, { reviewNote: 'Please send a clearer CR copy', reviewerId: ctx.manager.id });
  const res = await request(ctx.server).get('/portal-api/client/flexi').set(omar);
  assert.equal(res.body.last.reviewNote, 'Please send a clearer CR copy');
  const text = JSON.stringify(res.body);
  for (const leak of ['createdBy', 'reviewedBy', ctx.manager.id, 'sara@peak.test', 'crNumber']) {
    assert.equal(text.includes(leak), false, leak);
  }
});
