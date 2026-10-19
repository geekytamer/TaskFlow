/**
 * One read filter (authz/visible.ts) on every read path of the scoped areas.
 *
 * Poison fixtures: every record owned by someone outside the viewer's reach
 * carries a marker in its text (COLLEAGUE-, PEER-, R1-, R2-, LEAD-). A path
 * leaks when that marker appears anywhere in what it returns — list, detail,
 * search, CSV export, dashboard figures, inbox, notification body.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { effective, effectiveLegacy } = require('../dist/authz/evaluate');
const { visible, visibleRecord, AREAS } = require('../dist/authz/visible');
const { notifyThreadMessage, staffInboxBadge } = require('../dist/conversations/alerts');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };
const OUTSIDERS = ['COLLEAGUE', 'PEER', 'R1', 'R2', 'LEAD'];

/** The world: one company, its people, an HR line, and poison records per owner. */
const build = (engine) => {
  const dbPath = path.join(makeTmpDir(`taskflow-visible-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Acme', website: '', address: '' });
  const c = company.id;
  const mk = (name, role) => store.createUser({
    name, email: `${name.toLowerCase()}@visible.test`, role,
    companyIds: [c], companyRoles: [{ companyId: c, role }], password: 'x',
  });
  const u = {
    admin: mk('Admin', 'Admin'), manager: mk('Manager', 'Manager'), accountant: mk('Accountant', 'Accountant'),
    emp: mk('Emp', 'Employee'), colleague: mk('Colleague', 'Employee'),
    lead: mk('Lead', 'Employee'), r1: mk('R1', 'Employee'), r2: mk('R2', 'Employee'), peer: mk('Peer', 'Employee'),
  };
  // HR line: Lead ← R1 ← R2 (two levels); Peer reports to nobody.
  const eLead = store.createEmployee({ companyId: c, userId: u.lead.id, name: 'Lead' });
  const eR1 = store.createEmployee({ companyId: c, userId: u.r1.id, name: 'R1', managerId: eLead.id });
  store.createEmployee({ companyId: c, userId: u.r2.id, name: 'R2', managerId: eR1.id });
  store.createEmployee({ companyId: c, userId: u.peer.id, name: 'Peer' });

  const records = {};
  const seed = (user, tag) => {
    const contact = store.createContact({ companyId: c, name: `${tag}-CONTACT`, email: `${tag.toLowerCase()}@poison.test`, roles: ['Influencer', 'Lead'], ownerUserId: user.id, ownerName: user.name, visibility: 'Private', nextFollowupDate: new Date(Date.now() + 86400000), nextFollowupNote: `${tag}-NOTE` });
    const opp = store.createOpportunity({ companyId: c, contactId: contact.id, ownerUserId: user.id, ownerName: user.name, title: `${tag}-OPP`, serviceType: 'Campaign', stage: 'New', expectedRevenue: 100, probability: 50 });
    const proposal = store.createCrmProposal({ companyId: c, opportunityId: opp.id, title: `${tag}-PROP`, status: 'Draft', issueDate: new Date(), items: [] });
    const campaign = store.createCrmCampaign({ companyId: c, contactId: contact.id, opportunityId: opp.id, proposalId: proposal.id, projectId: null, notes: null, name: `${tag}-CAMP`, status: 'Planned', visibility: 'Public', ownerUserId: user.id, ownerName: user.name });
    const vendor = store.createVendorRequest({ companyId: c, name: `${tag}-VR`, role: 'Influencer', status: 'New', requestedByUserId: user.id, requestedByName: user.name });
    const commissionId = `com-${tag}`;
    store.db.prepare(`INSERT INTO commissions (id, companyId, opportunityId, contactId, userId, userName, serviceType, basis, basisAmount, amount, status, calculatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'revenue', 100, 7, 'Draft', ?)`).run(commissionId, c, opp.id, contact.id, user.id, `${tag}-COMMISSION`, `${tag}-SVC`, new Date().toISOString());
    const followup = store.createFollowup({ companyId: c, entityType: 'contact', entityId: contact.id, title: `${tag}-FU`, ownerUserId: user.id, ownerName: user.name, dueAt: new Date(Date.now() - 3600000) });
    const project = store.createProject({ name: `${tag}-PROJ`, companyId: c, visibility: 'Private', memberIds: [user.id] });
    const task = store.createTask({ title: `${tag}-TASK`, description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: c, projectId: project.id, assignedUserIds: [user.id], ownerId: user.id });
    const privateTask = store.createTask({ title: `${tag}-PTASK`, description: '', status: 'To Do', priority: 'High', tags: [], companyId: c, projectId: project.id, assignedUserIds: [user.id], ownerId: user.id, isPrivate: true });
    records[tag] = { contact, opp, proposal, campaign, vendor, commissionId, followup, project, task, privateTask };
  };
  seed(u.emp, 'EMP');
  seed(u.colleague, 'COLLEAGUE');
  seed(u.lead, 'LEAD');
  seed(u.r1, 'R1');
  seed(u.r2, 'R2');
  seed(u.peer, 'PEER');

  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c, permissionsEngine: engine });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const get = (user, url) => agent.get(url.replaceAll(':c', c)).set('Authorization', `Bearer ${store.issueToken(user.id)}`);
  return { engine, store, company, c, u, records, get };
};

const leaks = (text, outsiders = OUTSIDERS) => outsiders.filter((tag) => text.includes(`${tag}-`));
const body = (res) => (typeof res.body === 'object' && res.body !== null && Object.keys(res.body).length ? JSON.stringify(res.body) : res.text);

/** Give someone a custom main role (v2): `grants` as {key, scope?}. */
const mainRole = (store, companyId, userId, name, grants) => {
  const role = store.authz.saveRole(companyId, { name, grants, fields: [] }, null);
  store.authz.setAssignments(userId, companyId, { mainRoleId: role.id, addOnRoleIds: [] }, null);
  return role;
};

/** Everything an Employee can read on the scoped areas, as one comparable snapshot. */
const EMPLOYEE_PATHS = [
  '/companies/:c/contacts', '/companies/:c/contacts/export', '/companies/:c/influencers/export',
  '/companies/:c/search?q=contact', '/companies/:c/search?q=task', '/companies/:c/search?q=proj',
  '/companies/:c/opportunities', '/companies/:c/proposals', '/companies/:c/campaigns', '/companies/:c/vendor-requests',
  '/companies/:c/commissions', '/companies/:c/followups', '/companies/:c/crm-dashboard', '/companies/:c/crm-dashboard?ownerUserId=me',
  '/tasks', '/projects', '/companies/:c/inbox?view=all', '/companies/:c/dashboard',
];

const employeeSnapshot = async (w, user = w.u.emp) => {
  const out = {};
  for (const p of EMPLOYEE_PATHS) {
    const res = await w.get(user, p);
    assert.equal(res.status, 200, `${w.engine} ${p}: ${res.status} ${res.text.slice(0, 200)}`);
    out[p] = body(res);
  }
  return out;
};

/** Only the markers present, so snapshots compare across engines without ids or dates. */
const markers = (text) => [...new Set(text.match(/\b(EMP|COLLEAGUE|LEAD|R1|R2|PEER)-[A-Z]+/g) ?? [])].sort();

for (const engine of ['legacy', 'shadow', 'v2']) {
  test(`${engine}: an Employee (own scope) never receives a colleague's records on any read path`, async () => {
    const w = build(engine);
    const snap = await employeeSnapshot(w);
    for (const [p, text] of Object.entries(snap)) {
      assert.deepEqual(leaks(text), [], `${engine} ${p} leaks`);
    }
    // Not vacuous: their own records are there.
    for (const [p, marker] of [
      ['/companies/:c/contacts', 'EMP-CONTACT'], ['/companies/:c/contacts/export', 'EMP-CONTACT'], ['/companies/:c/influencers/export', 'EMP-CONTACT'],
      ['/companies/:c/search?q=contact', 'EMP-CONTACT'], ['/companies/:c/search?q=task', 'EMP-PTASK'], ['/companies/:c/search?q=proj', 'EMP-PROJ'],
      ['/companies/:c/opportunities', 'EMP-OPP'], ['/companies/:c/proposals', 'EMP-PROP'], ['/companies/:c/campaigns', 'EMP-CAMP'],
      ['/companies/:c/vendor-requests', 'EMP-VR'], ['/companies/:c/commissions', 'EMP-COMMISSION'], ['/companies/:c/followups', 'EMP-FU'],
      ['/companies/:c/crm-dashboard', 'EMP-CONTACT'], ['/tasks', 'EMP-PTASK'], ['/projects', 'EMP-PROJ'],
    ]) assert.ok(snap[p].includes(marker), `${engine} ${p} shows their own ${marker}`);

    // Details of a colleague's records: not found / refused, never their text.
    const col = w.records.COLLEAGUE;
    for (const [p, status] of [
      [`/contacts/${col.contact.id}/summary`, 404],
      [`/tasks/${col.task.id}`, 403],
      [`/tasks/${col.privateTask.id}`, 403],
      [`/projects/${col.project.id}`, 403],
      [`/campaigns/${col.campaign.id}/deliverables`, 403],
    ]) {
      const res = await w.get(w.u.emp, p);
      assert.equal(res.status, status, `${engine} ${p}`);
      assert.deepEqual(leaks(body(res)), [], `${engine} ${p} leaks`);
    }
    // The summary of a contact they own lists only opportunities and projects they see.
    const mine = await w.get(w.u.emp, `/contacts/${w.records.EMP.contact.id}/summary`);
    assert.equal(mine.status, 200);
    assert.deepEqual(leaks(body(mine)), []);
  });

  test(`${engine}: dashboard totals and paging equal the visible set`, async () => {
    const w = build(engine);
    const dash = (await w.get(w.u.emp, '/companies/:c/crm-dashboard')).body;
    const contacts = (await w.get(w.u.emp, '/companies/:c/contacts')).body;
    const opps = (await w.get(w.u.emp, '/companies/:c/opportunities')).body;
    const vrs = (await w.get(w.u.emp, '/companies/:c/vendor-requests')).body;
    const followups = (await w.get(w.u.emp, '/companies/:c/followups')).body;
    assert.equal(dash.activeContacts, contacts.length);
    assert.equal(dash.openOpportunities, opps.length);
    assert.equal(dash.openOpportunityValue, opps.reduce((s, o) => s + o.expectedRevenue, 0));
    assert.equal(dash.openVendorRequests, vrs.length);
    assert.equal(dash.openFollowups, followups.length);
    assert.equal(dash.commissionDraft, 7, 'only their own commission is counted');
    // Paging is applied after the filter: the first page is theirs, not empty.
    const page = (await w.get(w.u.emp, '/companies/:c/followups?limit=1')).body;
    assert.equal(page.length, 1);
    assert.ok(JSON.stringify(page).includes('EMP-FU'));
    // Management sees every one of them.
    const all = (await w.get(w.u.admin, '/companies/:c/crm-dashboard')).body;
    assert.equal(all.openOpportunities, 6);
    assert.equal(all.activeContacts, 6);
    // The main dashboard counts the tasks the person can open: an Admin's
    // total leaves out colleagues' private tasks, as their task list does.
    for (const who of ['admin', 'manager', 'emp']) {
      const metrics = (await w.get(w.u[who], '/companies/:c/dashboard')).body.metrics;
      const openTasks = metrics.find((m) => m.id === 'open-tasks');
      assert.ok(openTasks, `${who} has an open-tasks figure`);
      const listed = (await w.get(w.u[who], '/tasks')).body.filter((t) => t.status !== 'Done'
        && (who !== 'emp' || t.assignedUserIds.includes(w.u.emp.id)));
      assert.equal(openTasks.value, listed.length, `${who} open tasks`);
    }
    // The activity feed never names a record the person cannot see: a private
    // task created just now by a colleague is the newest event of all.
    const proj = w.records.COLLEAGUE.project;
    w.store.createTask({ title: 'COLLEAGUE-SECRET', description: '', status: 'To Do', priority: 'Low', tags: [], companyId: w.c, projectId: proj.id, assignedUserIds: [w.u.colleague.id], ownerId: w.u.colleague.id, isPrivate: true });
    for (const who of ['admin', 'manager', 'accountant', 'emp']) {
      const text = JSON.stringify((await w.get(w.u[who], '/companies/:c/dashboard')).body);
      assert.ok(!text.includes('COLLEAGUE-SECRET'), `${who} dashboard names a private task`);
    }
    assert.ok(JSON.stringify((await w.get(w.u.colleague, '/companies/:c/dashboard')).body).includes('COLLEAGUE-SECRET'), 'its owner sees it');
  });

  test(`${engine}: inbox list, badge and alert recipients follow the same rule`, async () => {
    const w = build(engine);
    const conv = w.store.conversations;
    const thread = conv.generalThread(w.c, w.records.COLLEAGUE.contact.id);
    // Even assigned to the Employee, a thread on a contact they cannot see does not reach them.
    conv.setAssignee(thread.id, w.u.emp.id);
    const message = conv.addMessage({ threadId: thread.id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: null, body: 'COLLEAGUE-MESSAGE body' });
    notifyThreadMessage(w.store, conv.getThread(thread.id), message);
    const empNotes = JSON.stringify(w.store.listNotifications(w.u.emp.id));
    assert.deepEqual(leaks(empNotes), [], 'no alert names the private contact or quotes it');
    const ownerNotes = JSON.stringify(w.store.listNotifications(w.u.colleague.id));
    assert.ok(ownerNotes.includes('COLLEAGUE-MESSAGE'), 'the owner hears about it instead');
    assert.equal(staffInboxBadge(w.store, w.u.emp.id, w.c), 0);
    const inbox = await w.get(w.u.emp, '/companies/:c/inbox?view=all');
    assert.equal(inbox.status, 200);
    assert.deepEqual(leaks(body(inbox)), []);
    assert.equal(inbox.body.counts.all, inbox.body.threads.filter((t) => t.state === 'waiting_us').length);
    // A Manager (company scope) sees it in their inbox.
    const mgr = await w.get(w.u.manager, '/companies/:c/inbox?view=all');
    assert.ok(body(mgr).includes('COLLEAGUE-CONTACT'));
  });

  test(`${engine}: a record share grants visibility at own scope`, async () => {
    const w = build(engine);
    const col = w.records.COLLEAGUE;
    w.store.authz.share(w.c, 'contacts', col.contact.id, w.u.emp.id, w.u.colleague.id);
    w.store.authz.share(w.c, 'crm', col.opp.id, w.u.emp.id, w.u.colleague.id);
    w.store.authz.share(w.c, 'tasks', col.privateTask.id, w.u.emp.id, w.u.colleague.id);
    const contacts = body(await w.get(w.u.emp, '/companies/:c/contacts'));
    assert.ok(contacts.includes('COLLEAGUE-CONTACT'));
    assert.equal((await w.get(w.u.emp, `/contacts/${col.contact.id}/summary`)).status, 200);
    const opps = body(await w.get(w.u.emp, '/companies/:c/opportunities'));
    assert.ok(opps.includes('COLLEAGUE-OPP'));
    // The proposal follows its (shared) opportunity.
    assert.ok(body(await w.get(w.u.emp, '/companies/:c/proposals')).includes('COLLEAGUE-PROP'));
    assert.equal((await w.get(w.u.emp, `/tasks/${col.privateTask.id}`)).status, 200);
    // Nothing else of theirs.
    assert.ok(!opps.includes('PEER-OPP'));
  });

  test(`${engine}: an Accountant (own contacts) cannot open a colleague's private contact; WhatsApp private chats stay private`, async () => {
    const w = build(engine);
    const col = w.records.COLLEAGUE;
    const detail = await w.get(w.u.accountant, `/contacts/${col.contact.id}`);
    assert.equal(detail.status, 404);
    assert.deepEqual(leaks(body(detail)), []);
    assert.equal((await w.get(w.u.accountant, `/contacts/${col.contact.id}/activities`)).status, 404);
    assert.equal((await w.get(w.u.manager, `/contacts/${col.contact.id}`)).status, 200);

    const msg = (chatId, phone, text) => w.store.createWhatsappMessage({
      companyId: w.c, instanceId: 'i1', direction: 'inbound', chatId, phone, type: 'text', body: text, status: 'received',
    });
    msg('chat-private', '96890000001', 'COLLEAGUE-WHATSAPP secret');
    msg('chat-shared', '96890000002', 'EMP-WHATSAPP hello');
    w.store.setWhatsappChatSettings(w.c, 'chat-private', { visibility: 'private', ownerUserId: w.u.admin.id });
    const chats = await w.get(w.u.accountant, '/companies/:c/whatsapp/chats');
    assert.equal(chats.status, 200);
    assert.deepEqual(leaks(body(chats)), []);
    assert.ok(body(chats).includes('EMP-WHATSAPP'));
    for (const q of ['', '?phone=96890000001', '?contactId=none']) {
      const res = await w.get(w.u.accountant, `/companies/:c/whatsapp/messages${q}`);
      assert.equal(res.status, 200);
      assert.deepEqual(leaks(body(res)), [], `messages${q}`);
    }
    assert.equal((await w.get(w.u.accountant, '/companies/:c/whatsapp/messages?chatId=chat-private')).status, 403);
    assert.ok(body(await w.get(w.u.manager, '/companies/:c/whatsapp/messages')).includes('COLLEAGUE-WHATSAPP'));
    // Shared with the Accountant: visible.
    w.store.authz.share(w.c, 'whatsapp', 'chat-private', w.u.accountant.id, w.u.admin.id);
    assert.ok(body(await w.get(w.u.accountant, '/companies/:c/whatsapp/chats')).includes('COLLEAGUE-WHATSAPP'));
  });
}

