const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** Opportunities could only be archived (stage Cancelled); `?permanent=1` removes one for good. */
const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-opp-delete-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy', logger: { info() {}, warn() {}, error() {} } }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const employee = store.createUser({
    name: 'Emp', email: 'emp@opp-delete.test', role: 'Employee', password: 'password',
    companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }],
  });
  const as = (user) => (req) => req.set('Authorization', `Bearer ${store.issueToken(user.id)}`);
  const contact = (await as(admin)(request(app).post('/companies/1/contacts')).send({ name: 'Delete Co', roles: ['Lead'] })).body;
  const newOpp = async (title = 'Deal') =>
    (await as(admin)(request(app).post('/companies/1/opportunities')).send({ contactId: contact.id, title, serviceType: 'Web' })).body;
  return { store, app, admin, employee, as, contact, newOpp };
};

test('permanent delete removes the opportunity, its draft proposals and its follow-ups', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  await ctx.as(ctx.admin)(request(ctx.app).patch(`/opportunities/${opp.id}/stage`)).send({ stage: 'Proposal' });
  const draft = ctx.store.createCrmProposal({ companyId: '1', opportunityId: opp.id, title: 'Draft', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] });
  const left = (sql, n = 1) => ctx.store.db.prepare(sql).get(...Array(n).fill(opp.id)).n;
  const followUps = "SELECT COUNT(*) AS n FROM follow_ups WHERE (entityType = 'opportunity' AND entityId = ?) OR (sourceType = 'opportunity' AND sourceId = ?)";
  const contributions = "SELECT COUNT(*) AS n FROM contributions WHERE sourceType = 'opportunity' AND sourceId = ?";
  assert.ok(left(followUps, 2) > 0 && left(contributions) > 0, 'fixture: the stage move made a follow-up and the owner a contribution');
  const res = await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`));
  assert.equal(res.status, 204, JSON.stringify(res.body));
  assert.equal(ctx.store.getOpportunityById(opp.id), undefined);
  assert.equal((await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`))).status, 404, 'gone: a second delete finds nothing');
  assert.equal(ctx.store.getCrmProposalById(draft.id), undefined, 'draft proposal went with it');
  assert.equal(left(followUps, 2), 0);
  assert.equal(left(contributions), 0);
});

test('permanent delete is refused with 409 when a commission depends on it', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  ctx.store.db.prepare(
    `INSERT INTO commissions (id, companyId, opportunityId, contactId, serviceType, basis, basisAmount, amount, status, calculatedAt)
     VALUES ('c1', '1', ?, ?, 'Web', 'Revenue', 100, 10, 'Pending', ?)`,
  ).run(opp.id, ctx.contact.id, new Date().toISOString());
  const res = await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`));
  assert.equal(res.status, 409);
  assert.match(res.body.message, /1 commission/);
  assert.deepEqual(res.body.dependents, { commissions: 1 }, 'machine-readable, so the app can say it in Arabic');
  assert.ok(ctx.store.getOpportunityById(opp.id), 'still there');
});

test('an accepted proposal also blocks permanent delete', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  ctx.store.createCrmProposal({ companyId: '1', opportunityId: opp.id, title: 'Signed', status: 'Accepted', items: [{ description: 'x', quantity: 1, unitPrice: 10 }] });
  const res = await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`));
  assert.equal(res.status, 409);
  assert.match(res.body.message, /accepted proposal/);
  assert.deepEqual(res.body.dependents, { acceptedProposals: 1 });
});

test('a won opportunity that became a sales order is refused: its sales contributions credit that order', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  ctx.store.updateOpportunity(opp.id, { wonSalesOrderId: 'so-1' });
  const res = await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`));
  assert.equal(res.status, 409);
  assert.match(res.body.message, /sales order/);
  assert.deepEqual(res.body.dependents, { wonSalesOrder: 1 });
  assert.ok(ctx.store.getOpportunityById(opp.id));
});

test('other failures while deleting are server errors, not 409', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  const original = ctx.store.deleteOpportunity;
  ctx.store.deleteOpportunity = () => { throw new Error('disk on fire'); };
  try {
    const res = await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`));
    assert.equal(res.status, 500);
  } finally {
    ctx.store.deleteOpportunity = original;
  }
});

test('an employee cannot delete someone else\'s opportunity', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  const res = await ctx.as(ctx.employee)(request(ctx.app).delete(`/opportunities/${opp.id}?permanent=1`));
  assert.equal(res.status, 403);
  assert.equal(res.body.message, 'You can only delete your own opportunities.');
  assert.equal((await ctx.as(ctx.employee)(request(ctx.app).delete(`/opportunities/${opp.id}`))).body.message, 'You can only archive your own opportunities.');
  assert.ok(ctx.store.getOpportunityById(opp.id));
});

test('without the flag delete still archives', async () => {
  const ctx = await build();
  const opp = await ctx.newOpp();
  const res = await ctx.as(ctx.admin)(request(ctx.app).delete(`/opportunities/${opp.id}`));
  assert.equal(res.status, 204);
  assert.equal(ctx.store.getOpportunityById(opp.id).stage, 'Cancelled');
});
