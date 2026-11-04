const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** Wave 2 over HTTP: handing a step on, the All open box, chips, held payments, leave by hand. */

let seq = 0;
const setup = (engine) => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-apw2api-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const co = store.createCompany({ name: 'Co' });
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@apw2api.test`, password: 'x', role, companyIds: [co.id], companyRoles: [{ companyId: co.id, role }] });
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const as = (u) => ({
    get: (url) => request(server).get(url).set(auth(u)),
    post: (url, body) => request(server).post(url).set(auth(u)).send(body ?? {}),
    put: (url, body) => request(server).put(url).set(auth(u)).send(body ?? {}),
  });
  return { server, store, co, mk, as };
};

/** A vendor bill waiting at a step whose only approver has left (stuck). */
const stuckBill = (ctx) => {
  const { store, co, mk } = ctx;
  const gone = mk('Employee');
  store.approvals.setPolicy(co.id, 'vendor_bill', { steps: [{ approvers: [{ kind: 'user', id: gone.id }], need: 'any' }] });
  const clerk = mk('Accountant');
  const bill = store.runAsActor({ userId: clerk.id, name: clerk.name }, () => store.createVendorBill({ companyId: co.id, vendorName: 'Globex', amount: 900, issueDate: new Date(), dueDate: new Date(), status: 'Approved' }));
  store.removeCompanyMembership(gone.id, co.id);
  return { bill, clerk };
};

for (const engine of ['legacy', 'v2']) {
  test(`an Admin hands a stuck step to someone; they decide it; the trail says why (${engine})`, async () => {
    const ctx = setup(engine);
    const { server, store, co, mk, as } = ctx;
    const admin = mk('Admin');
    const manager = mk('Manager');
    const cfo = mk('Employee');
    const { bill, clerk } = stuckBill(ctx);

    const open = await as(admin).get(`/companies/${co.id}/approvals?box=open`);
    assert.equal(open.status, 200, JSON.stringify(open.body));
    assert.equal(open.body[0].docId, bill.id);
    assert.equal(open.body[0].steps[0].stuck, true);
    assert.equal(open.body[0].canReassign, true);
    assert.equal((await as(manager).get(`/companies/${co.id}/approvals?box=open`)).status, 403);

    const url = `/approvals/vendor_bill/${bill.id}/reassign`;
    assert.equal((await as(manager).post(url, { toUserId: cfo.id, reason: 'Left' })).status, 403);
    assert.equal((await as(admin).post(url, { toUserId: cfo.id })).status, 409, 'a reason is required');
    assert.equal((await as(admin).post(url, { toUserId: clerk.id, reason: 'x' })).status, 409, 'not the requester');
    const moved = await as(admin).post(url, { toUserId: cfo.id, reason: 'Sara left the company' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.ok(moved.body.trail.some((t) => t.kind === 'reassigned' && /Sara left/.test(t.note)));
    assert.ok(store.listNotifications(cfo.id).some((n) => /handed to you/.test(n.title)));

    const view = await as(cfo).get(`/approvals/vendor_bill/${bill.id}/view`);
    assert.equal(view.status, 200, JSON.stringify(view.body));
    assert.equal(view.body.canDecide, true);
    assert.equal(view.body.canReassign, false);
    const decided = await as(cfo).post(`/approvals/vendor_bill/${bill.id}/decision`, { decision: 'approve' });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    server.close();
  });

  test(`chips: where each document of a type stands, in one call (${engine})`, async () => {
    const ctx = setup(engine);
    const { server, co, mk, as } = ctx;
    const { bill } = stuckBill(ctx);
    const outsider = mk('Employee');
    assert.equal((await as(outsider).get(`/companies/${co.id}/approvals/status?docType=vendor_bill`)).status, 403, 'bills are for those who run them');
    assert.equal((await as(outsider).get(`/companies/${co.id}/approvals/status?docType=leave_request`)).status, 200, 'leave is listed to everyone');
    assert.equal((await as(outsider).get(`/approvals/vendor_bill/${bill.id}/view`)).status, 403, 'not on it: no amounts or history');
    const res = await as(mk('Accountant')).get(`/companies/${co.id}/approvals/status?docType=vendor_bill`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.map((r) => [r.docId, r.status, r.level, r.levels]), [[bill.id, 'pending', 1, 1]]);
    assert.equal(res.body[0].stuck, true);
    assert.equal(res.body[0].approvers[0].kind, 'user');
    server.close();
  });

  test(`a held payment answers 202, is listed on its bill, and can be withdrawn (${engine})`, async () => {
    const { server, store, co, mk, as } = setup(engine);
    const accountant = mk('Accountant');
    const admin = mk('Admin');
    const cfo = mk('Employee');
    store.approvals.setPolicy(co.id, 'vendor_payment', { steps: [{ approvers: [{ kind: 'user', id: cfo.id }], need: 'any' }] });
    const bill = store.createVendorBill({ companyId: co.id, vendorName: 'Globex', amount: 500, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
    const paid = await as(admin).post(`/vendor-bills/${bill.id}/payments`, { amount: 120, method: 'Bank Transfer' });
    assert.equal(paid.status, 202, JSON.stringify(paid.body));
    assert.equal(paid.body.held, true);
    const list = await as(admin).get(`/companies/${co.id}/approval-holds?docType=vendor_payment&targetId=${bill.id}&status=pending`);
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal((await as(accountant).post(`/approval-holds/${paid.body.hold.id}/withdraw`)).status, 403, 'not theirs, not an Admin');
    const back = await as(admin).post(`/approval-holds/${paid.body.hold.id}/withdraw`);
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.status, 'withdrawn');
    server.close();
  });

  test(`leave can't be approved by hand while its approval runs (${engine})`, async () => {
    const { server, store, co, mk, as } = setup(engine);
    const manager = mk('Manager');
    const boss = mk('Employee');
    const bossRec = store.createEmployee({ companyId: co.id, name: 'Boss', userId: boss.id, status: 'Active' });
    const worker = store.createEmployee({ companyId: co.id, name: 'Worker', managerId: bossRec.id, status: 'Active' });
    store.approvals.setPolicy(co.id, 'leave_request', { steps: [{ approvers: [{ kind: 'manager' }], need: 'any' }] });
    const leave = await as(manager).post(`/companies/${co.id}/leave-requests`, { employeeId: worker.id, startDate: '2026-12-01', endDate: '2026-12-02' });
    assert.equal(leave.status, 201, JSON.stringify(leave.body));
    const byHand = await as(manager).put(`/leave-requests/${leave.body.id}/status`, { status: 'Approved' });
    assert.equal(byHand.status, 409);
    assert.equal(byHand.body.code, 'APPROVAL_PENDING');
    const ok = await as(boss).post(`/approvals/leave_request/${leave.body.id}/decision`, { decision: 'approve' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(store.getLeaveRequestById(leave.body.id).status, 'Approved');
    server.close();
  });
}
