const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { RECORD_RULES } = require('../dist/permissions/record-rules');
const { allPermissions } = require('../dist/permissions/catalogue');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Before-and-after proof for the record rules.
 *
 * For every rule, a probe exercises the route that enforces it as each of the
 * four roles, on the legacy engine (roles decide) and on the openfga engine
 * (built-in groups decide, emulated from the database's grants exactly as the
 * tuple projection publishes them). Every outcome must match who held the rule
 * before it became a permission, on both engines.
 */

const ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'];
const COMPANY = '1';
const quiet = { info() {}, warn() {}, error() {} };

const sqlReader = (store) => ({
  async listGrantedObjects(userId) {
    const user = store.getUserById(userId);
    const objects = [];
    for (const company of store.listCompanies()) {
      const superAdminHere = Boolean(user?.isSuperAdmin) && (user.companyIds || []).includes(company.id);
      for (const perm of superAdminHere ? allPermissions() : store.getEffectivePermissions(userId, company.id)) {
        const cut = perm.indexOf(':');
        objects.push(`permission:${company.id}/${perm.slice(0, cut)}/${perm.slice(cut + 1)}`);
      }
    }
    return objects;
  },
});

const build = (engine) => {
  const dbPath = path.join(makeTmpDir(`taskflow-parity-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet,
    authzEngine: engine, permissionReader: sqlReader(store), tupleWriter: { async write() {} },
  }).listen(0);
  server.unref();

  const member = (name, email, role) => store.createUser({
    name, email, password: 'x', role, companyIds: [COMPANY], companyRoles: [{ companyId: COMPANY, role }],
  });
  member('Parity Accountant', 'accountant@parity.test', 'Accountant');
  const owner = member('Record Owner', 'owner@parity.test', 'Employee');
  const byEmail = (email) => store.listUsers().find((u) => u.email === email);
  const users = {
    Admin: byEmail('admin@taskflow.com'),
    Manager: byEmail('samantha.b@innovatecorp.com'),
    Accountant: byEmail('accountant@parity.test'),
    Employee: byEmail('charlie.d@innovatecorp.com'),
  };
  const as = (user) => ({
    get: (url) => request(server).get(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`),
    post: (url, body) => request(server).post(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`).send(body),
    put: (url, body) => request(server).put(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`).send(body),
    patch: (url, body) => request(server).patch(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`).send(body),
    delete: (url) => request(server).delete(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`),
  });
  return { store, users, owner, as, admin: as(users.Admin), asOwner: as(owner) };
};

