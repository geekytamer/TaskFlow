const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { notifyThreadMessage, sweepResponseOverdue, dispatchStaffPush, flushThreadPushes } = require('../dist/conversations/alerts');
const { makeTmpDir } = require('./helpers/tmp');

/** Staff alerts for conversation messages: grouped per thread, throttled on the phone, previewed only when allowed. */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const tick = () => new Promise((r) => setTimeout(r, 30));
const device = (name) => ({ endpoint: `https://push.example/send/${name}`, keys: { p256dh: 'BKey', auth: 'auth' } });
const MIN = 60_000;

const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-conv-alerts-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const member = (name, role) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const carla = member('Carla', 'Manager');
  const dan = member('Dan', 'Member');
  const ada = member('Ada', 'Admin');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Mouj Café', roles: ['Client'], ownerUserId: carla.id });
  const sent = [];
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
    push: { publicKey: 'BKeyForTests', send: async (s, payload) => { sent.push({ endpoint: s.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; } },
  }).listen(0);
  server.unref();
  const staff = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  for (const [user, name] of [[carla, 'carla'], [dan, 'dan'], [ada, 'ada']]) {
    assert.equal((await request(server).post('/push/subscribe').set(staff(user)).send(device(name))).status, 201);
  }
  const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: client.id, email: 'b@mouj.test', name: 'Badr', role: 'client_admin' });
  store.portal.acceptInvitation(token, PASSWORD);
  const login = await request(server).post('/portal-api/client/auth/login').send({ email: 'b@mouj.test', password: PASSWORD });
  const portal = { Authorization: `Bearer ${login.body.token}` };
  const general = store.conversations.generalThread(company.id, client.id);
  const clientSays = async (body) => {
    const res = await request(server).post(`/portal-api/client/threads/${general.id}/messages`).set(portal).send({ body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body;
  };
  const alertsOf = (user, type = 'message_received') =>
    store.db.prepare('SELECT * FROM notifications WHERE userId = ? AND type = ? ORDER BY createdAt').all(user.id, type)
      .map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
  const pushesTo = (name) => sent.filter((p) => p.endpoint.endsWith(`/${name}`));
  return { store, server, company, carla, dan, ada, client, general, staff, portal, sent, clientSays, alertsOf, pushesTo };
};

test('five client messages in a minute are one unread alert with count 5 and one phone push', async () => {
  const ctx = await build();
  let last;
  for (let i = 1; i <= 5; i += 1) last = await ctx.clientSays(`Question ${i}`);
  await tick();
  const alerts = ctx.alertsOf(ctx.carla);
  assert.equal(alerts.length, 1, 'grouped into one alert');
  const [a] = alerts;
  assert.equal(a.readAt, null);
  assert.equal(a.category, 'messages');
  assert.equal(a.data.count, 5);
  assert.equal(a.data.messageId, last.id);
  assert.equal(a.title, '5 new messages from Al Mouj Café');
  assert.equal(a.link, `/inbox?thread=${ctx.general.id}&message=${last.id}`);
  const pushes = ctx.pushesTo('carla');
  assert.equal(pushes.length, 1, 'one push inside the two-minute window');
  assert.equal(pushes[0].tag, `thread:${ctx.general.id}`);
  assert.equal(ctx.pushesTo('ada').length, 0, 'the owner gets it, not the admins');

  // The trailing edge: once the window has passed, the held-back messages go out as one push with the count.
  const flushed = [];
  const send = async (s, payload) => { flushed.push({ endpoint: s.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; };
  assert.equal(await flushThreadPushes(ctx.store, send, Date.now() + 30_000), 0, 'not inside the window');
  assert.equal(await flushThreadPushes(ctx.store, send, Date.now() + 3 * MIN), 1);
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].title, '5 new messages from Al Mouj Café');
  assert.equal(flushed[0].tag, `thread:${ctx.general.id}`);
  assert.equal(flushed[0].body, 'Question 5');
  assert.equal(await flushThreadPushes(ctx.store, send, Date.now() + 10 * MIN), 0, 'nothing new since the last push');
  assert.equal(flushed.length, 1);
});

test('handling a thread in the inbox reads its alerts, so the count starts over', async () => {
  const ctx = await build();
  for (let i = 1; i <= 3; i += 1) await ctx.clientSays(`Q${i}`);
  assert.equal(ctx.alertsOf(ctx.carla)[0].data.count, 3);
  ctx.store.conversations.setSettings(ctx.company.id, { responseTargetHours: 1, workDays: [0, 1, 2, 3, 4, 5, 6], dayStart: '00:00', dayEnd: '23:59', timeZone: 'UTC' });
  assert.equal(sweepResponseOverdue(ctx.store, ctx.company.id, new Date(Date.now() + 2 * 3_600_000).toISOString()), 1);
  // Dan has an alert too (an older one, still unread): opening it as Carla leaves his alone.
  ctx.store.notify({ companyId: ctx.company.id, userIds: [ctx.dan.id], type: 'message_received', title: 'x', entityType: 'conversation_thread', entityId: ctx.general.id, data: { count: 1 } });

  assert.equal((await request(ctx.server).get(`/conversation-threads/${ctx.general.id}`).set(ctx.staff(ctx.carla))).status, 200);
  assert.equal(ctx.alertsOf(ctx.carla).every((a) => a.readAt), true, 'opening the thread reads the message alert');
  assert.equal(ctx.alertsOf(ctx.carla, 'response_overdue').every((a) => a.readAt), true, 'and the overdue warning');
  assert.equal(ctx.alertsOf(ctx.dan)[0].readAt, null, 'only the reader\'s own alerts');

  await ctx.clientSays('Q4');
  const fresh = ctx.alertsOf(ctx.carla).filter((a) => !a.readAt);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].data.count, 1, 'starts over');

  const reply = await request(ctx.server).post(`/conversation-threads/${ctx.general.id}/messages`).set(ctx.staff(ctx.carla)).send({ kind: 'portal', body: 'Answered' });
  assert.equal(reply.status, 201);
  assert.equal(ctx.alertsOf(ctx.carla).every((a) => a.readAt), true, 'replying reads it too');
});

