const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The portal is a second identity space. These tests hold the line between it
 * and the internal app, in both directions, on the real server.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const build = ({ portalCompanyId } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-isolation-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = store.createUser({
    name: 'Sam Staff', email: 'sam@peak.test', password: 'x', role: 'Admin',
    companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Admin' }],
  });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: portalCompanyId === undefined ? company.id : portalCompanyId || undefined,
  }).listen(0);
  server.unref();

  const portalToken = async (audience, email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: `contact-${audience}`, email, name: email,
      role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return res.body.token;
  };
  return { server, store, company, staffToken: store.issueToken(staff.id), portalToken };
};

test('an internal token cannot open a portal route', async () => {
  const { server, staffToken } = build();
  for (const audience of ['client', 'influencer']) {
    assert.equal((await request(server).get(`/portal-api/${audience}/me`).set('Authorization', `Bearer ${staffToken}`)).status, 401);
  }
});

test('a portal token cannot open any internal route', async () => {
  const { server, store, company, portalToken } = build();
  const token = await portalToken('client', 'ada@acme.test');
  assert.equal(store.getUserByToken(token), undefined, 'the internal store does not know portal tokens');
  const auth = { Authorization: `Bearer ${token}` };
  for (const url of ['/auth/me', `/companies/${company.id}/contacts`, `/companies/${company.id}/invoices`, '/companies']) {
    assert.equal((await request(server).get(url).set(auth)).status, 401, url);
  }
});

test('a client session cannot open the influencer portal and the reverse', async () => {
  const { server, portalToken } = build();
  const client = await portalToken('client', 'ada@acme.test');
  const influencer = await portalToken('influencer', 'inf@x.test');
  assert.equal((await request(server).get('/portal-api/influencer/me').set('Authorization', `Bearer ${client}`)).status, 401);
  assert.equal((await request(server).get('/portal-api/client/me').set('Authorization', `Bearer ${influencer}`)).status, 401);
});

test('disabling a user ends their session on the very next request', async () => {
  const { server, store, company, portalToken } = build();
  const token = await portalToken('client', 'ada@acme.test');
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await request(server).get('/portal-api/client/me').set(auth)).status, 200);
  store.portal.disableUser(store.portal.listUsers(company.id)[0].id);
  assert.equal((await request(server).get('/portal-api/client/me').set(auth)).status, 401);
});

test('the portal API does not exist unless a company is configured', async () => {
  const { server } = build({ portalCompanyId: '' });
  assert.equal((await request(server).get('/portal-api/client/branding')).status, 404);
});

test('the portal API serves branding from the configured company', async () => {
  const { server } = build();
  const res = await request(server).get('/portal-api/client/branding');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Peak Media');
});
