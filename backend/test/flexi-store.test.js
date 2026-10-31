const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Peak Flexi balances: a client applies (activation with the commercial
 * registration, increase with a statement and solvency papers), staff approve
 * or reject, and the balance is the client's credit limit. Used is what the
 * client owes today, so the balance never has a second ledger.
 */

const PDF = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-flexi-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const contact = store.createContact({ companyId: '1', kind: 'Organization', name: 'Sidr Coffee', roles: ['Client'] });
  const upload = (contactId = contact.id, name = 'cr.pdf') => store.thread.addFile({
    companyId: '1', contactId, uploader: { kind: 'portal', portalUserId: 'pu-1' }, fileName: name, mimeType: 'application/pdf', content: PDF,
  }).id;
  const activate = (overrides = {}) => store.flexi.submit({
    companyId: '1', contactId: contact.id, kind: 'activation', crNumber: '1234567', fileIds: [upload()], createdBy: 'pu-1', ...overrides,
  });
  const enable = (amount = 850) => {
    const app = activate();
    return store.flexi.approve(app.id, { amount, reviewerId: manager.id });
  };
  const increase = (overrides = {}) => store.flexi.submit({
    companyId: '1', contactId: contact.id, kind: 'increase', requestedAmount: 3000, fileIds: [upload(contact.id, 'statement.pdf'), upload(contact.id, 'solvency.pdf')], createdBy: 'pu-1', ...overrides,
  });
  return { store, manager, contact, upload, activate, enable, increase, dbPath };
}

const status = (fn) => {
  try { fn(); } catch (err) { return err.status; }
  return 'no error';
};

test('activation approve creates and links a client with 850, 40% and 6 months', () => {
  const { store, contact, enable } = setup();
  const approved = enable();
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedAmount, 850);
  const linked = store.getContactById(contact.id);
  assert.ok(linked.clientId, 'contact linked to a finance client');
  const client = store.getClientById(linked.clientId);
  assert.equal(client.creditLimit, 850);
  assert.equal(client.flexiEnabled, true);
  assert.deepEqual(store.flexi.balanceOf(contact.id), { enabled: true, balance: 850, used: 0, available: 850, upfrontPct: 40, maxMonths: 6, clientId: linked.clientId });
});

test('approve with a lower amount and custom terms', () => {
  const { store, manager, contact, activate } = setup();
  const app = activate();
  store.flexi.approve(app.id, { amount: 500, upfrontPct: 35, maxMonths: 3, reviewNote: 'New company', reviewerId: manager.id });
  const balance = store.flexi.balanceOf(contact.id);
  assert.deepEqual([balance.balance, balance.upfrontPct, balance.maxMonths], [500, 35, 3]);
});

test('increase approval defaults to 12 months', () => {
  const { store, manager, contact, enable, increase } = setup();
  enable();
  const app = increase();
  store.flexi.approve(app.id, { amount: 3000, reviewerId: manager.id });
  const balance = store.flexi.balanceOf(contact.id);
  assert.deepEqual([balance.balance, balance.maxMonths, balance.upfrontPct], [3000, 12, 40]);
});

test('reject keeps the limit and the reason', () => {
  const { store, manager, contact, enable, increase } = setup();
  enable();
  const app = increase();
  const rejected = store.flexi.reject(app.id, { reviewNote: 'Statement too short', reviewerId: manager.id });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reviewNote, 'Statement too short');
  assert.equal(store.flexi.balanceOf(contact.id).balance, 850);
  assert.equal(store.flexi.latestFor(contact.id).id, app.id);
});

test('a second open application is refused, of either kind', () => {
  const { store, activate, contact, upload } = setup();
  activate();
  assert.equal(status(() => activate()), 409);
  assert.equal(status(() => store.flexi.submit({ companyId: '1', contactId: contact.id, kind: 'increase', requestedAmount: 3000, fileIds: [upload(), upload()], createdBy: 'pu-1' })), 409);
  assert.equal(store.flexi.list('1', { contactId: contact.id }).length, 1);
});

test('activation needs a CR number and a file; increase needs Flexi, an amount above the balance and two files', () => {
  const { activate, enable, increase, upload, contact, store } = setup();
  assert.equal(status(() => activate({ crNumber: '  ' })), 400);
  assert.equal(status(() => activate({ fileIds: [] })), 400);
  assert.equal(status(() => increase()), 400, 'Flexi not enabled yet');
  enable();
  assert.equal(status(() => activate()), 409, 'already enabled');
  assert.equal(status(() => increase({ requestedAmount: 850 })), 400, 'not above the balance');
  assert.equal(status(() => increase({ requestedAmount: 'lots' })), 400);
  assert.equal(status(() => increase({ fileIds: [upload()] })), 400, 'one file is not enough');
  assert.equal(store.flexi.openFor(contact.id), undefined);
});

