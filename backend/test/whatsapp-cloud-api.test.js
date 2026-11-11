const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { setCloudFetch } = require('../dist/services/metaWhatsapp');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Meta's official WhatsApp Cloud API next to Green API: connecting a number,
 * Meta's webhook (check + signed events), the 24-hour window, templates,
 * statuses that never move backwards, media through our proxy.
 * Meta's network is faked; every call it gets is recorded.
 */

const COMPANY = '1';
const PHONE_ID = '123456789012345';
const WABA_ID = '998877665544';
const SECRET = 'app-secret-probe';
const quiet = { info() {}, warn() {}, error() {} };

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-cloud-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet }).listen(0);
  app.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  return { app, store, auth: `Bearer ${store.issueToken(admin.id)}` };
};

/** A fake Meta: answers by path, records each call. */
const fakeMeta = (routes = {}) => {
  const calls = [];
  setCloudFetch(async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init.method || 'GET', body, auth: init.headers?.Authorization });
    for (const [needle, reply] of Object.entries(routes)) {
      if (u.includes(needle)) {
        const r = typeof reply === 'function' ? reply(u, body) : reply;
        const status = r.status || 200;
        const isBytes = Buffer.isBuffer(r.body);
        return new Response(isBytes ? r.body : JSON.stringify(r.body ?? {}), {
          status, headers: { 'content-type': isBytes ? 'image/jpeg' : 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ error: { message: 'unexpected call', code: 1 } }), { status: 500 });
  });
  return calls;
};
test.afterEach(() => setCloudFetch(null));

const connect = (ctx, extra = {}) =>
  request(ctx.app).put(`/companies/${COMPANY}/whatsapp/instance`).set('Authorization', ctx.auth).send({
    provider: 'cloud', idInstance: PHONE_ID, apiToken: 'EAAG-probe-token', wabaId: WABA_ID, appSecret: SECRET, ...extra,
  });

const sign = (raw, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const deliver = (ctx, token, payload, signature) => {
  const raw = JSON.stringify(payload);
  return request(ctx.app).post(`/whatsapp/cloud-webhook/${token}`)
    .set('Content-Type', 'application/json').set('X-Hub-Signature-256', signature ?? sign(raw)).send(raw);
};
const inbound = (from, id, message, phoneNumberId = PHONE_ID) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: WABA_ID, changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId, display_phone_number: '968 9000 0000' },
    contacts: [{ profile: { name: 'Probe' }, wa_id: from }],
    messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
  } }] }],
});
const statusEvent = (id, status, errors) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: WABA_ID, changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: PHONE_ID }, statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '96891111111', ...(errors ? { errors } : {}) }],
  } }] }],
});
const messagesOf = (store) => store.listWhatsappMessages(COMPANY, { limit: 500 });

test('connecting a Cloud API number: app secret required, secrets never returned, state read from Meta', async () => {
  const ctx = build();
  const noSecret = await connect(ctx, { appSecret: '' });
  assert.equal(noSecret.status, 400);
  assert.match(noSecret.body.message, /secret/i);

  const res = await connect(ctx);
  assert.equal(res.status, 200);
  assert.equal(res.body.provider, 'cloud');
  assert.equal(res.body.idInstance, PHONE_ID);
  assert.equal(res.body.wabaId, WABA_ID);
  assert.equal(res.body.hasAppSecret, true);
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes('EAAG-probe-token') && !text.includes(SECRET), 'token and secret stay on the server');

  const calls = fakeMeta({ [`/${PHONE_ID}?fields=`]: { body: { id: PHONE_ID, display_phone_number: '+968 9000 0000', verified_name: 'Peak Media' } } });
  const state = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/state`).set('Authorization', ctx.auth);
  assert.equal(state.status, 200);
  assert.equal(state.body.state, 'authorized');
  assert.equal(state.body.displayName, 'Peak Media');
  assert.equal(calls[0].auth, 'Bearer EAAG-probe-token');

  // Updating without retyping the token or secret keeps them.
  const again = await connect(ctx, { apiToken: '', appSecret: '' });
  assert.equal(again.status, 200);
  assert.equal(ctx.store.getWhatsappCloudCredentials(COMPANY).accessToken, 'EAAG-probe-token');
  assert.equal(ctx.store.getWhatsappCloudCredentials(COMPANY).appSecret, SECRET);

  // QR and logout belong to Green API only.
  for (const [method, url] of [['get', 'qr'], ['post', 'logout']]) {
    const r = await request(ctx.app)[method](`/companies/${COMPANY}/whatsapp/${url}`).set('Authorization', ctx.auth);
    assert.equal(r.status, 400, url);
  }
  const hook = await request(ctx.app).post(`/companies/${COMPANY}/whatsapp/configure-webhook`).set('Authorization', ctx.auth).send({ baseUrl: 'https://erp.example.com' });
  assert.equal(hook.body.manual, true);
  assert.equal(hook.body.webhookUrl, `https://erp.example.com/whatsapp/cloud-webhook/${res.body.webhookToken}`);
  assert.equal(hook.body.verifyToken, res.body.webhookToken);
});