test('legacy, shadow and v2 (system templates) answer every read path identically', async () => {
  const snaps = {};
  for (const engine of ['legacy', 'shadow', 'v2']) {
    const w = build(engine);
    snaps[engine] = {};
    for (const who of ['admin', 'manager', 'accountant', 'emp']) {
      const s = await employeeSnapshot(w, w.u[who]);
      // The dashboard's activity feed is the last 40 events (ties in time are
      // unordered), so only its leak check (above) is compared, not its content.
      snaps[engine][who] = Object.fromEntries(Object.entries(s).filter(([p]) => p !== '/companies/:c/dashboard').map(([p, t]) => [p, markers(t)]));
    }
    if (engine === 'shadow') assert.deepEqual(w.store.listAuthzDivergences(), [], 'system roles never diverge');
  }
  assert.deepEqual(snaps.shadow, snaps.legacy);
  assert.deepEqual(snaps.v2, snaps.legacy);
  // Management (company scope) sees every owner's opportunities; the Employee only theirs.
  assert.deepEqual(snaps.legacy.manager['/companies/:c/opportunities'], ['COLLEAGUE-OPP', 'EMP-OPP', 'LEAD-OPP', 'PEER-OPP', 'R1-OPP', 'R2-OPP']);
  assert.deepEqual(snaps.legacy.emp['/companies/:c/opportunities'], ['EMP-OPP']);
  // Private tasks stay their owner's even for an Admin.
  assert.ok(!snaps.legacy.admin['/tasks'].includes('COLLEAGUE-PTASK'));
  assert.ok(snaps.legacy.admin['/tasks'].includes('COLLEAGUE-TASK'));
});

