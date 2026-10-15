const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const build = (portal = true) => {
  const dbPath = path.join(makeTmpDir('taskflow-conv-staff-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const staff = (role, name, email, c = company) => store.createUser({ name, email, password: 'x', role, companyIds: [c.id], companyRoles: [{ companyId: c.id, role }] });
  const carla = staff('Manager', 'Carla', 'carla@peak.test');
  const eve = staff('Employee', 'Eve', 'eve@peak.test');
  const foreign = staff('Manager', 'Fred', 'fred@other.test', other);
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: carla.id });
  const secret = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Secret Deal', roles: ['Client'], ownerUserId: carla.id });
  store.updateContact(secret.id, { visibility: 'Private' });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: portal ? company.id : undefined, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const clientSession = async () => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email: 'b@alnoor.test', name: 'Buyer', role: 'client_admin' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post('/portal-api/client/auth/login').send({ email: 'b@alnoor.test', password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { store, dbPath, company, server, carla, eve, foreign, client, secret, carlaAuth: auth(carla), eveAuth: auth(eve), clientSession };
};
const general = (ctx, contact) => ctx.store.conversations.generalThread(ctx.company.id, contact.id);

test('inbox views, counts and search', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  const unassigned = general(ctx, ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] }));
  const portalMsg = (thread) => ctx.store.conversations.addMessage({ threadId: thread.id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: 'p', body: 'hello' });
  portalMsg(t); portalMsg(unassigned);
  const get = (q, auth = ctx.carlaAuth) => request(ctx.server).get(`/companies/${ctx.company.id}/inbox${q}`).set(auth);
  const mine = await get('?view=mine');
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.threads.map((x) => x.contact.name), ['Al Noor Dates']);
  assert.deepEqual(mine.body.counts, { mine: 1, unassigned: 1, all: 2 });
  assert.deepEqual((await get('?view=unassigned')).body.threads.map((x) => x.contact.name), ['Sidr Honey']);
  assert.equal((await get('?view=all')).body.threads.length, 2);
  assert.equal((await get('?view=all&q=noor')).body.threads.length, 1);
  assert.equal((await get('?view=all&state=waiting_them')).body.threads.length, 0);
  assert.equal((await get('?view=all&state=open')).body.threads.length, 2);
});

test('a private contact is hidden from a non-owner and 404 by id', async () => {
  const ctx = build();
  const t = general(ctx, ctx.secret);
  ctx.store.conversations.addMessage({ threadId: t.id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: 'p', body: 'TOP-SECRET' });
  ctx.store.conversations.setAssignee(t.id, ctx.eve.id);
  const inbox = await request(ctx.server).get(`/companies/${ctx.company.id}/inbox?view=all`).set(ctx.eveAuth);
  assert.equal(JSON.stringify(inbox.body).includes('Secret Deal'), false);
  assert.deepEqual(inbox.body.counts, { mine: 0, unassigned: 0, all: 0 });
  for (const res of [
    await request(ctx.server).get(`/conversation-threads/${t.id}`).set(ctx.eveAuth),
    await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.secret.id}/conversation`).set(ctx.eveAuth),
    await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.eveAuth).send({ kind: 'note', body: 'x' }),
    await request(ctx.server).patch(`/conversation-threads/${t.id}`).set(ctx.eveAuth).send({ state: 'done' }),
  ]) assert.equal(res.status, 404);
  assert.equal((await request(ctx.server).get(`/conversation-threads/${t.id}`).set(ctx.carlaAuth)).status, 200);
  // Another company's member is refused outright.
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/inbox`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.foreign.id)}` })).status, 403);
  assert.equal((await request(ctx.server).get(`/conversation-threads/${t.id}`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.foreign.id)}` })).status, 403);
});