test('alerts follow the contact\'s current owner and never reach someone who cannot see a private contact', async () => {
  const ctx = await build();
  const employee = (name) => ctx.store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role: 'Employee', companyIds: [ctx.company.id], companyRoles: [{ companyId: ctx.company.id, role: 'Employee' }] });
  const eve = employee('Eve');
  const fay = employee('Fay');
  const secret = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Quiet Client', roles: ['Client'], ownerUserId: eve.id });
  ctx.store.updateContact(secret.id, { visibility: 'Private' });
  const { token } = ctx.store.portal.inviteUser({ companyId: ctx.company.id, audience: 'client', contactId: secret.id, email: 'q@quiet.test', name: 'Q', role: 'client_admin' });
  ctx.store.portal.acceptInvitation(token, PASSWORD);
  const login = await request(ctx.server).post('/portal-api/client/auth/login').send({ email: 'q@quiet.test', password: PASSWORD });
  const thread = ctx.store.conversations.generalThread(ctx.company.id, secret.id);
  const say = async (body) => assert.equal((await request(ctx.server).post(`/portal-api/client/threads/${thread.id}/messages`).set({ Authorization: `Bearer ${login.body.token}` }).send({ body })).status, 201);

  await say('For Eve');
  assert.equal(ctx.alertsOf(eve).length, 1, 'the owner hears');

  // Ownership moves to Fay; the conversation row still remembers Eve.
  ctx.store.updateContact(secret.id, { ownerUserId: fay.id });
  assert.equal(ctx.store.conversations.findConversation(ctx.company.id, secret.id).ownerUserId, eve.id);
  ctx.store.conversations.setAssignee(thread.id, null);
  await say('POISON-AFTER-MOVE');
  assert.equal(ctx.alertsOf(fay).length, 1, 'the new owner hears');
  assert.equal(ctx.alertsOf(eve)[0].data.count, 1, 'the former owner hears nothing more');
  assert.equal(/POISON/.test(JSON.stringify(ctx.alertsOf(eve))), false);

  // An assignee who cannot see the private contact is not told either.
  ctx.store.conversations.setAssignee(thread.id, eve.id);
  await say('POISON-ASSIGNEE');
  assert.equal(/POISON-ASSIGNEE/.test(JSON.stringify(ctx.alertsOf(eve))), false);
  assert.equal(ctx.alertsOf(eve).filter((a) => !a.readAt).every((a) => a.data.count === 1), true);
});

