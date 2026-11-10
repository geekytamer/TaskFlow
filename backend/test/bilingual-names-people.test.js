const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

// Phase 2 of two-language names (spec 2026-11-10-bilingual-names-design):
// employees, users and projects.
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-names-people-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const token = `Bearer ${store.issueToken(admin.id)}`;
  return { store, app, as: (req) => req.set('Authorization', token) };
}

const search = (app, as, q, lang) =>
  as(request(app).get(`/companies/1/search?q=${encodeURIComponent(q)}&lang=${lang}`));
const titlesOf = (body, type) => (body.find((g) => g.type === type)?.items ?? []).map((i) => i.title);

test('employees keep both names, name keeps its side, and search finds either name', async () => {
  const { app, as } = setup();
  const created = await as(request(app).post('/companies/1/employees')).send({ nameAr: 'أحمد البلوشي', nameEn: 'Ahmed Al Balushi', jobTitle: 'Driver' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.nameAr, 'أحمد البلوشي');
  assert.equal(created.body.nameEn, 'Ahmed Al Balushi');
  assert.equal(created.body.name, 'Ahmed Al Balushi', 'a new record takes the side sent as name (English first)');

  // An Arabic-first employee keeps Arabic in `name` when English is added.
  const arabic = await as(request(app).post('/companies/1/employees')).send({ name: 'سالم الهنائي' });
  assert.equal(arabic.status, 201, JSON.stringify(arabic.body));
  assert.equal(arabic.body.nameAr, 'سالم الهنائي');
  const edited = await as(request(app).put(`/employees/${arabic.body.id}`)).send({ nameEn: 'Salim Al Hinai' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.name, 'سالم الهنائي');
  assert.equal(edited.body.nameEn, 'Salim Al Hinai');

  // Another edit (no name sent) leaves the names alone.
  const other = await as(request(app).put(`/employees/${arabic.body.id}`)).send({ jobTitle: 'Accountant' });
  assert.equal(other.status, 200);
  assert.equal(other.body.nameAr, 'سالم الهنائي');
  assert.equal(other.body.nameEn, 'Salim Al Hinai');

  assert.equal((await as(request(app).post('/companies/1/employees')).send({ nameAr: '', nameEn: '' })).status, 400);
  assert.equal((await as(request(app).put(`/employees/${arabic.body.id}`)).send({ nameAr: '', nameEn: '' })).status, 400);

  const en = await search(app, as, 'Salim', 'ar');
  assert.deepEqual(titlesOf(en.body, 'employees'), ['سالم الهنائي'], 'an English query finds the Arabic-first employee, titled in Arabic');
  const ar = await search(app, as, 'احمد', 'en');
  assert.deepEqual(titlesOf(ar.body, 'employees'), ['Ahmed Al Balushi'], 'احمد (no hamza) finds أحمد, titled in English');
});

test('users keep both names through create and edit; both empty is refused', async () => {
  const { app, as } = setup();
  const created = await as(request(app).post('/users')).send({
    nameAr: 'مريم الكندي', nameEn: 'Maryam Al Kindi', email: 'maryam@example.com',
    companyRoles: [{ companyId: '1', role: 'Employee' }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const user = created.body.user;
  assert.equal(user.nameAr, 'مريم الكندي');
  assert.equal(user.nameEn, 'Maryam Al Kindi');
  assert.equal(user.name, 'Maryam Al Kindi');

  const edited = await as(request(app).put(`/users/${user.id}`)).send({ nameAr: 'مريم سالم الكندي' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.name, 'Maryam Al Kindi', 'name keeps its English side');
  assert.equal(edited.body.nameAr, 'مريم سالم الكندي');

  const listed = (await as(request(app).get('/users'))).body.find((u) => u.id === user.id);
  assert.equal(listed.nameAr, 'مريم سالم الكندي');
  assert.equal(listed.nameEn, 'Maryam Al Kindi');

  // An older caller that sends only `name` edits the side its letters say.
  const plain = await as(request(app).put(`/users/${user.id}`)).send({ name: 'Mariam Al Kindi' });
  assert.equal(plain.status, 200);
  assert.equal(plain.body.nameEn, 'Mariam Al Kindi');
  assert.equal(plain.body.nameAr, 'مريم سالم الكندي');

  assert.equal((await as(request(app).put(`/users/${user.id}`)).send({ nameAr: '', nameEn: '' })).status, 400);
  assert.equal((await as(request(app).post('/users')).send({
    nameAr: '', nameEn: '', email: 'nobody@example.com', companyRoles: [{ companyId: '1', role: 'Employee' }],
  })).status, 400);
});

test('projects keep both names and search finds either name', async () => {
  const { app, as } = setup();
  const created = await as(request(app).post('/projects')).send({
    nameAr: 'حملة رمضان', nameEn: 'Ramadan campaign', companyId: '1', visibility: 'Public',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.nameAr, 'حملة رمضان');
  assert.equal(created.body.nameEn, 'Ramadan campaign');

  const edited = await as(request(app).put(`/projects/${created.body.id}`)).send({ nameEn: 'Ramadan 2027 campaign' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.name, 'Ramadan 2027 campaign');
  assert.equal(edited.body.nameAr, 'حملة رمضان');
  const fetched = await as(request(app).get(`/projects/${created.body.id}`));
  assert.equal(fetched.body.nameEn, 'Ramadan 2027 campaign');
  assert.equal(fetched.body.nameAr, 'حملة رمضان');

  assert.equal((await as(request(app).put(`/projects/${created.body.id}`)).send({ nameAr: '', nameEn: '' })).status, 400);
  assert.equal((await as(request(app).post('/projects')).send({ nameAr: '', nameEn: '', companyId: '1', visibility: 'Public' })).status, 400);

  const byEnglish = await search(app, as, 'ramadan 2027', 'ar');
  assert.deepEqual(titlesOf(byEnglish.body, 'projects'), ['حملة رمضان']);
  const byVariant = await search(app, as, 'حمله رمضان', 'en');
  assert.deepEqual(titlesOf(byVariant.body, 'projects'), ['Ramadan 2027 campaign'], 'ة / ه fold together');
});

test('the backfill puts an old name on its side for employees, users and projects', () => {
  const dbPath = path.join(makeTmpDir('taskflow-names-people-backfill-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const db = store.db;
  db.prepare("UPDATE employees SET nameAr = NULL, nameEn = NULL").run();
  db.prepare("INSERT INTO projects (id, name, description, color, companyId, visibility, memberIds) VALUES ('p-old', 'مشروع قديم', '', '', '1', 'Public', '[]')").run();
  db.prepare("DELETE FROM schema_migrations WHERE id = '172_bilingual_names_people'").run();
  const reopened = new DataStore({ dbPath, seedOnEmpty: false });
  const project = reopened.getProjectById('p-old');
  assert.equal(project.nameAr, 'مشروع قديم');
  assert.equal(project.nameEn, undefined);
  for (const e of reopened.listEmployees('1')) assert.ok(e.nameAr || e.nameEn, `employee ${e.name} got a side`);
  const admin = reopened.listUsers().find((u) => u.email === 'admin@taskflow.com');
  assert.ok(admin.nameAr || admin.nameEn);
});