test('approving twice, or approving a withdrawn or rejected application, is refused', () => {
  const { store, manager, contact, activate, enable } = setup();
  const first = activate();
  store.flexi.withdraw(first.id, contact.id);
  assert.equal(status(() => store.flexi.approve(first.id, { amount: 850, reviewerId: manager.id })), 409);
  const second = activate();
  store.flexi.reject(second.id, { reviewNote: 'No', reviewerId: manager.id });
  assert.equal(status(() => store.flexi.approve(second.id, { amount: 850, reviewerId: manager.id })), 409);
  const approved = enable();
  assert.equal(status(() => store.flexi.approve(approved.id, { amount: 5000, reviewerId: manager.id })), 409);
  assert.equal(store.flexi.balanceOf(contact.id).balance, 850);
  assert.equal(status(() => store.flexi.withdraw(approved.id, contact.id)), 409);
  assert.equal(status(() => store.flexi.withdraw('missing', contact.id)), 404);
});

test('an amount that is not positive is refused', () => {
  const { store, manager, activate } = setup();
  const app = activate();
  for (const amount of [0, -5, Number.NaN, 'abc']) {
    assert.equal(status(() => store.flexi.approve(app.id, { amount, reviewerId: manager.id })), 400, String(amount));
  }
  assert.equal(store.flexi.get(app.id).status, 'new');
});

test('an existing finance client is reused', () => {
  const { store, manager, upload } = setup();
  const client = store.createClient({ name: 'Sidr Honey LLC', email: '', address: '', companyId: '1' });
  const linked = store.listContacts('1').find((c) => c.clientId === client.id);
  assert.ok(linked, 'creating a client creates its contact');
  const app = store.flexi.submit({ companyId: '1', contactId: linked.id, kind: 'activation', crNumber: '7654321', fileIds: [upload(linked.id)], createdBy: 'pu-1' });
  store.flexi.approve(app.id, { amount: 850, reviewerId: manager.id });
  assert.equal(store.getContactById(linked.id).clientId, client.id);
  assert.equal(store.getClientById(client.id).creditLimit, 850);
  assert.equal(store.flexi.get(app.id).clientId, client.id);
});

test('used comes from what the client owes', async () => {
  const { store, manager, contact, enable, dbPath } = setup();
  enable();
  const clientId = store.getContactById(contact.id).clientId;
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy', logger: { info() {}, warn() {}, error() {} } }).listen(0);
  app.unref();
  const res = await request(app).post('/invoices').set('Authorization', `Bearer ${store.issueToken(manager.id)}`).send({
    companyId: '1', clientId, issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'Sent', taxRate: 0, lineItems: [{ itemType: 'Manual', description: 'Launch reel', quantity: 1, unitPrice: 300, amount: 300 }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const balance = store.flexi.balanceOf(contact.id);
  assert.deepEqual([balance.used, balance.available], [300, 550]);
});

test('files attach to the application', () => {
  const { store, enable, increase } = setup();
  enable();
  const app = increase();
  assert.equal(store.thread.filesOf('flexi_application', app.id).length, 2);
});

test('approval and rejection are recorded on the contact activity', () => {
  const { store, manager, contact, enable, increase } = setup();
  enable();
  store.flexi.reject(increase().id, { reviewNote: 'Later', reviewerId: manager.id });
  const actions = store.listActivityEvents('1', { entityType: 'contact', entityId: contact.id }).map((e) => e.action);
  assert.ok(actions.includes('flexi_approved'));
  assert.ok(actions.includes('flexi_rejected'));
});

test('existing companies get the Flexi review permission on their Admin, Manager and Accountant groups', () => {
  const { store, dbPath } = setup();
  const grants = (s) => s.db.prepare("SELECT g.key FROM group_permissions gp JOIN permission_groups g ON g.id = gp.groupId WHERE gp.module = 'invoices' AND gp.action = 'flexi.review' AND g.companyId = '1' ORDER BY g.key").all().map((r) => r.key);
  // A company from before this release: no grants, and the backfill not yet run.
  store.db.prepare("DELETE FROM group_permissions WHERE module = 'invoices' AND action = 'flexi.review'").run();
  store.db.prepare("DELETE FROM schema_migrations WHERE id = '146_flexi_review_grants'").run();
  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  assert.deepEqual(grants(reopened), ['accountant', 'admin', 'manager']);
});