test("Meta's webhook check echoes the challenge only for the right verify token", async () => {
  const ctx = build();
  const { body: instance } = await connect(ctx);
  const ok = await request(ctx.app).get(`/whatsapp/cloud-webhook/${instance.webhookToken}`)
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': instance.webhookToken, 'hub.challenge': '424242' });
  assert.equal(ok.status, 200);
  assert.equal(ok.text, '424242');
  const wrong = await request(ctx.app).get(`/whatsapp/cloud-webhook/${instance.webhookToken}`)
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'guess', 'hub.challenge': '424242' });
  assert.equal(wrong.status, 403);
});

test('signed events come in; unsigned ones, and another number\'s, do not', async () => {
  const ctx = build();
  const { body: instance } = await connect(ctx);

  const forged = await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.forged', { type: 'text', text: { body: 'hi' } }), sign('{}', 'wrong-secret'));
  assert.equal(forged.status, 401);
  const unsigned = await request(ctx.app).post(`/whatsapp/cloud-webhook/${instance.webhookToken}`).send(inbound('96891111111', 'wamid.unsigned', { type: 'text', text: { body: 'hi' } }));
  assert.equal(unsigned.status, 401);
  assert.equal(messagesOf(ctx.store).length, 0, 'nothing forged was stored');

  assert.equal((await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.text', { type: 'text', text: { body: 'مرحبا' } }))).status, 200);
  assert.equal((await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.photo', { type: 'image', image: { id: '7001', caption: 'the invoice' } }))).status, 200);
  assert.equal((await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.other', { type: 'text', text: { body: 'x' } }, '555'))).status, 200);
  // A redelivery of the same event is not a second message.
  await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.text', { type: 'text', text: { body: 'مرحبا' } }));

  const stored = messagesOf(ctx.store);
  assert.deepEqual(stored.map((m) => m.externalId).sort(), ['wamid.photo', 'wamid.text']);
  const text = stored.find((m) => m.externalId === 'wamid.text');
  assert.equal(text.chatId, '96891111111@c.us');
  assert.equal(text.direction, 'inbound');
  assert.equal(text.body, 'مرحبا');
  const photo = stored.find((m) => m.externalId === 'wamid.photo');
  assert.equal(photo.type, 'image');
  assert.equal(photo.body, 'the invoice');
  assert.equal(photo.mediaUrl, 'cloud-media:7001');

  // The photo opens through our proxy, fetched from Meta with the token.
  const calls = fakeMeta({ 'graph.facebook.com/v21.0/7001': { body: { url: 'https://lookaside.fbsbx.com/media/7001', mime_type: 'image/jpeg' } }, 'lookaside.fbsbx.com': { body: Buffer.from('JPEGBYTES') } });
  const media = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/media/7001`).set('Authorization', ctx.auth).buffer(true);
  assert.equal(media.status, 200);
  assert.equal(media.headers['content-type'], 'image/jpeg');
  assert.equal(Buffer.from(media.body).toString(), 'JPEGBYTES');
  assert.equal(calls[1].auth, 'Bearer EAAG-probe-token');
  const unknown = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/media/7999`).set('Authorization', ctx.auth);
  assert.equal(unknown.status, 404, 'only media that arrived in a chat');
});

test('free text only inside the 24-hour window; statuses never move backwards', async () => {
  const ctx = build();
  const { body: instance } = await connect(ctx);
  const calls = fakeMeta({ [`/${PHONE_ID}/messages`]: { body: { messages: [{ id: 'wamid.out1' }] } } });
  const send = () => request(ctx.app).post(`/companies/${COMPANY}/whatsapp/send`).set('Authorization', ctx.auth)
    .send({ phone: '+968 9111 1111', message: 'Your quote is ready' });

  const closed = await send();
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, 'windowClosed');
  assert.equal(calls.length, 0, 'refused before calling Meta');
  const win0 = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/window`).query({ chatId: '96891111111@c.us' }).set('Authorization', ctx.auth);
  assert.deepEqual([win0.body.provider, win0.body.open], ['cloud', false]);

  await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.in1', { type: 'text', text: { body: 'hello' } }));
  const win1 = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/window`).query({ chatId: '96891111111@c.us' }).set('Authorization', ctx.auth);
  assert.equal(win1.body.open, true);
  assert.ok(win1.body.closesAt);

  const sent = await send();
  assert.equal(sent.status, 201);
  assert.equal(sent.body.externalId, 'wamid.out1');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '96891111111', type: 'text', text: { preview_url: true, body: 'Your quote is ready' } });

  await deliver(ctx, instance.webhookToken, statusEvent('wamid.out1', 'read'));
  await deliver(ctx, instance.webhookToken, statusEvent('wamid.out1', 'delivered'));
  const out = () => messagesOf(ctx.store).find((m) => m.externalId === 'wamid.out1');
  assert.equal(out().status, 'read', 'a late delivered does not undo read');

  await deliver(ctx, instance.webhookToken, statusEvent('wamid.out1', 'failed', [{ code: 131049, title: 'Message not delivered', error_data: { details: 'ecosystem limit' } }]));
  assert.equal(out().status, 'failed');
  assert.equal(out().error, 'Message not delivered — ecosystem limit');
});

test("a window Meta says is closed comes back as windowClosed, and Meta's error text reaches the person", async () => {
  const ctx = build();
  const { body: instance } = await connect(ctx);
  await deliver(ctx, instance.webhookToken, inbound('96891111111', 'wamid.in1', { type: 'text', text: { body: 'hello' } }));
  fakeMeta({ [`/${PHONE_ID}/messages`]: { status: 400, body: { error: { message: 'Re-engagement message', code: 131047 } } } });
  const r = await request(ctx.app).post(`/companies/${COMPANY}/whatsapp/send`).set('Authorization', ctx.auth).send({ phone: '96891111111', message: 'x' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'windowClosed');

  fakeMeta({ [`/${PHONE_ID}/messages`]: { status: 400, body: { error: { message: 'Invalid parameter', code: 100, error_data: { details: 'bad phone' } } } } });
  const bad = await request(ctx.app).post(`/companies/${COMPANY}/whatsapp/send`).set('Authorization', ctx.auth).send({ phone: '96891111111', message: 'y' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.message, 'Invalid parameter — bad phone');
  assert.ok(messagesOf(ctx.store).some((m) => m.body === 'y' && m.status === 'failed'), 'the failed send is kept in the chat');
});

test('templates: only approved ones listed; sending fills the variables', async () => {
  const ctx = build();
  await connect(ctx);
  const templates = { data: [
    { name: 'quote_ready', language: 'ar', status: 'APPROVED', category: 'UTILITY', components: [
      { type: 'HEADER', format: 'TEXT', text: 'Peak Media' },
      { type: 'BODY', text: 'مرحباً {{1}}، عرض السعر رقم {{2}} جاهز.' },
      { type: 'FOOTER', text: 'شكراً' },
    ] },
    { name: 'promo', language: 'ar', status: 'REJECTED', components: [{ type: 'BODY', text: 'x' }] },
  ] };
  const calls = fakeMeta({
    [`/${WABA_ID}/message_templates`]: { body: templates },
    [`/${PHONE_ID}/messages`]: { body: { messages: [{ id: 'wamid.tpl1' }] } },
  });
  const list = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/templates`).set('Authorization', ctx.auth);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((t) => [t.name, t.variableCount]), [['quote_ready', 2]]);

  const send = (variables) => request(ctx.app).post(`/companies/${COMPANY}/whatsapp/send-template`).set('Authorization', ctx.auth)
    .send({ phone: '96892222222', name: 'quote_ready', language: 'ar', variables });
  assert.equal((await send(['أحمد'])).status, 400, 'every variable needs a value');
  const ok = await send(['أحمد', 'QT-0042']);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.body, 'Peak Media\n\nمرحباً أحمد، عرض السعر رقم QT-0042 جاهز.\n\nشكراً');
  const sendCall = calls.find((c) => c.method === 'POST');
  assert.deepEqual(sendCall.body.template, {
    name: 'quote_ready', language: { code: 'ar' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'أحمد' }, { type: 'text', text: 'QT-0042' }] }],
  });

  const rejected = await request(ctx.app).post(`/companies/${COMPANY}/whatsapp/send-template`).set('Authorization', ctx.auth)
    .send({ phone: '96892222222', name: 'promo', language: 'ar', variables: [] });
  assert.equal(rejected.status, 404, 'a template Meta has not approved cannot be sent');
});

test('Green API companies are untouched, and the two webhooks do not cross', async () => {
  const ctx = build();
  const green = ctx.store.upsertWhatsappInstance(COMPANY, { idInstance: '1101', apiToken: 'green-token' });
  assert.equal(green.provider, 'green');
  const win = await request(ctx.app).get(`/companies/${COMPANY}/whatsapp/window`).query({ chatId: '96891111111@c.us' }).set('Authorization', ctx.auth);
  assert.equal(win.body.open, true, 'no 24-hour rule on Green API');
  const cloudHook = await deliver(ctx, green.webhookToken, inbound('96891111111', 'wamid.x', { type: 'text', text: { body: 'x' } }));
  assert.equal(cloudHook.status, 404, 'a Green API token is not a Cloud webhook');

  const { body: cloud } = await connect(ctx);
  assert.equal(cloud.provider, 'cloud');
  assert.equal(cloud.state, 'notAuthorized', 'switching provider starts unlinked');
  const greenHook = await request(ctx.app).post(`/whatsapp/webhook/${cloud.webhookToken}`).send({
    typeWebhook: 'incomingMessageReceived', idMessage: 'green-1', timestamp: Math.floor(Date.now() / 1000),
    senderData: { chatId: '96891111111@c.us' }, messageData: { textMessageData: { textMessage: 'spoof' } },
  });
  assert.equal(greenHook.body.ignored, true, 'the Green API path takes nothing for a Cloud number');
  assert.equal(messagesOf(ctx.store).length, 0);
});