test('a partial preferences update keeps the channels it did not send', async () => {
  const ctx = await build();
  const res = await request(ctx.server).put('/notifications/preferences').set(ctx.staff(ctx.dan)).send({ messages: { inApp: true, push: false } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.messages, { inApp: true, email: false, push: false });
  assert.deepEqual(res.body.tasks, { inApp: true, email: true, push: true });
});

test('a sixth message after two minutes pushes again with the current count', async () => {
  const ctx = await build();
  const captured = [];
  ctx.store.setOnNotificationsCreated((ns) => captured.push(...ns));
  const sent = [];
  const send = async (s, payload) => { sent.push(JSON.parse(payload)); return { statusCode: 201 }; };
  const c = ctx.store.conversations;
  const t0 = Date.parse('2026-10-15T08:00:00Z');
  const say = async (body, at) => {
    const m = c.addMessage({ threadId: ctx.general.id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: 'p1', body });
    captured.length = 0;
    notifyThreadMessage(ctx.store, c.getThread(ctx.general.id), m);
    await dispatchStaffPush(ctx.store, send, [...captured], at);
  };
  for (let i = 0; i < 5; i += 1) await say(`Message ${i + 1}`, t0 + i * 10_000);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, 'New message from Al Mouj Café');
  await say('Message 6', t0 + 3 * MIN);
  assert.equal(sent.length, 2, 'the window has passed');
  assert.equal(sent[1].title, '6 new messages from Al Mouj Café');
  assert.equal(sent[1].tag, `thread:${ctx.general.id}`);
  assert.equal(ctx.alertsOf(ctx.carla).length, 1, 'still one alert');
  assert.equal(ctx.alertsOf(ctx.carla)[0].data.count, 6);
});

test('a read alert starts a new one; recipients fall back from assignee to owner to admins', async () => {
  const ctx = await build();
  await ctx.clientSays('Hello');
  const [first] = ctx.alertsOf(ctx.carla);
  ctx.store.markNotificationRead(ctx.carla.id, first.id);
  await ctx.clientSays('Again');
  const alerts = ctx.alertsOf(ctx.carla);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].data.count, 1);

  ctx.store.conversations.setAssignee(ctx.general.id, ctx.dan.id);
  await ctx.clientSays('For Dan');
  assert.equal(ctx.alertsOf(ctx.dan).length, 1);

  ctx.store.conversations.setAssignee(ctx.general.id, null);
  ctx.store.db.prepare('UPDATE contacts SET ownerUserId = NULL WHERE id = ?').run(ctx.client.id);
  await ctx.clientSays('Anyone?');
  assert.equal(ctx.alertsOf(ctx.ada).length, 1, 'no assignee and no owner: the admins');
});

test('the legacy portal messages route alerts the same way', async () => {
  const ctx = await build();
  const res = await request(ctx.server).post('/portal-api/client/messages').set(ctx.portal).send({ body: 'Legacy hello' });
  assert.equal(res.status, 201);
  const [a] = ctx.alertsOf(ctx.carla);
  assert.equal(a.data.messageId, res.body.id);
});

test('assigning a thread notifies the new assignee', async () => {
  const ctx = await build();
  const res = await request(ctx.server).patch(`/conversation-threads/${ctx.general.id}`).set(ctx.staff(ctx.carla)).send({ assigneeUserId: ctx.dan.id });
  assert.equal(res.status, 200);
  await tick();
  const [a] = ctx.alertsOf(ctx.dan, 'thread_assigned');
  assert.ok(a, 'Dan is told');
  assert.equal(a.category, 'messages');
  assert.equal(a.link, `/inbox?thread=${ctx.general.id}`);
  assert.match(a.title, /Al Mouj Café/);
  assert.equal(ctx.pushesTo('dan').length, 1);
  // Assigning yourself is not news.
  await request(ctx.server).patch(`/conversation-threads/${ctx.general.id}`).set(ctx.staff(ctx.carla)).send({ assigneeUserId: ctx.carla.id });
  assert.equal(ctx.alertsOf(ctx.carla, 'thread_assigned').length, 0);
});