test('v2: a Manager with team scope (custom role) sees reports two levels down, not a peer', async () => {
  const w = build('v2');
  mainRole(w.store, w.c, w.u.lead.id, 'Team lead', [
    { key: 'contacts.view', scope: 'team' }, { key: 'contacts.export' }, { key: 'inbox.view', scope: 'team' },
    { key: 'crm.view', scope: 'team' }, { key: 'campaigns.view', scope: 'team' }, { key: 'commissions.view', scope: 'team' },
    { key: 'projects.view', scope: 'team' }, { key: 'tasks.view', scope: 'team' }, { key: 'dashboard.view' },
  ]);
  const team = ['LEAD', 'R1', 'R2'];
  const outside = ['COLLEAGUE', 'PEER', 'EMP'];
  for (const [p, kinds] of [
    ['/companies/:c/contacts', ['CONTACT']], ['/companies/:c/contacts/export', ['CONTACT']],
    ['/companies/:c/opportunities', ['OPP']], ['/companies/:c/proposals', ['PROP']], ['/companies/:c/campaigns', ['CAMP']],
    ['/companies/:c/vendor-requests', ['VR']], ['/companies/:c/commissions', ['COMMISSION']], ['/companies/:c/followups', ['FU']],
    ['/tasks', ['TASK']], ['/projects', ['PROJ']], ['/companies/:c/search?q=contact', ['CONTACT']],
  ]) {
    const res = await w.get(w.u.lead, p);
    assert.equal(res.status, 200, `${p}: ${res.text.slice(0, 200)}`);
    const text = body(res);
    for (const tag of team) for (const k of kinds) assert.ok(text.includes(`${tag}-${k}`), `${p} shows ${tag}-${k}`);
    assert.deepEqual(leaks(text, outside), [], `${p} leaks outside the team`);
  }
  // A report's private task stays theirs (private beats team scope).
  assert.ok(!body(await w.get(w.u.lead, '/tasks')).includes('R1-PTASK'));
  // Figures of a report are reachable; a peer's are not.
  assert.equal((await w.get(w.u.lead, `/companies/:c/crm-dashboard?ownerUserId=${w.u.r2.id}`)).status, 200);
  assert.equal((await w.get(w.u.lead, `/companies/:c/crm-dashboard?ownerUserId=${w.u.peer.id}`)).status, 403);
  // Detail: a report's private contact opens, a peer's does not exist.
  assert.equal((await w.get(w.u.lead, `/contacts/${w.records.R2.contact.id}/summary`)).status, 200);
  assert.equal((await w.get(w.u.lead, `/contacts/${w.records.PEER.contact.id}/summary`)).status, 404);
  // Inbox alerts use the same team reach.
  const thread = w.store.conversations.generalThread(w.c, w.records.R2.contact.id);
  w.store.conversations.setAssignee(thread.id, w.u.lead.id);
  const m = w.store.conversations.addMessage({ threadId: thread.id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: null, body: 'R2-MESSAGE' });
  notifyThreadMessage(w.store, w.store.conversations.getThread(thread.id), m);
  assert.ok(JSON.stringify(w.store.listNotifications(w.u.lead.id)).includes('R2-MESSAGE'));
});

