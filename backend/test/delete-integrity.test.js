const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-integrity-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const tokenFor = (email) => store.issueToken(store.listUsers().find((u) => u.email === email).id);
  const as = (email) => (req) => req.set('Authorization', `Bearer ${tokenFor(email)}`);
  return { app, store, as, db: store.db, dbPath };
}

const task = (store, extra = {}) => store.createTask({
  projectId: store.listProjects().find((p) => p.companyId === '1').id,
  title: 'T', description: '', status: 'To Do', priority: 'Medium', companyId: '1', assignedUserIds: [], tags: [],
  dependencies: [], ...extra,
});

test("attendance cannot be deleted from another company", async () => {
  const { app, store, as } = setup();
  const emp = store.createEmployee({ companyId: '1', name: 'Hana' });
  const rec = store.upsertAttendance({ companyId: '1', employeeId: emp.id, date: '2026-10-01', status: 'Present', hours: 8 });
  const res = await as('dana.s@synergysolutions.com')(request(app).delete(`/attendance/${rec.id}`));
  assert.equal(res.status, 403);
  assert.equal(store.listAttendance('1').some((r) => r.id === rec.id), true, 'still there');
});

test('deleting a user leaves no ghost on tasks, projects or sessions', () => {
  const { store, db } = setup();
  const user = store.createUser({ name: 'Gone', email: 'gone@x.example', password: 'Password1!', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }], role: 'Employee' });
  const keep = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const t = task(store, { assignedUserIds: [user.id, keep.id] });
  const project = store.createProject({ name: 'P', description: '', color: '#000', companyId: '1', visibility: 'Public', memberIds: [user.id, keep.id] });
  store.issueToken(user.id);
  store.deleteUser(user.id);
  assert.deepEqual(store.getTaskById(t.id).assignedUserIds, [keep.id]);
  assert.deepEqual(store.getProjectById(project.id).memberIds, [keep.id]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE userId = ?').get(user.id).n, 0);
});

test("a user who owns private tasks cannot be deleted until they are handed over", () => {
  const { store } = setup();
  const user = store.createUser({ name: 'Owner', email: 'owner@x.example', password: 'Password1!', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }], role: 'Employee' });
  task(store, { ownerId: user.id, isPrivate: true });
  assert.throws(() => store.deleteUser(user.id), /private task/);
});

test('deleting a task frees the tasks that depended on it', () => {
  const { store } = setup();
  const first = task(store);
  const second = task(store, { dependencies: [first.id] });
  store.deleteTask(first.id);
  assert.deepEqual(store.getTaskById(second.id).dependencies, []);
});

test('deleting a project removes its tasks and their comments and time', () => {
  const { store, db } = setup();
  const project = store.createProject({ name: 'P', description: '', color: '#000', companyId: '1', visibility: 'Public', memberIds: [] });
  const t = task(store, { projectId: project.id });
  db.prepare("INSERT INTO comments (id, taskId, userId, content, createdAt) VALUES ('c1', ?, 'admin-placeholder-id', 'hi', ?)").run(t.id, new Date().toISOString());
  store.deleteProject(project.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments WHERE taskId = ?').get(t.id).n, 0);
});

test('a contact a quotation is for cannot be deleted', async () => {
  const { app, store, as } = setup();
  const admin = as('admin@taskflow.com');
  const contact = (await admin(request(app).post('/companies/1/contacts')).send({ name: 'Buyer', roles: ['Client'] })).body;
  const quote = await admin(request(app).post('/companies/1/quotations')).send({ contactId: contact.id, items: [{ description: 'Work', quantity: 1, unitPrice: 1 }] });
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  assert.throws(() => store.deleteContact(contact.id), /quotation/);
});

test('deleting a contact clears its follow-ups and attachments', () => {
  const { store, db } = setup();
  const contact = store.createContact({ companyId: '1', kind: 'Organization', name: 'Short-lived' });
  db.prepare(`INSERT INTO follow_ups (id, companyId, ownerUserId, entityType, entityId, title, type, status, priority, createdAt, updatedAt)
    VALUES ('f1','1','admin-placeholder-id','contact',?,'Call','Call','Open','Medium',?,?)`).run(contact.id, new Date().toISOString(), new Date().toISOString());
  db.prepare("INSERT INTO follow_up_assignees (followUpId, userId, createdAt) VALUES ('f1','admin-placeholder-id',?)").run(new Date().toISOString());
  store.createRecordAttachment({ companyId: '1', entityType: 'contact', entityId: contact.id, fileName: 'a.txt', url: '', mimeType: 'text/plain', sizeBytes: 1 });
  store.deleteContact(contact.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM follow_ups WHERE id='f1'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM follow_up_assignees WHERE followUpId='f1'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM record_attachments WHERE entityId = ?').get(contact.id).n, 0);
});

test('an employee on a payroll run is kept, not deleted', () => {
  const { store } = setup();
  const emp = store.createEmployee({ companyId: '1', name: 'Paid', basicSalary: 500 });
  store.createPayrollRun('1', '2026-09');
  assert.throws(() => store.deleteEmployee(emp.id), /payroll/i);
});

test('a filed VAT return cannot be deleted', () => {
  const { store } = setup();
  const ret = store.fileVatReturn('1', new Date('2026-07-01'), new Date('2026-09-30'));
  assert.throws(() => store.deleteVatReturn(ret.id), /filed/i);
});

test('a deleted warehouse stays deleted and its items move to the default one', () => {
  const { store, dbPath } = setup();
  const main = store.createWarehouse({ companyId: '1', name: 'Main', isDefault: true });
  const old = store.createWarehouse({ companyId: '1', name: 'Old shed' });
  const item = store.createInventoryItem({ companyId: '1', sku: 'SHED-1', name: 'Rake', category: 'Tools', unit: 'pcs', onHand: 0, reorderPoint: 0, unitCost: 1, location: 'Old shed' });
  store.deleteWarehouse(old.id);
  assert.equal(store.getInventoryItemById(item.id).location, main.name);
  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  assert.equal(reopened.listWarehouses('1').some((w) => w.name === 'Old shed'), false);
});

test('a refused delete explains itself instead of answering "Internal server error"', async () => {
  const { app, store, as } = setup();
  const emp = store.createEmployee({ companyId: '1', name: 'Paid', basicSalary: 500 });
  store.createPayrollRun('1', '2026-08');
  const res = await as('admin@taskflow.com')(request(app).delete(`/employees/${emp.id}`));
  assert.ok(res.status >= 400 && res.status < 500, `got ${res.status}`);
  assert.match(res.body.message, /payroll/i);
  const user = store.createUser({ name: 'Owner', email: 'own@x.example', password: 'Password1!', companyIds: ['1'], companyRoles: [{ companyId: '1', role: 'Employee' }], role: 'Employee' });
  task(store, { ownerId: user.id, isPrivate: true });
  const del = await as('admin@taskflow.com')(request(app).delete(`/users/${user.id}`));
  assert.ok(del.status >= 400 && del.status < 500, `got ${del.status}`);
  assert.match(del.body.message, /private task/);
});