/** Records nobody under test owns, shared by the probes. */
const fixtures = async ({ store, owner, admin, asOwner }) => {
  const priced = store.createContact({ companyId: COMPANY, name: 'Parity Priced', rateCardAmount: 900, roles: ['Influencer'] });
  store.db.prepare('UPDATE contacts SET ownerUserId = ? WHERE id = ?').run(owner.id, priced.id);
  const hidden = store.createContact({ companyId: COMPANY, name: 'Parity Private' });
  store.db.prepare("UPDATE contacts SET visibility = 'Private', ownerUserId = ? WHERE id = ?").run(owner.id, hidden.id);

  const { id: _p, ...projectBase } = store.getProjectById('proj-2');
  const privateProject = store.createProject({ ...projectBase, name: 'Parity Private Project', memberIds: [owner.id] });
  const { id: _t, ...taskBase } = store.getTaskById('task-1');
  const hiddenTask = store.createTask({
    ...taskBase, title: 'Parity Hidden Task', projectId: privateProject.id, assignedUserIds: [owner.id], isPrivate: false, ownerId: owner.id,
  });
  const timedTask = store.createTask({
    ...taskBase, title: 'Parity Timed Task', projectId: 'proj-1', assignedUserIds: [owner.id], isPrivate: false, ownerId: owner.id,
  });

  const opportunity = await admin.post(`/companies/${COMPANY}/opportunities`, {
    contactId: priced.id, title: 'Parity Opportunity', serviceType: 'Influencer Campaign', ownerUserId: owner.id, ownerName: owner.name,
  });
  assert.equal(opportunity.status, 201, `fixture opportunity: ${JSON.stringify(opportunity.body)}`);
  const proposal = await admin.post(`/companies/${COMPANY}/proposals`, {
    opportunityId: opportunity.body.id, title: 'Parity Proposal', items: [{ description: 'Package', quantity: 1, unitPrice: 100 }],
  });
  assert.equal(proposal.status, 201, `fixture proposal: ${JSON.stringify(proposal.body)}`);
  const campaign = await asOwner.post(`/companies/${COMPANY}/campaigns`, { name: 'Parity Campaign' });
  assert.equal(campaign.status, 201, `fixture campaign: ${JSON.stringify(campaign.body)}`);
  const vendorRequest = await asOwner.post(`/companies/${COMPANY}/vendor-requests`, { name: 'Parity Studio', role: 'Vendor' });
  assert.equal(vendorRequest.status, 201, `fixture vendor request: ${JSON.stringify(vendorRequest.body)}`);

  store.setWhatsappChatSettings(COMPANY, 'parity-chat@c.us', { visibility: 'private', ownerUserId: owner.id });

  const timeEntries = {};
  for (const role of ROLES) {
    const logged = await asOwner.post(`/tasks/${timedTask.id}/time-entries`, { hours: 1, note: `for ${role}` });
    assert.equal(logged.status, 201, `fixture time entry: ${JSON.stringify(logged.body)}`);
    timeEntries[role] = logged.body.id;
  }
  return { priced, hidden, privateProject, hiddenTask, opportunity: opportunity.body, proposal: proposal.body, campaign: campaign.body, vendorRequest: vendorRequest.body, timeEntries };
};

const has = (list, id) => Array.isArray(list) && list.some((item) => item.id === id);

/** Each probe answers "was this role allowed?" for one enforcement point. */
const PROBES = [
  ['PROJECTS_ALL_READ', 'GET /projects lists a private project they are not in', async (c, x) => has((await c.get('/projects')).body, x.privateProject.id)],
  ['TASKS_ALL_READ', 'GET /tasks lists a task they cannot otherwise see', async (c, x) => has((await c.get('/tasks')).body, x.hiddenTask.id)],
  ['TIME_ENTRIES_DELETE_OTHERS', "DELETE someone else's time entry", async (c, x, role) => (await c.delete(`/time-entries/${x.timeEntries[role]}`)).status === 200],
  ['CONTACTS_PRIVATE_READ', 'contact list includes a private contact owned by someone else', async (c, x) => has((await c.get(`/companies/${COMPANY}/contacts`)).body, x.hidden.id)],
  ['CONTACTS_PRICING_READ', 'contact summary shows the rate card', async (c, x) => (await c.get(`/contacts/${x.priced.id}/summary`)).body?.contact?.rateCardAmount === 900],
  ['CONTACTS_ALL_WRITE', "PATCH someone else's contact", async (c, x) => (await c.patch(`/contacts/${x.priced.id}`, { notes: 'parity' })).status === 200],
  ['CRM_ALL_READ', "opportunity list includes someone else's opportunity", async (c, x) => has((await c.get(`/companies/${COMPANY}/opportunities`)).body, x.opportunity.id)],
  ['CRM_ALL_READ', "proposal list includes a proposal on someone else's opportunity", async (c, x) => has((await c.get(`/companies/${COMPANY}/proposals`)).body, x.proposal.id)],
  ['CRM_ALL_READ', "vendor request list includes someone else's request", async (c, x) => has((await c.get(`/companies/${COMPANY}/vendor-requests`)).body, x.vendorRequest.id)],
  ['CRM_ALL_WRITE', "PUT someone else's opportunity", async (c, x) => (await c.put(`/opportunities/${x.opportunity.id}`, { notes: 'parity' })).status === 200],
  ['CRM_ALL_WRITE', "PUT someone else's vendor request", async (c, x) => (await c.put(`/vendor-requests/${x.vendorRequest.id}`, { details: 'parity' })).status === 200],
  ['CAMPAIGNS_ALL_READ', "campaign list includes someone else's campaign", async (c, x) => has((await c.get(`/companies/${COMPANY}/campaigns`)).body, x.campaign.id)],
  ['CAMPAIGNS_ALL_WRITE', "PUT someone else's campaign", async (c, x) => (await c.put(`/campaigns/${x.campaign.id}`, { notes: 'parity' })).status === 200],
  ['WHATSAPP_PRIVATE_READ', "read a private chat owned by someone else", async (c) => (await c.get(`/companies/${COMPANY}/whatsapp/messages?chatId=parity-chat@c.us`)).status === 200],
  ['DASHBOARD_OPERATIONS_READ', 'dashboard includes operations', async (c) => ['Admin', 'Manager'].includes((await c.get(`/companies/${COMPANY}/dashboard`)).body?.role)],
  ['DASHBOARD_FINANCE_READ', 'dashboard includes finance', async (c) => ['Admin', 'Accountant'].includes((await c.get(`/companies/${COMPANY}/dashboard`)).body?.role)],
  ['USERS_WRITE', 'add an Employee', async (c, x, role) => (await c.post('/users', {
    name: `Hire by ${role}`, email: `hire.${role.toLowerCase()}@parity.test`, password: 'password', role: 'Employee', companyRoles: [{ companyId: COMPANY, role: 'Employee' }],
  })).status === 201],
  ['ADMINISTRATION', 'add a Manager', async (c, x, role) => (await c.post('/users', {
    name: `Manager by ${role}`, email: `manager.${role.toLowerCase()}@parity.test`, password: 'password', role: 'Manager', companyRoles: [{ companyId: COMPANY, role: 'Manager' }],
  })).status === 201],
  ['ADMINISTRATION', 'create a permission group', async (c, x, role) => (await c.post(`/companies/${COMPANY}/permission-groups`, { name: `Parity ${role}` })).status === 201],
  ['GROUPS_READ', 'list permission groups', async (c) => (await c.get(`/companies/${COMPANY}/permission-groups`)).status === 200],
];

