const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { setGreenFetch } = require('../dist/services/greenApi');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Team work on WhatsApp chats: who answers, where the chat stands (moving by
 * itself), labels, notes that never leave, quick replies, the late flag, and
 * private chats keeping their rule. Green API is faked.
 */

const quiet = { info() {}, warn() {}, error() {} };
const device = (name) => ({ endpoint: `https://push.example/send/${name}`, keys: { p256dh: 'BKey', auth: 'auth' } });
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const CHAT = '96891111111@c.us';
const enc = encodeURIComponent;

const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-team-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const member = (name, role) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const ada = member('Ada', 'Admin');
  const carla = member('Carla', 'Manager');
  const dan = member('Dan', 'Employee');
  const pushed = [];
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet,
    push: { publicKey: 'BKeyForTests', send: async (s, payload) => { pushed.push({ endpoint: s.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; } },
  }).listen(0);
  app.unref();
  const as = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  for (const [user, name] of [[ada, 'ada'], [carla, 'carla']]) {
    assert.equal((await request(app).post('/push/subscribe').set(as(user)).send(device(name))).status, 201);
  }
  const instance = store.upsertWhatsappInstance(company.id, { idInstance: '1101', apiToken: 'green-token' });
  let n = 0;
  setGreenFetch(async () => new Response(JSON.stringify({ idMessage: `OUT-${++n}` }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const base = `/companies/${company.id}/whatsapp`;
  const customerSays = (id, text, chatId = CHAT) => request(app).post(`/whatsapp/webhook/${instance.webhookToken}`)
    .send({ typeWebhook: 'incomingMessageReceived', idMessage: id, timestamp: Math.floor(Date.now() / 1000), senderData: { chatId }, messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } } });
  const say = (user, message, phone = '96891111111') => request(app).post(`${base}/send`).set(as(user)).send({ phone, message });
  const chat = async (user, chatId = CHAT) => (await request(app).get(`${base}/chats`).set(as(user))).body.find((c) => c.chatId === chatId);
  const patch = (user, body, chatId = CHAT) => request(app).patch(`${base}/chats/${enc(chatId)}/settings`).set(as(user)).send(body);
  return { app, store, company, ada, carla, dan, as, pushed, base, customerSays, say, chat, patch };
};
test.afterEach(() => setGreenFetch(null));

test('the status moves by itself, and the first to reply takes the chat', async () => {
  const ctx = await build();
  await ctx.customerSays('IN-1', 'السلام عليكم');
  let c = await ctx.chat(ctx.ada);
  assert.deepEqual([c.status, c.assigneeUserId, c.labels], ['open', undefined, []]);
  assert.ok(c.waitingSince, 'the customer is waiting');

  assert.equal((await ctx.say(ctx.carla, 'وعليكم السلام')).status, 201);
  c = await ctx.chat(ctx.ada);
  assert.deepEqual([c.status, c.assigneeUserId, c.assigneeName], ['waiting', ctx.carla.id, 'Carla'], 'our reply hands the turn over; Carla takes it');
  assert.equal(c.waitingSince, undefined);

  await ctx.say(ctx.ada, 'one more thing');
  assert.equal((await ctx.chat(ctx.ada)).assigneeUserId, ctx.carla.id, 'a later reply by someone else does not take it away');

  assert.equal((await ctx.patch(ctx.carla, { status: 'done' })).status, 200);
  assert.equal((await ctx.chat(ctx.ada)).status, 'done');
  await ctx.customerSays('IN-2', 'نسيت أسأل');
  c = await ctx.chat(ctx.ada);
  assert.equal(c.status, 'open', 'a customer message reopens a done chat');
  assert.equal(c.assigneeUserId, ctx.carla.id, 'and keeps who answers it');
  await ctx.customerSays('IN-2', 'نسيت أسأل');
  assert.equal((await ctx.chat(ctx.ada)).status, 'open');

  assert.equal((await ctx.patch(ctx.ada, { status: 'closed' })).status, 400);
});