test('a portal reply waits on them, a client message waits on us, and read clears unread', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  const reply = await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'portal', body: 'Hi there' });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.visibility, 'external');
  assert.equal(reply.body.channel, 'portal');
  let detail = await request(ctx.server).get(`/conversation-threads/${t.id}`).set(ctx.carlaAuth);
  assert.equal(detail.body.thread.state, 'waiting_them');
  assert.equal(detail.body.thread.unread, false);
  assert.equal(detail.body.portalUsers, 0);
  const session = await ctx.clientSession();
  await request(ctx.server).post('/portal-api/client/messages').set(session).send({ body: 'Thanks!' });
  detail = await request(ctx.server).get(`/conversation-threads/${t.id}`).set(ctx.eveAuth);
  assert.equal(detail.body.thread.state, 'waiting_us');
  assert.equal(detail.body.portalUsers, 1);
  assert.equal(detail.body.messages.length, 2);
  const conv = await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/conversation`).set(ctx.carlaAuth);
  assert.equal(conv.body.conversation.owner.name, 'Carla');
  assert.equal(conv.body.threads.length, 1);
  assert.equal(conv.body.portalUsers, 1);
});

test('portal replies are refused where there is no portal', async () => {
  const ctx = build(false);
  const t = general(ctx, ctx.client);
  const res = await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'portal', body: 'hi' });
  assert.equal(res.status, 400);
  assert.match(res.body.error ?? res.body.message ?? JSON.stringify(res.body), /no client portal/);
  assert.equal(ctx.store.conversations.messages(t.id).length, 0);
  assert.equal((await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'ok' })).status, 201);
  const detail = await request(ctx.server).get(`/conversation-threads/${t.id}`).set(ctx.carlaAuth);
  assert.equal(detail.body.portalUsers, 0);
});

test('mentions: foreign user is a 400 and nothing is stored; a member is notified with a link', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  const url = `/conversation-threads/${t.id}/messages`;
  const bad = await request(ctx.server).post(url).set(ctx.carlaAuth).send({ kind: 'note', body: 'hey', mentionUserIds: [ctx.eve.id, ctx.foreign.id] });
  assert.equal(bad.status, 400);
  assert.equal(ctx.store.conversations.messages(t.id).length, 0);
  assert.equal(ctx.store.listNotifications(ctx.eve.id).length, 0);
  assert.equal((await request(ctx.server).post(url).set(ctx.carlaAuth).send({ kind: 'portal', body: 'hey', mentionUserIds: [ctx.eve.id] })).status, 400);
  const ok = await request(ctx.server).post(url).set(ctx.carlaAuth).send({ kind: 'note', body: 'look at this', mentionUserIds: [ctx.eve.id] });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.visibility, 'internal');
  assert.deepEqual(ok.body.mentions.map((m) => m.name), ['Eve']);
  const [n] = ctx.store.listNotifications(ctx.eve.id);
  assert.equal(n.link, `/inbox?thread=${t.id}&message=${ok.body.id}`);
  // A note changes no state.
  assert.equal(ctx.store.conversations.getThread(t.id).state, 'waiting_them');
});

test('notes are editable by their author for 15 minutes only', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  const note = (await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'first' })).body;
  assert.ok(note.editableUntil);
  const age = (min) => ctx.store.db.prepare('UPDATE conversation_messages SET createdAt = ? WHERE id = ?').run(new Date(Date.now() - min * 60000).toISOString(), note.id);
  const patch = (auth, body = 'second') => request(ctx.server).patch(`/conversation-messages/${note.id}`).set(auth).send({ body });
  assert.equal((await patch(ctx.eveAuth)).status, 403);
  age(10);
  const ok = await patch(ctx.carlaAuth);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.body, 'second');
  assert.ok(ok.body.editedAt);
  age(16);
  assert.equal((await patch(ctx.carlaAuth, 'third')).status, 409);
  assert.equal(ctx.store.conversations.getMessage(note.id).body, 'second');
  // Portal messages are never editable here.
  const portal = (await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'portal', body: 'x' })).body;
  assert.equal((await request(ctx.server).patch(`/conversation-messages/${portal.id}`).set(ctx.carlaAuth).send({ body: 'y' })).status, 403);
});

test('assign, done, and snooze rules; a woken snooze counts as waiting_us', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  // The inbox lists only threads with a message.
  ctx.store.conversations.addMessage({ threadId: t.id, channel: 'note', direction: 'none', visibility: 'internal', authorType: 'staff', authorUserId: ctx.carla.id, authorPortalUserId: null, body: 'n' });
  const patch = (body) => request(ctx.server).patch(`/conversation-threads/${t.id}`).set(ctx.carlaAuth).send(body);
  assert.equal((await patch({ assigneeUserId: ctx.foreign.id })).status, 400);
  const assigned = await patch({ assigneeUserId: ctx.eve.id });
  assert.equal(assigned.body.assignee.name, 'Eve');
  assert.equal((await patch({ assigneeUserId: null })).body.assignee, null);
  assert.equal((await patch({ state: 'done' })).body.state, 'done');
  assert.equal((await patch({ state: 'bogus' })).status, 400);
  assert.equal((await patch({ snoozedUntil: new Date(Date.now() - 1000).toISOString() })).status, 400);
  const future = new Date(Date.now() + 86400000).toISOString();
  const snoozed = await patch({ snoozedUntil: future });
  assert.equal(snoozed.body.state, 'snoozed');
  // Time passes: the snooze date is now in the past.
  ctx.store.db.prepare('UPDATE conversation_threads SET snoozedUntil = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), t.id);
  const inbox = await request(ctx.server).get(`/companies/${ctx.company.id}/inbox?view=all&state=waiting_us`).set(ctx.carlaAuth);
  assert.equal(inbox.body.threads.length, 1);
  assert.equal(inbox.body.threads[0].state, 'waiting_us');
  assert.equal(inbox.body.counts.all, 1);
});

test('a mention or assignee must be able to see a private contact', async () => {
  const ctx = build();
  const t = general(ctx, ctx.secret);
  const url = `/conversation-threads/${t.id}/messages`;
  const bad = await request(ctx.server).post(url).set(ctx.carlaAuth).send({ kind: 'note', body: 'psst', mentionUserIds: [ctx.eve.id] });
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(bad.body), /Eve cannot see this contact/);
  assert.equal(ctx.store.conversations.messages(t.id).length, 0);
  assert.equal(ctx.store.conversations.mentionsOf('x').length, 0);
  assert.equal(ctx.store.listNotifications(ctx.eve.id).length, 0);
  assert.equal(ctx.store.db.prepare('SELECT COUNT(*) n FROM conversation_mentions').get().n, 0);
  // The owner (a Manager) may be mentioned; a public contact still allows an Employee.
  const admin = ctx.store.createUser({ name: 'Ann', email: 'ann@peak.test', password: 'x', role: 'Admin', companyIds: [ctx.company.id], companyRoles: [{ companyId: ctx.company.id, role: 'Admin' }] });
  assert.equal((await request(ctx.server).post(url).set(ctx.carlaAuth).send({ kind: 'note', body: 'psst', mentionUserIds: [admin.id] })).status, 201);
  const pub = general(ctx, ctx.client);
  assert.equal((await request(ctx.server).post(`/conversation-threads/${pub.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'hi', mentionUserIds: [ctx.eve.id] })).status, 201);

  const patch = (id) => request(ctx.server).patch(`/conversation-threads/${t.id}`).set(ctx.carlaAuth).send({ assigneeUserId: id });
  const refused = await patch(ctx.eve.id);
  assert.equal(refused.status, 400);
  assert.equal(ctx.store.conversations.getThread(t.id).assigneeUserId, ctx.carla.id);
  assert.equal((await patch(admin.id)).status, 200);
});