test('a client message no longer raises a reply follow-up', async () => {
  const ctx = await build();
  await ctx.clientSays('Any news?');
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { status: 'active', entityType: 'contact', entityId: ctx.client.id })
    .filter((f) => f.sourceTrigger === 'portal_message');
  assert.equal(followups.length, 0);
  assert.equal(ctx.alertsOf(ctx.carla, 'followup_assigned').length, 0);
});

test('response_overdue fires once per waiting episode and again for a new one', async () => {
  const ctx = await build();
  const c = ctx.store.conversations;
  c.setSettings(ctx.company.id, { responseTargetHours: 1, workDays: [0, 1, 2, 3, 4, 5, 6], dayStart: '00:00', dayEnd: '23:59', timeZone: 'UTC' });
  await ctx.clientSays('Waiting on you');
  const later = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
  assert.equal(sweepResponseOverdue(ctx.store, ctx.company.id, later(0.25)), 0, 'not yet red');
  assert.equal(sweepResponseOverdue(ctx.store, ctx.company.id, later(2)), 1);
  assert.equal(sweepResponseOverdue(ctx.store, ctx.company.id, later(3)), 0, 'once per episode');
  const [a] = ctx.alertsOf(ctx.carla, 'response_overdue');
  assert.equal(a.category, 'messages');
  assert.equal(a.link, `/inbox?thread=${ctx.general.id}`);

  // A reply ends the episode; the next client message starts a new one.
  const reply = await request(ctx.server).post(`/conversation-threads/${ctx.general.id}/messages`).set(ctx.staff(ctx.carla)).send({ kind: 'portal', body: 'On it' });
  assert.equal(reply.status, 201);
  assert.equal(sweepResponseOverdue(ctx.store, ctx.company.id, later(4)), 0, 'nothing is waiting');
  await new Promise((r) => setTimeout(r, 5));
  await ctx.clientSays('And now?');
  assert.equal(sweepResponseOverdue(ctx.store, ctx.company.id, later(5)), 1);
  assert.equal(ctx.alertsOf(ctx.carla, 'response_overdue').length, 2);
});

test('push preview: the first 120 characters by default, empty when turned off', async () => {
  const ctx = await build();
  const long = 'x'.repeat(100) + 'y'.repeat(100);
  await ctx.clientSays(long);
  await tick();
  assert.equal(ctx.pushesTo('carla')[0].body, long.slice(0, 120));

  const prefs = (await request(ctx.server).get('/notifications/preferences').set(ctx.staff(ctx.dan))).body;
  assert.equal(prefs.pushPreview, true, 'on by default');
  assert.deepEqual(prefs.messages, { inApp: true, email: false, push: true });
  const off = await request(ctx.server).put('/notifications/preferences').set(ctx.staff(ctx.dan)).send({ ...prefs, pushPreview: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.pushPreview, false);
  assert.equal(off.body.messages.email, false);
  ctx.store.conversations.setAssignee(ctx.general.id, ctx.dan.id);
  await ctx.clientSays('Secret plans');
  await tick();
  const [p] = ctx.pushesTo('dan');
  assert.ok(p, 'still pushed');
  assert.equal(p.body, '');
  assert.equal(/Secret/.test(JSON.stringify(p)), false);
});

test('an internal note never produces a message alert, and mentions never preview it', async () => {
  const ctx = await build();
  const res = await request(ctx.server).post(`/conversation-threads/${ctx.general.id}/messages`).set(ctx.staff(ctx.ada))
    .send({ kind: 'note', body: 'POISON-NOTE', mentionUserIds: [ctx.carla.id] });
  assert.equal(res.status, 201);
  await tick();
  assert.equal(ctx.alertsOf(ctx.carla).length, 0);
  assert.equal(ctx.alertsOf(ctx.dan).length, 0);
  const note = ctx.store.conversations.getMessage(res.body.id);
  notifyThreadMessage(ctx.store, ctx.general, note);
  assert.equal(ctx.alertsOf(ctx.carla).length, 0);
  const [mention] = ctx.alertsOf(ctx.carla, 'mention');
  assert.equal(mention.category, 'messages');
  assert.equal(/POISON/.test(JSON.stringify(ctx.sent)), false, 'note text never reaches a phone');
});