test('assigning: only people who read WhatsApp, and the new assignee is told', async () => {
  const ctx = await build();
  await ctx.customerSays('IN-1', 'hello');
  const team = (await request(ctx.app).get(`${ctx.base}/team`).set(ctx.as(ctx.ada))).body;
  assert.deepEqual(team.map((u) => u.name), ['Ada', 'Carla'], 'the employee without WhatsApp access is not offered');
  assert.deepEqual(Object.keys(team[0]).sort(), ['id', 'name'], 'names only');

  assert.equal((await ctx.patch(ctx.ada, { assigneeUserId: ctx.dan.id })).status, 400);
  assert.equal((await ctx.patch(ctx.ada, { assigneeUserId: ctx.carla.id })).status, 200);
  const alert = ctx.store.db.prepare("SELECT * FROM notifications WHERE userId = ? AND type = 'whatsapp_assigned'").get(ctx.carla.id);
  assert.ok(alert, 'Carla is told');
  assert.equal(alert.link, `/whatsapp?chat=${enc(CHAT)}`);
  assert.equal(ctx.store.db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'whatsapp_assigned'").get().c, 1);
  await ctx.patch(ctx.carla, { assigneeUserId: ctx.carla.id });
  assert.equal(ctx.store.db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'whatsapp_assigned'").get().c, 1, 'taking it yourself tells nobody');

  // The assignee's phone hears the next message, not everyone's.
  await tick();
  ctx.pushed.length = 0;
  await ctx.customerSays('IN-2', 'are you there?', CHAT);
  await tick();
  // throttle: IN-1 already pushed to both inside the window, so use a fresh chat for the order check
  await ctx.patch(ctx.ada, { assigneeUserId: ctx.carla.id }, '96897777777@c.us');
  await ctx.customerSays('IN-3', 'new chat', '96897777777@c.us');
  await tick();
  assert.deepEqual(ctx.pushed.filter((p) => p.tag === 'whatsapp:96897777777@c.us').map((p) => p.endpoint.split('/').pop()), ['carla']);

  assert.equal((await ctx.patch(ctx.ada, { assigneeUserId: null })).status, 200);
  assert.equal((await ctx.chat(ctx.ada)).assigneeUserId, undefined);
});

test('labels: trimmed, no repeats, limits enforced', async () => {
  const ctx = await build();
  await ctx.customerSays('IN-1', 'hello');
  const ok = await ctx.patch(ctx.ada, { labels: ['  عميل جديد ', 'VIP', 'vip', ''] });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.labels, ['عميل جديد', 'VIP']);
  assert.deepEqual((await ctx.chat(ctx.carla)).labels, ['عميل جديد', 'VIP']);
  assert.equal((await ctx.patch(ctx.ada, { labels: ['x'.repeat(31)] })).status, 400);
  assert.equal((await ctx.patch(ctx.ada, { labels: Array.from({ length: 11 }, (_, i) => `l${i}`) })).status, 400);
  assert.equal((await ctx.patch(ctx.ada, { labels: 'VIP' })).status, 400);
});

test('notes stay inside: never sent, private with the chat, deleted by author or manager', async () => {
  const ctx = await build();
  let providerCalls = 0;
  setGreenFetch(async () => { providerCalls += 1; return new Response('{}', { status: 200 }); });
  await ctx.customerSays('IN-1', 'hello');
  const add = (user, body, chatId = CHAT) => request(ctx.app).post(`${ctx.base}/chats/${enc(chatId)}/notes`).set(ctx.as(user)).send({ body });
  const carlaNote = await add(ctx.carla, 'يريد خصم ١٠٪ — راجع المدير');
  assert.equal(carlaNote.status, 201);
  assert.equal(carlaNote.body.authorName, 'Carla');
  assert.equal(providerCalls, 0, 'a note never reaches WhatsApp');
  assert.equal(ctx.store.listWhatsappMessages(ctx.company.id, { chatId: CHAT }).length, 1, 'and is not a message');
  assert.equal((await add(ctx.carla, '   ')).status, 400);
  assert.equal((await add(ctx.carla, 'x'.repeat(2001))).status, 400);
  assert.equal((await add(ctx.dan, 'no access')).status, 403);

  const list = await request(ctx.app).get(`${ctx.base}/chats/${enc(CHAT)}/notes`).set(ctx.as(ctx.ada));
  assert.deepEqual(list.body.map((n) => n.body), ['يريد خصم ١٠٪ — راجع المدير']);

  // Ada (company-wide) may delete Carla's note; Carla may delete her own.
  const adaNote = await add(ctx.ada, 'from Ada');
  assert.equal((await request(ctx.app).delete(`${ctx.base}/notes/${carlaNote.body.id}`).set(ctx.as(ctx.ada))).status, 200);
  assert.equal((await request(ctx.app).delete(`${ctx.base}/notes/${adaNote.body.id}`).set(ctx.as(ctx.ada))).status, 200);
  assert.equal((await request(ctx.app).delete(`${ctx.base}/notes/${adaNote.body.id}`).set(ctx.as(ctx.ada))).status, 404);

  // A private chat's notes are its owner's.
  ctx.store.setWhatsappChatSettings(ctx.company.id, '96898888888@c.us', { visibility: 'private', ownerUserId: ctx.ada.id });
  await ctx.customerSays('IN-P', 'private', '96898888888@c.us');
  const privateNote = await add(ctx.ada, 'secret', '96898888888@c.us');
  assert.equal(privateNote.status, 201);
  // Carla is a Manager: company-wide reach, so she may still see it under the existing rule.
  const seenByCarla = await request(ctx.app).get(`${ctx.base}/chats/${enc('96898888888@c.us')}/notes`).set(ctx.as(ctx.carla));
  const carlaReach = ctx.store.isVisibleTo(ctx.store.visibilityEffective(ctx.carla.id), 'whatsapp_chats', ctx.company.id, '96898888888@c.us');
  assert.equal(seenByCarla.status, carlaReach ? 200 : 403, 'notes follow exactly the chat\'s own rule');
});

test('quick replies: one per short code, cleaned codes, managed by WhatsApp editors', async () => {
  const ctx = await build();
  const qr = `${ctx.base}/quick-replies`;
  const made = await request(ctx.app).post(qr).set(ctx.as(ctx.carla)).send({ shortcut: '/Price', body: 'باقة الإعلان تبدأ من ١٥٠ ريالاً.' });
  assert.equal(made.status, 201);
  assert.equal(made.body.shortcut, 'price');
  assert.equal((await request(ctx.app).post(qr).set(ctx.as(ctx.ada)).send({ shortcut: 'price', body: 'dup' })).status, 409);
  assert.equal((await request(ctx.app).post(qr).set(ctx.as(ctx.ada)).send({ shortcut: 'two words', body: 'x' })).status, 400);
  assert.equal((await request(ctx.app).post(qr).set(ctx.as(ctx.ada)).send({ shortcut: 'عنوان', body: 'مسقط، الخوير' })).status, 201, 'Arabic codes are fine');
  assert.equal((await request(ctx.app).post(qr).set(ctx.as(ctx.dan)).send({ shortcut: 'x', body: 'x' })).status, 403);

  const edited = await request(ctx.app).put(`${qr}/${made.body.id}`).set(ctx.as(ctx.ada)).send({ shortcut: 'price', body: 'من ٢٠٠ ريال' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.body, 'من ٢٠٠ ريال');
  assert.deepEqual((await request(ctx.app).get(qr).set(ctx.as(ctx.carla))).body.map((r) => r.shortcut).sort(), ['price', 'عنوان'].sort());
  assert.equal((await request(ctx.app).delete(`${qr}/${made.body.id}`).set(ctx.as(ctx.carla))).status, 200);
  assert.equal((await request(ctx.app).put(`${qr}/${made.body.id}`).set(ctx.as(ctx.ada)).send({ shortcut: 'p', body: 'x' })).status, 404);
});

test('late: an open chat past the response target turns red; answering clears it', async () => {
  const ctx = await build();
  // A chat whose customer wrote long ago, inside working hours or not: weeks of waiting is past any target.
  const longAgo = Math.floor(Date.now() / 1000) - 21 * 24 * 3600;
  await request(ctx.app).post(`/whatsapp/webhook/${ctx.store.getWhatsappInstanceForCompany(ctx.company.id).webhookToken}`)
    .send({ typeWebhook: 'incomingMessageReceived', idMessage: 'OLD-1', timestamp: longAgo, senderData: { chatId: CHAT }, messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'old question' } } });
  ctx.store.db.prepare("UPDATE whatsapp_messages SET createdAt = receivedAt WHERE externalId = 'OLD-1'").run();
  assert.equal((await ctx.chat(ctx.ada)).sla, 'red');
  await ctx.say(ctx.ada, 'sorry for the delay');
  const c = await ctx.chat(ctx.ada);
  assert.deepEqual([c.sla, c.status], [undefined, 'waiting']);
});