const outcomes = {};

for (const engine of ['legacy', 'openfga']) {
  test(`every record rule answers as the roles did — ${engine} engine`, async () => {
    const world = build(engine);
    const x = await fixtures(world);
    const mismatches = [];
    for (const [rule, what, probe] of PROBES) {
      for (const role of ROLES) {
        const allowed = await probe(world.as(world.users[role]), x, role);
        const expected = RECORD_RULES[rule].roles.includes(role);
        (outcomes[engine] ??= {})[`${rule} | ${what} | ${role}`] = allowed;
        if (allowed !== expected) mismatches.push(`${rule} — ${what} — ${role}: expected ${expected ? 'allowed' : 'denied'}, got ${allowed ? 'allowed' : 'denied'}`);
      }
    }
    assert.deepEqual(mismatches, [], `\n${mismatches.join('\n')}`);
  });
}

test('both engines reached identical outcomes for every probe', () => {
  assert.ok(outcomes.legacy && outcomes.openfga, 'both engine runs must complete first');
  assert.equal(Object.keys(outcomes.legacy).length, PROBES.length * ROLES.length);
  assert.deepEqual(outcomes.openfga, outcomes.legacy);
});

test('notification recipients are the same people under both engines', () => {
  const recipients = (engine, permission, roles) => {
    const { store } = build(engine);
    const emails = (ids) => ids.map((id) => store.getUserById(id).email).sort();
    return emails(store.listUserIdsWithPermission(COMPANY, permission, roles));
  };
  for (const [permission, roles] of [
    ['purchasing:approve', ['Admin', 'Manager']],
    ['invoices:read', ['Admin', 'Manager', 'Accountant']],
    ['vendor-bills:read', ['Admin', 'Manager', 'Accountant']],
    ['inventory:write', ['Admin', 'Manager']],
  ]) {
    const legacy = recipients('legacy', permission, roles);
    assert.ok(legacy.length > 0, `${permission}: fixture has recipients`);
    assert.deepEqual(recipients('openfga', permission, roles), legacy, permission);
  }
});