test('visible(): one table; company scope is everything, team reaches the line, own reaches me', () => {
  const w = build('v2');
  const { store, c, u } = w;
  // Every area is declared with an existing table and a scoped key.
  for (const [area, rule] of Object.entries(AREAS)) {
    assert.ok(/^[a-z-]+\.view$/.test(rule.key), area);
  }
  const admin = effective(store, u.admin.id);
  assert.equal(visible(admin, 'opportunities', c).sql, '1=1');
  const emp = effectiveLegacy(store, u.emp.id);
  const names = (eff, area, table, col) => {
    const f = visible(eff, area, c, { alias: 'x' });
    return store.db.prepare(`SELECT ${col} AS n FROM ${table} x WHERE x.companyId = ? AND ${f.sql} ORDER BY n`).all(c, ...f.params).map((r) => r.n);
  };
  assert.deepEqual(names(emp, 'opportunities', 'opportunities', 'title'), ['EMP-OPP']);
  // Public contacts are visible to anyone with the area.
  store.updateContact(w.records.PEER.contact.id, { visibility: 'Public' });
  assert.deepEqual(names(emp, 'contacts', 'contacts', 'name'), ['EMP-CONTACT', 'PEER-CONTACT']);
  mainRole(store, c, u.lead.id, 'Team lead', [{ key: 'crm.view', scope: 'team' }]);
  const lead = effective(store, u.lead.id);
  assert.deepEqual(names(lead, 'opportunities', 'opportunities', 'title'), ['LEAD-OPP', 'R1-OPP', 'R2-OPP']);
  // No grant: an own-default area shows their own; projects show nothing.
  assert.deepEqual(names(lead, 'campaigns', 'crm_campaigns', 'name'), ['LEAD-CAMP']);
  assert.deepEqual(names(lead, 'projects', 'projects', 'name'), []);
  // Single record: the same rule.
  const one = (eff, area, id) => store.db.prepare(visibleRecord(eff, area, c, id).sql).get(...visibleRecord(eff, area, c, id).params) !== undefined;
  assert.equal(one(lead, 'opportunities', w.records.R2.opp.id), true);
  assert.equal(one(lead, 'opportunities', w.records.PEER.opp.id), false);
  assert.equal(one(emp, 'opportunities', w.records.EMP.opp.id), true);
  // Values are bound, never pasted: a hostile user id matches nothing extra.
  const hostile = { userId: "x' OR '1'='1", byCompany: new Map(), team: () => new Set() };
  assert.deepEqual(names(hostile, 'opportunities', 'opportunities', 'title'), []);
});
