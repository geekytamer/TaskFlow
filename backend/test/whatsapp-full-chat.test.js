const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { setCloudFetch } = require('../dist/services/metaWhatsapp');
const { setGreenFetch, greenMediaHost } = require('../dist/services/greenApi');
const { cloudSendKind, kindFromGreenType, safeFileName } = require('../dist/services/whatsappKinds');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * WhatsApp as a full chat: files out and in, replies to one message, live
 * arrival and the phone notification. Both providers' networks are faked and
 * every call they get is recorded.
 */

const quiet = { info() {}, warn() {}, error() {} };
const SECRET = 'app-secret-probe';
const PHONE_ID = '123456789012345';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const device = (name) => ({ endpoint: `https://push.example/send/${name}`, keys: { p256dh: 'BKey', auth: 'auth' } });
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-chat-'), 'taskflow.db');
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
  for (const [user, name] of [[ada, 'ada'], [carla, 'carla'], [dan, 'dan']]) {
    assert.equal((await request(app).post('/push/subscribe').set(as(user)).send(device(name))).status, 201);
  }
  const base = `/companies/${company.id}/whatsapp`;
  return { app, store, company, ada, carla, dan, as, pushed, base, messages: () => store.listWhatsappMessages(company.id, { limit: 500 }) };
};

/** Fake provider network: answers by URL fragment, records calls (multipart fields read out). */
const fake = (setFetch, routes) => {
  const calls = [];
  setFetch(async (url, init = {}) => {
    const u = String(url);
    let body;
    if (init.body instanceof FormData) {
      body = {};
      for (const [k, v] of init.body.entries()) body[k] = typeof v === 'string' ? v : { name: v.name, type: v.type, bytes: Buffer.from(await v.arrayBuffer()) };
    } else if (init.body) body = JSON.parse(init.body);
    calls.push({ url: u, method: init.method || 'GET', body });
    for (const [needle, reply] of Object.entries(routes)) {
      if (u.includes(needle)) {
        const r = typeof reply === 'function' ? reply(calls.length) : reply;
        return new Response(JSON.stringify(r.body ?? {}), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ message: 'unexpected call' }), { status: 500 });
  });
  return calls;
};
test.afterEach(() => { setCloudFetch(null); setGreenFetch(null); });

