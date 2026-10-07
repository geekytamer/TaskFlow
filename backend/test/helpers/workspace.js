const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../../dist/server');
const { DataStore } = require('../../dist/data/store');
const { makeTmpDir } = require('./tmp');

/** A portal company with two influencers, a client, and staff of each role: the fixture for the creator workspace tests. */
function buildWorkspace() {
  const dbPath = path.join(makeTmpDir('taskflow-workspace-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const users = {
    admin: staff('Admin', 'Ada Admin', 'ada@peak.test'),
    manager: staff('Manager', 'Carla Owner', 'carla@peak.test'),
    accountant: staff('Accountant', 'Omar Accounts', 'omar@peak.test'),
    employee: staff('Employee', 'Eve Employee', 'eve@peak.test'),
  };
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'], ownerUserId: users.manager.id });
  const noel = store.createContact({ companyId: company.id, kind: 'Person', name: 'Noel Saad', roles: ['Influencer'] });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const PASSWORD = 'correct horse battery';
  const session = async (audience, contact, email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  const staffAuth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  const ws = (who) => ({
    get: (p) => request(server).get(`/portal-api/influencer/workspace${p}`).set(who),
    post: (p, body = {}) => request(server).post(`/portal-api/influencer/workspace${p}`).set(who).send(body),
  });
  return { server, store, company, users, client, lina, noel, session, staffAuth, ws };
}

module.exports = { buildWorkspace };
