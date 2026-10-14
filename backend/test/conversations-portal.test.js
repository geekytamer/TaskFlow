const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { currentEvents } = require('../dist/portal/alerts');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-conv-portal-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const carla = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: carla.id });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Rival Co', roles: ['Client'], ownerUserId: carla.id });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const session = async (contact, email) => {
    const { token, user } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: contact.id, email, name: email, role: 'client_admin' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post('/portal-api/client/auth/login').send({ email, password: PASSWORD });
    return { headers: { Authorization: `Bearer ${res.body.token}` }, id: user.id };
  };
  const c = store.conversations;
  const general = (contact) => c.generalThread(company.id, contact.id);
  const topic = (contact, subject) => {
    const g = general(contact);
    const id = require('node:crypto').randomUUID();
    store.db.prepare("INSERT INTO conversation_threads (id, conversationId, companyId, subject, contextType, contextId, assigneeUserId, state, createdAt) VALUES (?, ?, ?, ?, 'opportunity', ?, ?, 'waiting_them', ?)")
      .run(id, g.conversationId, company.id, subject, 'opp-' + subject, carla.id, new Date().toISOString());
    return c.getThread(id);
  };
  const staffSays = (thread, body, extra = {}) => c.addMessage({ threadId: thread.id, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff', authorUserId: carla.id, authorPortalUserId: null, body, ...extra });
  const note = (thread, body) => c.addMessage({ threadId: thread.id, channel: 'note', direction: 'none', visibility: 'internal', authorType: 'staff', authorUserId: carla.id, authorPortalUserId: null, body });
  return { store, dbPath, company, carla, client, rival, server, session, general, topic, staffSays, note };
};

test('a client lists only their own threads; General always, topics only with a portal-visible message', async () => {
  const ctx = build();
  const me = await ctx.session(ctx.client, 'b@alnoor.test');
  const visibleTopic = ctx.topic(ctx.client, 'Dates order');
  const noteOnly = ctx.topic(ctx.client, 'Hidden topic');
  const theirs = ctx.topic(ctx.rival, 'Rival topic');
  ctx.staffSays(visibleTopic, 'Quote attached');
  ctx.note(noteOnly, 'POISON-NOTE');
  ctx.staffSays(theirs, 'RIVAL-SECRET');
  ctx.store.conversations.addMessage({ threadId: ctx.general(ctx.rival).id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: 'x', body: 'RIVAL-GENERAL' });

  const res = await request(ctx.server).get('/portal-api/client/threads').set(me.headers);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((t) => t.subject).sort(), ['Dates order', 'General']);
  assert.deepEqual(res.body[0].lastMessage, { body: 'Quote attached', authorKind: 'team' });
  assert.equal(res.body[0].unread, true);
  assert.equal(res.body.find((t) => t.subject === 'General').lastMessage, null);
  assert.equal(/POISON|RIVAL/.test(JSON.stringify(res.body)), false);
});

test('another contact\'s thread id is 404 on every portal thread route', async () => {
  const ctx = build();
  const me = await ctx.session(ctx.client, 'b@alnoor.test');
  const theirs = ctx.topic(ctx.rival, 'Rival topic');
  ctx.staffSays(theirs, 'RIVAL-SECRET');
  for (const res of [
    await request(ctx.server).get(`/portal-api/client/threads/${theirs.id}`).set(me.headers),
    await request(ctx.server).post(`/portal-api/client/threads/${theirs.id}/messages`).set(me.headers).send({ body: 'hi' }),
    await request(ctx.server).get('/portal-api/client/threads/nope').set(me.headers),
  ]) assert.equal(res.status, 404);
  assert.equal(ctx.store.conversations.messages(theirs.id).length, 1);
});

test('internal notes and owner_private never appear in a portal response', async () => {
  const ctx = build();
  const me = await ctx.session(ctx.client, 'b@alnoor.test');
  const g = ctx.general(ctx.client);
  ctx.staffSays(g, 'Hello from Peak');
  ctx.note(g, 'POISON-NOTE');
  ctx.staffSays(g, 'POISON-PRIVATE', { channel: 'note', direction: 'none', visibility: 'owner_private' });
  const t = await request(ctx.server).get(`/portal-api/client/threads/${g.id}`).set(me.headers);
  const legacy = await request(ctx.server).get('/portal-api/client/messages').set(me.headers);
  const list = await request(ctx.server).get('/portal-api/client/threads').set(me.headers);
  for (const res of [t, legacy, list]) { assert.equal(res.status, 200); assert.equal(/POISON/.test(JSON.stringify(res.body)), false); }
  assert.deepEqual(t.body.messages.map((m) => m.body), ['Hello from Peak']);
  assert.deepEqual(legacy.body.map((m) => m.body), ['Hello from Peak']);
  assert.equal(t.body.messages[0].author.kind, 'team');
});

