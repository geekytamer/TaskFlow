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

test('the old contact messages endpoint still returns the history through the General thread', async () => {
  const ctx = build();
  const session = await ctx.clientSession();
  await request(ctx.server).post('/portal-api/client/messages').set(session).send({ body: 'From client' });
  const sent = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(ctx.carlaAuth).send({ body: 'From staff' });
  assert.equal(sent.status, 201);
  await request(ctx.server).post(`/conversation-threads/${general(ctx, ctx.client).id}/messages`).set(ctx.carlaAuth).send({ kind: 'note', body: 'INTERNAL' });
  const old = await request(ctx.server).get(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(ctx.carlaAuth);
  assert.deepEqual(old.body.messages.map((m) => [m.author.type, m.body]), [['portal', 'From client'], ['staff', 'From staff']]);
  assert.equal(ctx.store.conversations.getThread(general(ctx, ctx.client).id).state, 'waiting_them');
});
