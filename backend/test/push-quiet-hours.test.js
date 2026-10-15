delete process.env.TASKFLOW_QUIET_HOURS; // quiet hours on for this file
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { dispatchStaffPush, flushThreadPushes } = require('../dist/conversations/alerts');
const { sweepPortalPush, baselinePortalPush } = require('../dist/portal/push-alerts');
const { inQuietHours, releaseHeldPush } = require('../dist/push/quiet-hours');
const { makeTmpDir } = require('./helpers/tmp');

// Muscat is UTC+4.
const NIGHT = '2026-10-15T19:00:00.000Z'; // 23:00
const LATE = '2026-10-15T19:30:00.000Z'; // 23:30
const MORNING = '2026-10-16T04:05:00.000Z'; // 08:05

const build = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-quiet-'), 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const carla = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  store.push.subscribe({ audience: 'staff', principalId: carla.id, companyId: company.id, endpoint: 'https://push.example/carla', p256dh: 'k', auth: 'a', userAgent: null });
  const sent = [];
  const send = async (s, payload) => { sent.push(JSON.parse(payload)); return { statusCode: 201 }; };
  const notify = (entityId) => store.notify({ companyId: company.id, userIds: [carla.id], type: 'task_assigned', title: `Task ${entityId}`, link: '/tasks', entityType: 'task', entityId });
  return { store, company, carla, sent, send, notify };
};

test('quiet hours run 22:00 to 08:00 in the company zone', () => {
  assert.equal(inQuietHours(NIGHT, 'Asia/Muscat'), true);
  assert.equal(inQuietHours('2026-10-16T04:00:00.000Z', 'Asia/Muscat'), false, '08:00');
  assert.equal(inQuietHours('2026-10-16T03:59:00.000Z', 'Asia/Muscat'), true, '07:59');
  assert.equal(inQuietHours('2026-10-15T18:00:00.000Z', 'Asia/Muscat'), true, '22:00');
  assert.equal(inQuietHours('2026-10-15T17:59:00.000Z', 'Asia/Muscat'), false, '21:59');
});

test('a staff push at night is held, then one summary goes out in the morning', async () => {
  const ctx = build();
  await dispatchStaffPush(ctx.store, ctx.send, ctx.notify('t1'), Date.parse(NIGHT));
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.store.push.heldCount(), 1);
  assert.equal(await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, NIGHT), 0, 'still quiet');
  assert.equal(await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING), 1);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].title, 'Peak Media');
  assert.equal(ctx.sent[0].body, '1 update while you were away');
  assert.equal(ctx.sent[0].url, '/notifications');
  assert.equal(ctx.store.push.heldCount(), 0);
  assert.equal(await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING), 0, 'only once');
});

test('two held tags make a summary of 2; the same tag collapses', async () => {
  const ctx = build();
  await dispatchStaffPush(ctx.store, ctx.send, ctx.notify('t1'), Date.parse(NIGHT));
  await dispatchStaffPush(ctx.store, ctx.send, ctx.notify('t2'), Date.parse(NIGHT));
  await dispatchStaffPush(ctx.store, ctx.send, ctx.notify('t2'), Date.parse(NIGHT));
  await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].body, '2 updates while you were away');
});

test('the in-app notification is still created at night', async () => {
  const ctx = build();
  assert.equal(ctx.notify('t1').length, 1);
});

test('the trailing flush holds at night and does not retry every minute', async () => {
  const ctx = build();
  const contact = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Al Mouj', roles: ['Client'], ownerUserId: ctx.carla.id });
  const thread = ctx.store.conversations.generalThread(ctx.company.id, contact.id);
  ctx.store.upsertThreadNotification({
    companyId: ctx.company.id, userIds: [ctx.carla.id], type: 'message_received', threadId: thread.id,
    build: (count) => ({ title: `${count} new messages`, body: 'hi', link: `/inbox?thread=${thread.id}`, data: { count, threadId: thread.id } }),
  });
  assert.equal(await flushThreadPushes(ctx.store, ctx.send, Date.parse(NIGHT)), 1);
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.store.push.heldCount(), 1);
  assert.equal(await flushThreadPushes(ctx.store, ctx.send, Date.parse(NIGHT) + 60_000), 0, 'handled');
});