test('mentions notify with the mention type', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'look', mentionUserIds: [ctx.eve.id] });
  const [n] = ctx.store.listNotifications(ctx.eve.id);
  assert.equal(n.type, 'mention');
  assert.equal(n.data.tKey, 'notif.mention.t');
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const upload = (ctx, threadId, auth) => request(ctx.server).post(`/conversation-threads/${threadId}/files`).set(auth).send({ fileName: 'a.png', contentBase64: PNG.toString('base64') });

test('an Employee without portal-manage can upload, attach to a note and download', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  const up = await upload(ctx, t.id, ctx.eveAuth);
  assert.equal(up.status, 201);
  // Unattached: only the uploader may read it.
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.eveAuth)).status, 200);
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.carlaAuth)).status, 404);
  const note = await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.eveAuth).send({ kind: 'note', body: 'see', fileIds: [up.body.id] });
  assert.equal(note.status, 201);
  const dl = await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.carlaAuth);
  assert.equal(dl.status, 200);
  assert.match(dl.headers['content-disposition'], /attachment/);
  assert.deepEqual(Buffer.from(dl.body), PNG);
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.foreign.id)}` })).status, 403);
});

test('files of a contact the viewer cannot see are 404 for upload and download', async () => {
  const ctx = build();
  const t = general(ctx, ctx.secret);
  assert.equal((await upload(ctx, t.id, ctx.eveAuth)).status, 404);
  const up = await upload(ctx, t.id, ctx.carlaAuth);
  assert.equal(up.status, 201);
  await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'x', fileIds: [up.body.id] });
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.eveAuth)).status, 404);
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.carlaAuth)).status, 200);
});

test('an owner_private attachment is not downloadable by others', async () => {
  const ctx = build();
  const t = general(ctx, ctx.client);
  const up = await upload(ctx, t.id, ctx.carlaAuth);
  const m = ctx.store.conversations.addMessage({ threadId: t.id, channel: 'note', direction: 'none', visibility: 'owner_private', authorType: 'staff', authorUserId: ctx.carla.id, authorPortalUserId: null, body: 'mine' });
  ctx.store.thread.attach([up.body.id], { type: 'message', id: m.id }, { companyId: ctx.company.id, contactId: ctx.client.id, uploader: { kind: 'staff', userId: ctx.carla.id } });
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.eveAuth)).status, 404);
  assert.equal((await request(ctx.server).get(`/conversation-files/${up.body.id}/content`).set(ctx.carlaAuth)).status, 200);
});

const routesFor = (ctx, t, fileId, messageId) => [
  ['inbox', request(ctx.server).get(`/companies/${ctx.company.id}/inbox?view=all`)],
  ['conversation', request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/conversation`)],
  ['thread', request(ctx.server).get(`/conversation-threads/${t.id}`)],
  ['send', request(ctx.server).post(`/conversation-threads/${t.id}/messages`).send({ kind: 'note', body: 'x' })],
  ['patch thread', request(ctx.server).patch(`/conversation-threads/${t.id}`).send({ state: 'done' })],
  ['patch message', request(ctx.server).patch(`/conversation-messages/${messageId}`).send({ body: 'y' })],
  ['upload', request(ctx.server).post(`/conversation-threads/${t.id}/files`).send({ fileName: 'a.png', contentBase64: PNG.toString('base64') })],
  ['download', request(ctx.server).get(`/conversation-files/${fileId}/content`)],
];