const greenInbound = (id, chatId, messageData) => ({ typeWebhook: 'incomingMessageReceived', idMessage: id, timestamp: Math.floor(Date.now() / 1000), senderData: { chatId }, messageData });
const sign = (raw) => `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;
const cloudDeliver = (ctx, token, message) => {
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: PHONE_ID }, messages: [{ from: '96891111111', timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
  } }] }] });
  return request(ctx.app).post(`/whatsapp/cloud-webhook/${token}`).set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(raw)).send(raw);
};
const file = (extra = {}) => ({ phone: '+968 9111 1111', fileName: 'offer.png', mimeType: 'image/png', dataBase64: PNG.toString('base64'), ...extra });

test('kinds: what each file goes as, and names that cannot hurt', () => {
  assert.deepEqual(cloudSendKind('image/png', 1000), { kind: 'image' });
  assert.deepEqual(cloudSendKind('image/png', 6 * 1024 * 1024), { kind: 'document' }, 'a photo over Meta\'s 5 MB goes as a file');
  assert.deepEqual(cloudSendKind('image/webp', 1000), { kind: 'document' });
  assert.deepEqual(cloudSendKind('audio/ogg; codecs=opus', 1000), { kind: 'audio' });
  assert.ok(cloudSendKind('audio/webm;codecs=opus', 1000).refuse, 'audio WhatsApp cannot play is refused');
  assert.deepEqual(cloudSendKind('application/pdf', 1000), { kind: 'document' });
  assert.equal(kindFromGreenType('imageMessage'), 'image');
  assert.equal(kindFromGreenType('audioMessage'), 'audio');
  assert.equal(kindFromGreenType('documentMessage', 'application/pdf'), 'document');
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('  '), 'file');
  assert.equal(greenMediaHost(), 'https://media.green-api.com');
  assert.equal(greenMediaHost('https://7103.api.greenapi.com/'), 'https://7103.media.greenapi.com');
});

test('Green API: a photo goes out by upload, is kept, and shows again from our own copy', async () => {
  const ctx = await build();
  const instance = ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'green-token' });
  const calls = fake(setGreenFetch, { sendFileByUpload: { body: { idMessage: 'G-OUT-1' } } });

  const res = await request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.ada)).send(file({ caption: 'عرض السعر' }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.type, 'image');
  assert.equal(res.body.body, 'عرض السعر');
  assert.equal(res.body.externalId, 'G-OUT-1');
  assert.match(res.body.mediaUrl, /^wa-file:/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith('https://media.green-api.com/waInstance1101/sendFileByUpload/green-token'));
  assert.equal(calls[0].body.chatId, '96891111111@c.us');
  assert.equal(calls[0].body.caption, 'عرض السعر');
  assert.deepEqual([calls[0].body.file.name, calls[0].body.file.type], ['offer.png', 'image/png']);
  assert.ok(calls[0].body.file.bytes.equals(PNG), 'the same bytes reached Green API');

  const id = res.body.mediaUrl.slice('wa-file:'.length);
  const got = await request(ctx.app).get(`${ctx.base}/files/${id}`).set(ctx.as(ctx.ada)).buffer(true);
  assert.equal(got.status, 200);
  assert.equal(got.headers['content-type'], 'image/png');
  assert.equal(got.headers['x-content-type-options'], 'nosniff');
  assert.match(got.headers['content-security-policy'], /sandbox/);
  assert.ok(Buffer.from(got.body).equals(PNG));
  assert.equal((await request(ctx.app).get(`${ctx.base}/files/${id}`)).status, 401, 'never without a sign-in');
  assert.equal((await request(ctx.app).get(`${ctx.base}/files/${id}`).set(ctx.as(ctx.dan))).status, 403, 'an employee without WhatsApp access cannot read it');

  // A private chat's file is its owner's.
  ctx.store.setWhatsappChatSettings(ctx.company.id, '96891111111@c.us', { visibility: 'private', ownerUserId: ctx.carla.id });
  ctx.store.updateUser?.(ctx.carla.id, {});
  const ownerSees = await request(ctx.app).get(`${ctx.base}/files/${id}`).set(ctx.as(ctx.carla));
  assert.equal(ownerSees.status, 200);

  // Green's own history of that message must not replace our copy with its link.
  ctx.store.importWhatsappHistory(ctx.company.id, instance.id, '96891111111@c.us', [
    { idMessage: 'G-OUT-1', type: 'outgoing', typeMessage: 'imageMessage', downloadUrl: 'https://green.example/expiring.png', caption: '', statusMessage: 'delivered', timestamp: Math.floor(Date.now() / 1000) },
  ]);
  const after = ctx.messages().find((m) => m.externalId === 'G-OUT-1');
  assert.equal(after.mediaUrl, res.body.mediaUrl);
  assert.equal(after.body, 'عرض السعر', 'an empty caption from history does not erase ours');

  // Refusals: nothing reaches the provider.
  assert.equal((await request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.ada)).send(file({ dataBase64: '' }))).status, 400);
  assert.equal((await request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.ada)).send(file({ mimeType: 'not a type' }))).status, 400);
  const big = await request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.ada)).send(file({ dataBase64: Buffer.alloc(16 * 1024 * 1024 + 1).toString('base64') }));
  assert.equal(big.status, 413);
  assert.equal((await request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.dan)).send(file())).status, 403);
  assert.equal(calls.length, 1);

  // A provider failure is kept in the chat as failed, with the file.
  fake(setGreenFetch, { sendFileByUpload: { status: 466, body: { message: 'quota exceeded' } } });
  const failed = await request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.ada)).send(file({ fileName: 'b.png' }));
  assert.equal(failed.status, 466);
  const kept = ctx.messages().find((m) => m.fileName === 'b.png');
  assert.deepEqual([kept.status, kept.error, kept.type], ['failed', 'quota exceeded', 'image']);
});

test('Green API: replies both ways, and incoming photos keep their kind and caption', async () => {
  const ctx = await build();
  const instance = ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'green-token' });
  const hook = (payload) => request(ctx.app).post(`/whatsapp/webhook/${instance.webhookToken}`).send(payload);
  await hook(greenInbound('G-IN-1', '96891111111@c.us', { typeMessage: 'textMessage', textMessageData: { textMessage: 'كم السعر؟' } }));
  await hook(greenInbound('G-IN-OTHER', '96892222222@c.us', { typeMessage: 'textMessage', textMessageData: { textMessage: 'another chat' } }));

  const calls = fake(setGreenFetch, { sendMessage: { body: { idMessage: 'G-OUT-2' } } });
  const send = (replyToExternalId) => request(ctx.app).post(`${ctx.base}/send`).set(ctx.as(ctx.ada)).send({ phone: '96891111111', message: '٥٠ ريالاً', replyToExternalId });
  assert.equal((await send('G-IN-OTHER')).status, 400, 'a reply quotes only its own chat');
  assert.equal((await send('no-such-id')).status, 400);
  assert.equal(calls.length, 0);
  const ok = await send('G-IN-1');
  assert.equal(ok.status, 201);
  assert.equal(ok.body.replyToExternalId, 'G-IN-1');
  assert.equal(calls[0].body.quotedMessageId, 'G-IN-1');

  await hook(greenInbound('G-IN-2', '96891111111@c.us', {
    typeMessage: 'imageMessage', fileMessageData: { downloadUrl: 'https://green.example/a.jpg', caption: 'هذا التصميم', fileName: 'a.jpg', mimeType: 'image/jpeg' },
    quotedMessage: { stanzaId: 'G-OUT-2' },
  }));
  await hook(greenInbound('G-IN-3', '96891111111@c.us', { typeMessage: 'audioMessage', fileMessageData: { downloadUrl: 'https://green.example/v.ogg', fileName: 'v.ogg', mimeType: 'audio/ogg; codecs=opus' } }));
  const photo = ctx.messages().find((m) => m.externalId === 'G-IN-2');
  assert.deepEqual([photo.type, photo.body, photo.mimeType, photo.replyToExternalId], ['image', 'هذا التصميم', 'image/jpeg', 'G-OUT-2']);
  assert.equal(ctx.messages().find((m) => m.externalId === 'G-IN-3').type, 'audio');
});

test('Cloud API: upload then send; the 24-hour rule and unplayable audio stop before Meta', async () => {
  const ctx = await build();
  const instance = ctx.store.upsertWhatsappInstance(ctx.company.id, { provider: 'cloud', idInstance: PHONE_ID, apiToken: 'EAAG', wabaId: 'waba', appSecret: SECRET });
  const calls = fake(setCloudFetch, { [`/${PHONE_ID}/media`]: { body: { id: 'MEDIA-9' } }, [`/${PHONE_ID}/messages`]: (n) => ({ body: { messages: [{ id: n === 2 ? 'wamid.out' : `wamid.out${n}` }] } }) });
  const send = (extra) => request(ctx.app).post(`${ctx.base}/send-media`).set(ctx.as(ctx.ada)).send(file(extra));
  const mediaRows = () => ctx.store.db.prepare('SELECT COUNT(*) AS c FROM whatsapp_media').get().c;

  const closed = await send();
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, 'windowClosed');
  assert.deepEqual([calls.length, ctx.messages().length, mediaRows()], [0, 0, 0], 'nothing sent, nothing kept');

  assert.equal((await cloudDeliver(ctx, instance.webhookToken, { id: 'wamid.in1', type: 'text', text: { body: 'hello' } })).status, 200);
  const webm = await send({ fileName: 'voice.webm', mimeType: 'audio/webm;codecs=opus' });
  assert.equal(webm.status, 415);
  assert.deepEqual([calls.length, mediaRows()], [0, 0]);

  const ok = await send({ caption: 'the offer', replyToExternalId: 'wamid.in1' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.type, ok.body.externalId, ok.body.replyToExternalId], ['image', 'wamid.out', 'wamid.in1']);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].body.file.bytes.equals(PNG));
  assert.equal(calls[0].body.messaging_product, 'whatsapp');
  assert.deepEqual(calls[1].body, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '96891111111', context: { message_id: 'wamid.in1' },
    type: 'image', image: { id: 'MEDIA-9', caption: 'the offer' },
  });

  const pdf = await send({ fileName: 'عقد.pdf', mimeType: 'application/pdf' });
  assert.equal(pdf.body.type, 'document');
  assert.deepEqual(calls[3].body.document, { id: 'MEDIA-9', filename: 'عقد.pdf' });

  // Incoming: a voice note is audio, and a reply names what it answers.
  await cloudDeliver(ctx, instance.webhookToken, { id: 'wamid.in2', type: 'audio', audio: { id: '7002', mime_type: 'audio/ogg; codecs=opus' }, context: { id: 'wamid.out' } });
  const voice = ctx.messages().find((m) => m.externalId === 'wamid.in2');
  assert.deepEqual([voice.type, voice.mediaUrl, voice.mimeType, voice.replyToExternalId], ['audio', 'cloud-media:7002', 'audio/ogg; codecs=opus', 'wamid.out']);
});

function openStream(server, token) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path: '/live', headers: { Authorization: token } }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const data = buffer.slice(0, at).split('\n').find((l) => l.startsWith('data: '));
          buffer = buffer.slice(at + 2);
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      });
      resolve({ events, close: () => req.destroy() });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? undefined : reject(e)));
  });
}

test('a customer message arrives live and on the right phones, once', async () => {
  const ctx = await build();
  const instance = ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'green-token' });
  const hook = (id, chatId, text) => request(ctx.app).post(`/whatsapp/webhook/${instance.webhookToken}`)
    .send(greenInbound(id, chatId, { typeMessage: 'textMessage', textMessageData: { textMessage: text } }));
  const stream = await openStream(ctx.app, ctx.as(ctx.ada).Authorization);
  await tick();

  await hook('P-1', '96891111111@c.us', 'السلام عليكم');
  await tick();
  assert.ok(stream.events.some((e) => e.topics.includes('whatsapp') && e.companyId === ctx.company.id), 'open inboxes are told at once');
  assert.ok(!JSON.stringify(stream.events).includes('السلام'), 'the signal carries no message text');
  stream.close();

  const names = () => ctx.pushed.map((p) => p.endpoint.split('/').pop()).sort();
  assert.deepEqual(names(), ['ada', 'carla'], 'everyone who can read WhatsApp; not the employee');
  assert.equal(ctx.pushed[0].title, '+96891111111');
  assert.equal(ctx.pushed[0].body, 'السلام عليكم');
  assert.equal(ctx.pushed[0].url, '/whatsapp?chat=96891111111%40c.us');

  await hook('P-2', '96891111111@c.us', 'second within two minutes');
  await hook('P-1', '96891111111@c.us', 'السلام عليكم');
  await tick();
  assert.equal(ctx.pushed.length, 2, 'one notification per person per chat inside the window; a redelivery adds none');

  // A known contact with an owner: only the owner's phone.
  ctx.pushed.length = 0;
  ctx.store.createContact({ companyId: ctx.company.id, kind: 'Person', name: 'Salim', phone: '+96893333333', ownerUserId: ctx.carla.id });
  await hook('P-3', '96893333333@c.us', 'from Salim');
  await tick();
  assert.deepEqual(names(), ['carla']);
  assert.equal(ctx.pushed[0].title, 'Salim');

  // A private chat: its owner alone.
  ctx.pushed.length = 0;
  ctx.store.setWhatsappChatSettings(ctx.company.id, '96894444444@c.us', { visibility: 'private', ownerUserId: ctx.ada.id });
  await hook('P-4', '96894444444@c.us', 'private matter');
  await tick();
  assert.deepEqual(names(), ['ada']);

  // "Messages" turned off, or previews hidden.
  ctx.pushed.length = 0;
  const prefs = (await request(ctx.app).get('/notifications/preferences').set(ctx.as(ctx.ada))).body;
  await request(ctx.app).put('/notifications/preferences').set(ctx.as(ctx.ada)).send({ ...prefs, messages: { ...prefs.messages, push: false } });
  const carlaPrefs = (await request(ctx.app).get('/notifications/preferences').set(ctx.as(ctx.carla))).body;
  await request(ctx.app).put('/notifications/preferences').set(ctx.as(ctx.carla)).send({ ...carlaPrefs, pushPreview: false });
  await hook('P-5', '96895555555@c.us', 'secret words');
  await tick();
  assert.deepEqual(names(), ['carla']);
  assert.equal(ctx.pushed[0].body, '', 'no preview when the person hid previews');
});