test('portal pushes at night are held and summarised in the user language', async () => {
  const ctx = build();
  const client = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Al Noor', roles: ['Client'] });
  const { token } = ctx.store.portal.inviteUser({ companyId: ctx.company.id, audience: 'client', contactId: client.id, email: 'b@alnoor.test', name: 'B', role: 'client_admin' });
  const user = ctx.store.portal.acceptInvitation(token, 'correct horse battery');
  const id = user.id ?? user.user?.id;
  const portalUser = ctx.store.portal.getUser(id);
  ctx.store.push.subscribe({ audience: 'client', principalId: portalUser.id, companyId: ctx.company.id, endpoint: 'https://push.example/b', p256dh: 'k', auth: 'a', userAgent: null });
  baselinePortalPush(ctx.store, portalUser);
  const thread = ctx.store.conversations.generalThread(ctx.company.id, client.id);
  ctx.store.conversations.addMessage({ threadId: thread.id, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff', authorUserId: ctx.carla.id, authorPortalUserId: null, body: 'Ready' });
  assert.equal(await sweepPortalPush(ctx.store, ctx.send, ctx.company.id, Date.parse(LATE)), 0);
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.store.push.heldCount(), 1);
  assert.equal(await sweepPortalPush(ctx.store, ctx.send, ctx.company.id, Date.parse(MORNING)), 0, 'logged, not re-sent');
  assert.equal(await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING), 1);
  assert.equal(ctx.sent[0].url, '/messages', 'a held message push is a conversation, so the summary opens the messages');
  assert.equal(ctx.sent[0].body, '1 conversation needs you');
});

const holdThread = (ctx, id) => ctx.store.push.hold('staff', ctx.carla.id, ctx.company.id, { title: 't', body: '', url: `/inbox?thread=${id}`, tag: `thread:${id}` });

test('only conversations held: conversation copy and the inbox link', async () => {
  const ctx = build();
  holdThread(ctx, 'a'); holdThread(ctx, 'b');
  await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING);
  assert.equal(ctx.sent[0].body, '2 conversations need you');
  assert.equal(ctx.sent[0].url, '/inbox');
});

test('a failed summary keeps the held rows for the next run', async () => {
  const ctx = build();
  holdThread(ctx, 'a');
  const failing = async () => ({ statusCode: 500 });
  assert.equal(await releaseHeldPush(ctx.store, failing, ctx.company.id, MORNING), 0);
  assert.equal(ctx.store.push.heldCount(), 1);
  assert.equal(await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING), 1);
  assert.equal(ctx.store.push.heldCount(), 0);
});

test('someone with no device left is cleared, not retried forever', async () => {
  const ctx = build();
  holdThread(ctx, 'a');
  ctx.store.push.unsubscribe('staff', ctx.carla.id, 'https://push.example/carla');
  assert.equal(await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING), 0);
  assert.equal(ctx.store.push.heldCount(), 0);
});

test('two overlapping releases send one summary', async () => {
  const ctx = build();
  holdThread(ctx, 'a');
  const slow = async (s, p) => { await new Promise((r) => setTimeout(r, 30)); return ctx.send(s, p); };
  const [x, y] = await Promise.all([releaseHeldPush(ctx.store, slow, ctx.company.id, MORNING), releaseHeldPush(ctx.store, slow, ctx.company.id, MORNING)]);
  assert.equal(x + y, 1);
  assert.equal(ctx.sent.length, 1);
});

test('handling a thread drops its held push', async () => {
  const ctx = build();
  holdThread(ctx, 'a'); holdThread(ctx, 'b');
  ctx.store.markThreadNotificationsRead(ctx.carla.id, 'a');
  await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING);
  assert.equal(ctx.sent[0].body, '1 conversation needs you');
});

test('a portal user who prefers Arabic gets the Arabic summary', async () => {
  const ctx = build();
  const client = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Al Noor', roles: ['Client'] });
  const { token } = ctx.store.portal.inviteUser({ companyId: ctx.company.id, audience: 'client', contactId: client.id, email: 'b@alnoor.test', name: 'B', role: 'client_admin' });
  const accepted = ctx.store.portal.acceptInvitation(token, 'correct horse battery');
  const id = accepted.id ?? accepted.user?.id;
  ctx.store.alerts.setPrefs({ portalUserId: id, phone: null, whatsapp: false, lang: 'ar' });
  ctx.store.push.subscribe({ audience: 'client', principalId: id, companyId: ctx.company.id, endpoint: 'https://push.example/b', p256dh: 'k', auth: 'a', userAgent: null });
  const hold = (tag) => ctx.store.push.hold('client', id, ctx.company.id, { title: 't', body: '', url: '/messages/x', tag });
  hold('thread:1'); hold('thread:2');
  await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING);
  assert.equal(ctx.sent[0].body, '2 محادثات بانتظارك');
  assert.equal(ctx.sent[0].url, '/messages');
  hold('x:1');
  await releaseHeldPush(ctx.store, ctx.send, ctx.company.id, MORNING);
  assert.equal(ctx.sent[1].body, 'تحديث واحد أثناء غيابك');
});