const seedForGate = async (ctx) => {
  const t = general(ctx, ctx.client);
  const up = await upload(ctx, t.id, ctx.carlaAuth);
  const note = await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'n', fileIds: [up.body.id] });
  return { t, fileId: up.body.id, messageId: note.body.id };
};

test('with the contacts module switched off every conversation route is 403', async () => {
  const ctx = build();
  const { t, fileId, messageId } = await seedForGate(ctx);
  ctx.store.updateCompany(ctx.company.id, { disabledModules: ['contacts'] });
  for (const [name, req] of routesFor(ctx, t, fileId, messageId)) {
    assert.equal((await req.set(ctx.carlaAuth)).status, 403, name);
  }
});

/** Serves permissions from the SQL group tables, standing in for OpenFGA (as permission-enforcement.test.js does). */
const sqlReader = (store) => ({
  async listGrantedObjects(userId) {
    const objects = [];
    for (const company of store.listCompanies()) {
      for (const perm of store.getEffectivePermissions(userId, company.id)) {
        const [module, action] = perm.split(':');
        objects.push(`permission:${company.id}/${module}/${action}`);
      }
    }
    return objects;
  },
});

test('openfga: no contacts:read is 403 everywhere; contacts:read without contacts:write cannot write', async () => {
  const dbPath = path.join(makeTmpDir('taskflow-conv-fga-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const user = (role, name, email) => store.createUser({ name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const carla = user('Manager', 'Carla', 'carla@peak.test');
  const nora = user('Employee', 'Nora', 'nora@peak.test');
  const rita = user('Employee', 'Rita', 'rita@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: carla.id });
  const group = (key, perms) => {
    const g = store.createPermissionGroup({ companyId: company.id, key, name: key });
    store.setGroupPermissions(g.id, perms.map((p) => { const [module, action] = p.split(':'); return { module, action }; }));
    return g.id;
  };
  store.setUserGroups(nora.id, company.id, [group('no-contacts', ['tasks:read'])]);
  store.setUserGroups(rita.id, company.id, [group('contacts-read', ['contacts:read'])]);
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'openfga',
    permissionReader: sqlReader(store), portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const ctx = { server, store, company, client, carlaAuth: { Authorization: `Bearer ${store.issueToken(carla.id)}` } };
  const { t, fileId, messageId } = await seedForGate(ctx);
  assert.equal((await request(server).get(`/conversation-threads/${t.id}`).set(ctx.carlaAuth)).status, 200, 'the Manager group has contacts');

  const noraAuth = { Authorization: `Bearer ${store.issueToken(nora.id)}` };
  for (const [name, req] of routesFor(ctx, t, fileId, messageId)) {
    assert.equal((await req.set(noraAuth)).status, 403, `no contacts:read → ${name}`);
  }
  const ritaAuth = { Authorization: `Bearer ${store.issueToken(rita.id)}` };
  const statuses = {};
  for (const [name, req] of routesFor(ctx, t, fileId, messageId)) statuses[name] = (await req.set(ritaAuth)).status;
  assert.deepEqual(statuses, {
    inbox: 200, conversation: 200, thread: 200, download: 200,
    send: 403, 'patch thread': 403, 'patch message': 403, upload: 403,
  });
});

test('an empty General thread stays out of the inbox until it has a message', async () => {
  const ctx = build();
  const opened = await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/conversation`).set(ctx.carlaAuth);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.threads.length, 1, 'the contact page still shows its General thread');
  const inbox = async (q) => (await request(ctx.server).get(`/companies/${ctx.company.id}/inbox${q}`).set(ctx.carlaAuth)).body.threads;
  assert.deepEqual(await inbox('?view=all'), []);
  assert.deepEqual(await inbox('?view=all&state=waiting_them'), []);
  const t = general(ctx, ctx.client);
  await request(ctx.server).post(`/conversation-threads/${t.id}/messages`).set(ctx.carlaAuth).send({ kind: 'portal', body: 'Hello' });
  assert.deepEqual((await inbox('?view=all&state=waiting_them')).map((x) => x.id), [t.id]);
  assert.deepEqual((await inbox('?view=all')).map((x) => x.id), [t.id]);
});

test('the legacy staff contact messages endpoints are gone', async () => {
  const ctx = build();
  const url = `/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`;
  assert.equal((await request(ctx.server).get(url).set(ctx.carlaAuth)).status, 404);
  assert.equal((await request(ctx.server).post(url).set(ctx.carlaAuth).send({ body: 'x' })).status, 404);
  assert.equal(ctx.store.conversations.messages(general(ctx, ctx.client).id).length, 0);
});

test('the legacy portal-files download follows contact and owner_private visibility for message files', async () => {
  const ctx = build();
  const admin = ctx.store.createUser({ name: 'Ann', email: 'ann2@peak.test', password: 'x', role: 'Manager', companyIds: [ctx.company.id], companyRoles: [{ companyId: ctx.company.id, role: 'Manager' }] });
  const annAuth = { Authorization: `Bearer ${ctx.store.issueToken(admin.id)}` };
  const legacy = (id, auth) => request(ctx.server).get(`/companies/${ctx.company.id}/portal-files/${id}/content`).set(auth);
  // owner_private on a public contact: only its author.
  const t = general(ctx, ctx.client);
  const up = await upload(ctx, t.id, ctx.carlaAuth);
  const m = ctx.store.conversations.addMessage({ threadId: t.id, channel: 'note', direction: 'none', visibility: 'owner_private', authorType: 'staff', authorUserId: ctx.carla.id, authorPortalUserId: null, body: 'mine' });
  ctx.store.thread.attach([up.body.id], { type: 'message', id: m.id }, { companyId: ctx.company.id, contactId: ctx.client.id, uploader: { kind: 'staff', userId: ctx.carla.id } });
  assert.equal((await legacy(up.body.id, ctx.carlaAuth)).status, 200);
  assert.equal((await legacy(up.body.id, annAuth)).status, 404);
  // Portal managers are Admin/Manager, who may read private contacts under legacy roles, so a private contact's note file stays readable.
  const s = general(ctx, ctx.secret);
  const up2 = await upload(ctx, s.id, ctx.carlaAuth);
  await request(ctx.server).post(`/conversation-threads/${s.id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'x', fileIds: [up2.body.id] });
  assert.equal((await legacy(up2.body.id, annAuth)).status, 200, 'Managers read private contacts');
});