test('opening a thread marks it read and shows Seen on the staff message; posting a message waits on us', async () => {
  const ctx = build();
  const me = await ctx.session(ctx.client, 'b@alnoor.test');
  const g = ctx.general(ctx.client);
  const sent = ctx.staffSays(g, 'Please confirm');
  const staff = { Authorization: `Bearer ${ctx.store.issueToken(ctx.carla.id)}` };
  const seenOf = async () => (await request(ctx.server).get(`/conversation-threads/${g.id}`).set(staff)).body.messages.find((m) => m.id === sent.id).seenAt;
  assert.equal(await seenOf(), null);
  const list1 = await request(ctx.server).get('/portal-api/client/threads').set(me.headers);
  assert.equal(list1.body[0].unread, true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await request(ctx.server).get(`/portal-api/client/threads/${g.id}`).set(me.headers)).status, 200);
  assert.ok(await seenOf());
  assert.equal((await request(ctx.server).get('/portal-api/client/threads').set(me.headers)).body[0].unread, false);

  const post = await request(ctx.server).post(`/portal-api/client/threads/${g.id}/messages`).set(me.headers).send({ body: 'Confirmed' });
  assert.equal(post.status, 201);
  assert.equal(post.body.body, 'Confirmed');
  assert.equal(post.body.author.kind, 'you');
  assert.equal(ctx.store.conversations.getThread(g.id).state, 'waiting_us');
  const m = ctx.store.conversations.getMessage(post.body.id);
  assert.deepEqual([m.channel, m.direction, m.visibility], ['portal', 'in', 'external']);
  assert.equal((await request(ctx.server).post(`/portal-api/client/threads/${g.id}/messages`).set(me.headers).send({ body: '  ' })).status, 400);
  // The reply follow-up now links into the inbox thread.
  const link = ctx.store.db.prepare('SELECT link FROM notifications WHERE companyId = ? ORDER BY createdAt DESC').all(ctx.company.id).map((r) => r.link);
  assert.ok(link.includes(`/inbox?thread=${g.id}`), `links: ${link}`);
});

test('legacy /client/messages reads and writes the General thread, never account_messages', async () => {
  const ctx = build();
  const me = await ctx.session(ctx.client, 'b@alnoor.test');
  const post = await request(ctx.server).post('/portal-api/client/messages').set(me.headers).send({ body: 'Legacy hello' });
  assert.equal(post.status, 201);
  assert.deepEqual(Object.keys(post.body).sort(), ['author', 'body', 'createdAt', 'files', 'id']);
  const g = ctx.general(ctx.client);
  assert.deepEqual(ctx.store.conversations.messages(g.id).map((m) => m.body), ['Legacy hello']);
  assert.equal(ctx.store.db.prepare('SELECT COUNT(*) AS n FROM account_messages').get().n, 0);
  const staff = { Authorization: `Bearer ${ctx.store.issueToken(ctx.carla.id)}` };
  const reply = await request(ctx.server).post(`/companies/${ctx.company.id}/contacts/${ctx.client.id}/messages`).set(staff).send({ body: 'Staff legacy' });
  assert.equal(reply.status, 201);
  assert.equal(ctx.store.conversations.getThread(g.id).state, 'waiting_them');
  assert.equal(ctx.store.db.prepare('SELECT COUNT(*) AS n FROM account_messages').get().n, 0);
  const get = await request(ctx.server).get('/portal-api/client/messages').set(me.headers);
  assert.deepEqual(get.body.map((m) => m.body), ['Legacy hello', 'Staff legacy']);
});

test('portal message alerts fire for staff external portal messages only', async () => {
  const ctx = build();
  const me = await ctx.session(ctx.client, 'b@alnoor.test');
  const user = ctx.store.portal.getUser(me.id);
  const g = ctx.general(ctx.client);
  assert.deepEqual(currentEvents(ctx.store, user).filter((e) => e.event === 'message'), []);
  const sent = ctx.staffSays(g, 'Ping');
  ctx.note(g, 'internal');
  assert.deepEqual(currentEvents(ctx.store, user).filter((e) => e.event === 'message').map((e) => e.refId), [sent.id]);
});