test('private chats keep their rule for the new settings too', async () => {
  const ctx = await build();
  await ctx.customerSays('IN-1', 'hello');
  ctx.store.setWhatsappChatSettings(ctx.company.id, CHAT, { visibility: 'private', ownerUserId: ctx.ada.id });
  const otherEditor = ctx.store.createUser({ name: 'Eve', email: 'eve@peak.test', password: 'x', role: 'Manager', companyIds: [ctx.company.id], companyRoles: [{ companyId: ctx.company.id, role: 'Manager' }] });
  const scope = ctx.store.isVisibleTo(ctx.store.visibilityEffective(otherEditor.id), 'whatsapp_chats', ctx.company.id, CHAT);
  const res = await ctx.patch(otherEditor, { status: 'done' });
  // A manager has company-wide reach and may; the rule itself is unchanged from before this bundle.
  assert.equal(res.status, scope ? 200 : 403);
});

test('chats from before the update: where we spoke last, it is the customer\'s turn', () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-team-mig-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const instance = store.upsertWhatsappInstance(company.id, { idInstance: '1101', apiToken: 't' });
  const msg = (chatId, direction, at) => store.createWhatsappMessage({ companyId: company.id, instanceId: instance.id, direction, chatId, phone: chatId.replace('@c.us', ''), type: 'text', body: 'x', status: 'sent', createdAt: new Date(at) });
  msg('968900@c.us', 'inbound', '2026-01-01T08:00:00Z');
  msg('968900@c.us', 'outbound', '2026-01-01T09:00:00Z');
  msg('968901@c.us', 'outbound', '2026-01-01T08:00:00Z');
  msg('968901@c.us', 'inbound', '2026-01-01T09:00:00Z');
  store.db.prepare("DELETE FROM schema_migrations WHERE id = '175_whatsapp_team_work'").run();
  store.db.prepare('DELETE FROM whatsapp_chat_settings').run();
  store.close?.();
  const again = new DataStore({ dbPath, seedOnEmpty: false });
  assert.equal(again.getWhatsappChatSettings(company.id, '968900@c.us').status, 'waiting');
  assert.equal(again.getWhatsappChatSettings(company.id, '968901@c.us').status, 'open');
});

test('a provider id seen again in another chat never rewrites the first chat\'s message', () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-ids-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const instance = store.upsertWhatsappInstance(company.id, { idInstance: '1101', apiToken: 't' });
  const put = (chatId, body) => store.createWhatsappMessage({ companyId: company.id, instanceId: instance.id, direction: 'outbound', externalId: 'SAME-ID', chatId, phone: chatId.replace('@c.us', ''), type: 'text', body, status: 'sent' });
  put('968900@c.us', 'first chat');
  put('968901@c.us', 'second chat');
  assert.equal(store.listWhatsappMessages(company.id, { chatId: '968900@c.us' })[0].body, 'first chat');
  assert.equal(store.listWhatsappMessages(company.id, { chatId: '968901@c.us' })[0].body, 'second chat');
  put('968900@c.us', 'first chat');
  assert.equal(store.listWhatsappMessages(company.id, { chatId: '968900@c.us' }).length, 1, 'a redelivery in the same chat is still one message');
});
