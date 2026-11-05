const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Documents → Library: every file and generated document the person may open,
 * in one list, never more than they could open from the record itself
 * (spec 2026-11-06-documents-hub-design).
 */

let seq = 0;
const PDF = Buffer.from('%PDF-1.4 test').toString('base64');

const setup = (engine) => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-library-'), 'taskflow.db'), seedOnEmpty: false });
  const server = createServer({ store, dbPath: ':memory:', seedOnEmpty: false, allowSeedReset: false, permissionsEngine: engine, logger: { info() {}, warn() {}, error() {} } }).listen(0);
  server.unref();
  const co = store.createCompany({ name: 'Co' });
  const mk = (role) => store.createUser({ name: `${role}${++seq}`, email: `${role}${seq}@library.test`, password: 'x', role, companyIds: [co.id], companyRoles: [{ companyId: co.id, role }] });
  const auth = (u) => ['Authorization', `Bearer ${store.issueToken(u.id)}`];
  const as = (u) => ({
    get: (url) => request(server).get(url).set(...auth(u)),
    post: (url, body) => request(server).post(url).set(...auth(u)).send(body ?? {}),
    patch: (url, body) => request(server).patch(url).set(...auth(u)).send(body ?? {}),
  });
  const library = async (u, query = '') => {
    const res = await as(u).get(`/companies/${co.id}/library${query}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };
  return { server, store, co, mk, as, library };
};

for (const engine of ['legacy', 'v2']) {
  test(`a library upload with a folder and a file on a client both show, with where they came from (${engine})`, async () => {
    const { store, co, mk, as, library } = setup(engine);
    const admin = mk('Admin');
    const up = await as(admin).post(`/companies/${co.id}/records/company/${co.id}/attachments`, {
      fileName: 'Commercial register.pdf', mimeType: 'application/pdf', contentBase64: PDF, folder: '  Company papers  ',
    });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.folder, 'Company papers', 'trimmed');
    const client = store.createContact({ companyId: co.id, kind: 'Organization', name: 'Zubair Hotel', roles: ['Client'] });
    const onClient = await as(admin).post(`/companies/${co.id}/records/contact/${client.id}/attachments`, { fileName: 'MoU signed.pdf', mimeType: 'application/pdf', contentBase64: PDF });
    assert.equal(onClient.status, 201, JSON.stringify(onClient.body));

    const { items, truncated } = await library(admin);
    assert.equal(truncated, false);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    assert.equal(byName['Commercial register.pdf'].entityType, 'company');
    assert.equal(byName['Commercial register.pdf'].folder, 'Company papers');
    assert.equal(byName['Commercial register.pdf'].hasContent, true);
    assert.equal(byName['MoU signed.pdf'].recordLabel, 'Zubair Hotel');
    assert.equal(byName['MoU signed.pdf'].route, `/contacts/${client.id}`);
    assert.equal(byName['MoU signed.pdf'].kind, 'attachment');

    assert.deepEqual((await library(admin, '?q=zubair')).items.map((i) => i.name), ['MoU signed.pdf'], 'q matches the record label');
    assert.deepEqual((await library(admin, '?folder=Company%20papers')).items.map((i) => i.name), ['Commercial register.pdf']);
    assert.deepEqual((await library(admin, '?source=company')).items.map((i) => i.name), ['Commercial register.pdf']);
    const folders = (await library(admin)).folders;
    assert.deepEqual(folders, ['Company papers']);
  });

  test(`a private contact's file shows exactly to those who can open the contact; an employee has no library (${engine})`, async () => {
    const { store, co, mk, as, library } = setup(engine);
    const owner = mk('Manager');
    const other = mk('Manager');
    const employee = mk('Employee');
    const secret = store.createContact({ companyId: co.id, kind: 'Person', name: 'Private Prospect', roles: ['Lead'], visibility: 'Private', ownerUserId: owner.id });
    const res = await as(owner).post(`/companies/${co.id}/records/contact/${secret.id}/attachments`, { fileName: 'offer.pdf', contentBase64: PDF });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual((await library(owner)).items.map((i) => i.name), ['offer.pdf'], 'its owner sees it');
    // The library never decides on its own: it follows the contact's rule.
    const opens = (await as(other).get(`/contacts/${secret.id}`)).status === 200;
    assert.equal((await library(other)).items.length, opens ? 1 : 0, 'same answer as opening the contact');
    assert.equal((await as(employee).get(`/companies/${co.id}/library`)).status, 403);
  });

  test(`a private project's file shows exactly to those who can open the project (${engine})`, async () => {
    const { store, co, mk, as, library } = setup(engine);
    const member = mk('Manager');
    const outsider = mk('Accountant');
    const project = store.createProject({ name: 'Secret launch', description: '', color: '#000', companyId: co.id, visibility: 'Private', memberIds: [member.id] });
    store.createRecordAttachment({ companyId: co.id, entityType: 'project', entityId: project.id, fileName: 'brief.pdf' });
    assert.deepEqual((await library(member)).items.map((i) => [i.name, i.recordLabel, i.route]), [['brief.pdf', 'Secret launch', `/projects/${project.id}`]]);
    // Management reaches private projects today; the library follows whatever the project rule says.
    const opens = (await as(outsider).get(`/projects/${project.id}`)).status === 200;
    assert.equal((await library(outsider)).items.length, opens ? 1 : 0, 'same answer as opening the project');
  });

  test(`files of a switched-off module drop out of the library (${engine})`, async () => {
    const { store, co, mk, as, library } = setup(engine);
    const admin = mk('Admin');
    const item = store.createInventoryItem({ companyId: co.id, name: 'Dates', category: 'Food', unit: 'box', unitCost: 1 });
    const res = await as(admin).post(`/companies/${co.id}/records/inventory_item/${item.id}/attachments`, { fileName: 'spec sheet.pdf', contentBase64: PDF });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((await library(admin)).items.length, 1);
    store.updateCompany(co.id, { disabledModules: ['inventory', 'manufacturing', 'purchasing'] });
    assert.deepEqual((await library(admin)).items, []);
  });

  test(`moving a file to a folder needs documents.edit (${engine})`, async () => {
    const { co, mk, as, library } = setup(engine);
    const admin = mk('Admin');
    const employee = mk('Employee');
    const up = await as(admin).post(`/companies/${co.id}/records/company/${co.id}/attachments`, { fileName: 'logo.png', contentBase64: PDF });
    const moved = await as(admin).patch(`/record-attachments/${up.body.id}`, { folder: 'Brand', fileName: 'Peak logo.png' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.folder, 'Brand');
    assert.equal(moved.body.fileName, 'Peak logo.png');
    assert.equal((await as(admin).patch(`/record-attachments/${up.body.id}`, { folder: '' })).body.folder, undefined, 'empty clears the folder');
    assert.equal((await as(admin).patch(`/record-attachments/${up.body.id}`, { fileName: '' })).status, 400);
    assert.equal((await as(employee).patch(`/record-attachments/${up.body.id}`, { folder: 'X' })).status, 403);
    assert.equal((await library(admin)).items[0].name, 'Peak logo.png');
  });
}

test('the library returns the newest 500 and says there are more', async () => {
  const { store, co, mk, library } = setup('legacy');
  const admin = mk('Admin');
  for (let i = 0; i < 501; i += 1) {
    store.createRecordAttachment({ companyId: co.id, entityType: 'company', entityId: co.id, fileName: `f${i}.txt`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
  }
  const { items, truncated } = await library(admin);
  assert.equal(items.length, 500);
  assert.equal(truncated, true);
  assert.equal(items[0].name, 'f500.txt', 'newest first');
});
