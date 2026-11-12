const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { setCloudFetch } = require('../dist/services/metaWhatsapp');
const { setGreenFetch } = require('../dist/services/greenApi');
const { runCampaignPass, isStopMessage, forgetTemplateCache, CAMPAIGN_BATCH } = require('../dist/services/whatsappCampaigns');
const { isWorkingTime } = require('../dist/conversations/sla');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Campaigns (Cloud API only, paced, opt-outs honoured, live report) and the
 * welcome / away replies. Meta and Green are faked; every call is recorded.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PHONE_ID = '123456789012345';
const SECRET = 'app-secret-probe';
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const TEMPLATES = { data: [{ name: 'offer', language: 'ar', status: 'APPROVED', components: [{ type: 'BODY', text: 'مرحباً {{1}}، عرض {{2}} لك.' }] }] };

const build = ({ provider = 'cloud' } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-camp-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const member = (name, role) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const ada = member('Ada', 'Admin');
  const carla = member('Carla', 'Manager');
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet }).listen(0);
  app.unref();
  const as = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  const instance = provider === 'cloud'
    ? store.upsertWhatsappInstance(company.id, { provider: 'cloud', idInstance: PHONE_ID, apiToken: 'EAAG', wabaId: 'waba', appSecret: SECRET })
    : store.upsertWhatsappInstance(company.id, { idInstance: '1101', apiToken: 'green' });
  const contact = (name, phone, extra = {}) => store.createContact({ companyId: company.id, kind: 'Person', name, phone, roles: ['Client'], ...extra });
  const base = `/companies/${company.id}/whatsapp`;
  const sentTemplates = [];
  let n = 0;
  setCloudFetch(async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/message_templates')) return new Response(JSON.stringify(TEMPLATES), { status: 200 });
    if (u.includes(`/${PHONE_ID}/messages`)) {
      const body = JSON.parse(init.body);
      sentTemplates.push(body);
      if (body.to === '96890000009') return new Response(JSON.stringify({ error: { message: 'Recipient not on WhatsApp', code: 131026 } }), { status: 400 });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.c${++n}` }] }), { status: 200 });
    }
    return new Response('{}', { status: 500 });
  });
  forgetTemplateCache();
  const deliverCloud = (payloadValue) => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_ID }, ...payloadValue } }] }] });
    return request(app).post(`/whatsapp/cloud-webhook/${instance.webhookToken}`).set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`).send(raw);
  };
  return { app, store, company, ada, carla, as, instance, contact, base, sentTemplates, deliverCloud };
};
test.afterEach(() => { setCloudFetch(null); setGreenFetch(null); });

test('stop words and working time', () => {
  for (const yes of ['stop', 'STOP', 'إيقاف', 'الغاء الاشتراك', ' Stop. ']) assert.ok(isStopMessage(yes), yes);
  for (const no of ['don\'t stop', 'أريد إيقاف الطلب رقم ٣', 'hello']) assert.ok(!isStopMessage(no), no);
  const rule = { responseTargetHours: 4, workDays: [0, 1, 2, 3, 4], dayStart: '08:00', dayEnd: '17:00', timeZone: 'Asia/Muscat' };
  assert.equal(isWorkingTime(Date.parse('2026-11-15T06:00:00Z'), rule), true, 'Sunday 10:00 in Muscat');
  assert.equal(isWorkingTime(Date.parse('2026-11-15T14:00:00Z'), rule), false, 'Sunday 18:00 in Muscat');
  assert.equal(isWorkingTime(Date.parse('2026-11-13T06:00:00Z'), rule), false, 'Friday');
});

test('a campaign: cleaned audience, preview, paced sends, report, pause and resume', async () => {
  const ctx = build();
  ctx.contact('سالم', '+968 9000 0001', { tags: ['vip'] });
  ctx.contact('Salim again', '968 9000 0001', { tags: ['vip'] });
  ctx.contact('مريم', '+968 9000 0002', { tags: ['vip'] });
  ctx.contact('No phone', '', { tags: ['vip'] });
  ctx.contact('Opted', '+968 9000 0003', { tags: ['vip'] });
  ctx.contact('Not on WhatsApp', '+968 9000 0009', { tags: ['vip'] });
  ctx.contact('Other tag', '+968 9000 0004', { tags: ['old'] });
  for (let i = 0; i < 3; i += 1) ctx.contact(`Extra ${i}`, `+968 9100 000${i}`, { tags: ['vip'] });
  ctx.store.setWhatsappOptOut(ctx.company.id, '96890000003', true, 'test');

  const audience = await request(ctx.app).get(`${ctx.base}/audience`).query({ tag: 'VIP' }).set(ctx.as(ctx.ada));
  assert.equal(audience.status, 200);
  assert.equal(audience.body.length, 8, 'tag match ignores case; no phone left out');
  assert.equal((await request(ctx.app).get(`${ctx.base}/audience`).set(ctx.as(ctx.carla))).status, 403, 'managing campaigns is for admins');

  const create = (body) => request(ctx.app).post(`${ctx.base}/campaigns`).set(ctx.as(ctx.ada)).send({
    name: 'عرض نوفمبر', templateName: 'offer', templateLanguage: 'ar', variables: [{ source: 'name' }, { source: 'text', value: 'الشتاء' }], audience: { tag: 'vip' }, ...body,
  });
  assert.equal((await create({ variables: [{ source: 'name' }] })).status, 400, 'every value of the template');
  assert.equal((await create({ templateName: 'nope' })).status, 404);
  const made = await create({});
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual(made.body.dropped, { duplicate: 1, optedOut: 1, noPhone: 0 });
  assert.equal(made.body.stats.total, 6);
  assert.equal(made.body.status, 'draft');
  assert.equal(made.body.preview, `مرحباً ${made.body.recipients[0].name}، عرض الشتاء لك.`, 'what the first person will read');
  assert.equal(ctx.sentTemplates.length, 0, 'a draft sends nothing');

  const id = made.body.id;
  assert.equal((await runCampaignPass(ctx.store, quiet)).sent, 0, 'not started yet');
  assert.equal((await request(ctx.app).post(`${ctx.base}/campaigns/${id}/start`).set(ctx.as(ctx.carla))).status, 403);
  assert.equal((await request(ctx.app).post(`${ctx.base}/campaigns/${id}/start`).set(ctx.as(ctx.ada))).status, 200);
  assert.equal((await request(ctx.app).post(`${ctx.base}/campaigns/${id}/start`).set(ctx.as(ctx.ada))).status, 409, 'already running');

  const first = await runCampaignPass(ctx.store, quiet);
  assert.equal(first.sent, CAMPAIGN_BATCH, 'a small batch per pass');
  assert.deepEqual(first.companies, [ctx.company.id]);
  assert.deepEqual(ctx.sentTemplates[0].template, {
    name: 'offer', language: { code: 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text: made.body.recipients[0].name }, { type: 'text', text: 'الشتاء' }] }],
  });

  assert.equal((await request(ctx.app).post(`${ctx.base}/campaigns/${id}/pause`).set(ctx.as(ctx.ada))).status, 200);
  assert.equal((await runCampaignPass(ctx.store, quiet)).sent, 0, 'paused sends nothing');
  await request(ctx.app).post(`${ctx.base}/campaigns/${id}/start`).set(ctx.as(ctx.ada));
  for (let i = 0; i < 4; i += 1) await runCampaignPass(ctx.store, quiet);

  // Meta reports: one read, one replied, one failed at send.
  const report1 = (await request(ctx.app).get(`${ctx.base}/campaigns/${id}`).set(ctx.as(ctx.carla))).body;
  const salim = report1.recipients.find((r) => r.phone === '96890000001');
  const salimMsg = ctx.store.listWhatsappMessages(ctx.company.id, { chatId: '96890000001@c.us' })[0];
  await ctx.deliverCloud({ statuses: [{ id: salimMsg.externalId, status: 'read', timestamp: String(Math.floor(Date.now() / 1000)) }] });
  await tick(5);
  await ctx.deliverCloud({ messages: [{ from: '96890000002', id: 'wamid.reply1', timestamp: String(Math.floor(Date.now() / 1000) + 5), type: 'text', text: { body: 'مهتم' } }] });
  const report = (await request(ctx.app).get(`${ctx.base}/campaigns/${id}`).set(ctx.as(ctx.carla))).body;
  assert.equal(report.status, 'done');
  assert.ok(salim);
  assert.deepEqual(
    { total: report.stats.total, sent: report.stats.sent, read: report.stats.read, replied: report.stats.replied, failed: report.stats.failed, queued: report.stats.queued },
    { total: 6, sent: 5, read: 1, replied: 1, failed: 1, queued: 0 },
  );
  const failedRow = report.recipients.find((r) => r.phone === '96890000009');
  assert.match(failedRow.error, /not on WhatsApp/);
  const chatMsg = ctx.store.listWhatsappMessages(ctx.company.id, { chatId: '96890000002@c.us' }).find((m) => m.direction === 'outbound');
  assert.equal(chatMsg.body, 'مرحباً مريم، عرض الشتاء لك.', 'each chat shows what that person read');
  assert.equal(chatMsg.contextEntityType, 'whatsapp_campaign');
});

test('campaigns need the official Cloud API', async () => {
  const ctx = build({ provider: 'green' });
  ctx.contact('A', '+968 9000 0001');
  const res = await request(ctx.app).post(`${ctx.base}/campaigns`).set(ctx.as(ctx.ada)).send({ name: 'x', templateName: 'offer', templateLanguage: 'ar', variables: [], audience: {} });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'cloudRequired');
});

test('cancel stops what is left; a stop message takes the person out of later campaigns', async () => {
  const ctx = build();
  for (let i = 1; i <= 5; i += 1) ctx.contact(`P${i}`, `+968 9200 000${i}`);
  const made = await request(ctx.app).post(`${ctx.base}/campaigns`).set(ctx.as(ctx.ada)).send({ name: 'c', templateName: 'offer', templateLanguage: 'ar', variables: [{ source: 'name' }, { source: 'text', value: 'x' }], audience: { role: 'Client' } });
  const id = made.body.id;
  await request(ctx.app).post(`${ctx.base}/campaigns/${id}/start`).set(ctx.as(ctx.ada));
  await runCampaignPass(ctx.store, quiet);
  const cancelled = await request(ctx.app).post(`${ctx.base}/campaigns/${id}/cancel`).set(ctx.as(ctx.ada));
  assert.equal(cancelled.body.status, 'cancelled');
  assert.deepEqual([cancelled.body.stats.sent, cancelled.body.stats.skipped, cancelled.body.stats.queued], [3, 2, 0]);
  const before = ctx.sentTemplates.length;
  await runCampaignPass(ctx.store, quiet);
  assert.equal(ctx.sentTemplates.length, before);

  // P1 writes "إيقاف": out of the next campaign; a manager can put them back.
  await ctx.deliverCloud({ messages: [{ from: '96892000001', id: 'wamid.stop', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'إيقاف' } }] });
  await tick();
  assert.ok(ctx.store.isWhatsappOptedOut(ctx.company.id, '96892000001'));
  const again = await request(ctx.app).post(`${ctx.base}/campaigns`).set(ctx.as(ctx.ada)).send({ name: 'c2', templateName: 'offer', templateLanguage: 'ar', variables: [{ source: 'name' }, { source: 'text', value: 'x' }], audience: { role: 'Client' } });
  assert.equal(again.body.dropped.optedOut, 1);
  assert.equal((await request(ctx.app).post(`${ctx.base}/optouts`).set(ctx.as(ctx.ada)).send({ phone: '+968 9200 0001', optedOut: false })).status, 200);
  assert.ok(!ctx.store.isWhatsappOptedOut(ctx.company.id, '96892000001'));
});

test('welcome on a first message, away outside hours once per 12h; neither assigns the chat', async () => {
  const ctx = build({ provider: 'green' });
  const sent = [];
  setGreenFetch(async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ idMessage: `G${sent.length}` }), { status: 200 }); });
  const save = (body) => request(ctx.app).put(`${ctx.base}/automation`).set(ctx.as(ctx.ada)).send(body);
  assert.equal((await save({ welcomeEnabled: true, welcomeText: '' })).status, 400, 'no empty message turned on');
  assert.equal((await request(ctx.app).put(`${ctx.base}/automation`).set(ctx.as(ctx.carla)).send({ welcomeEnabled: false })).status, 403);
  assert.equal((await save({ welcomeEnabled: true, welcomeText: 'أهلاً بك في بيك ميديا 👋', awayEnabled: true, awayText: 'نحن خارج الدوام، نرد عليك صباحاً.' })).status, 200);
  // Always outside hours: a working week with no days... use a one-day week that is never today.
  const today = new Date().getUTCDay();
  ctx.store.conversations.setSettings(ctx.company.id, { responseTargetHours: 4, workDays: [(today + 3) % 7], dayStart: '08:00', dayEnd: '09:00', timeZone: 'UTC' });

  const say = (id, chatId, text) => request(ctx.app).post(`/whatsapp/webhook/${ctx.instance.webhookToken}`)
    .send({ typeWebhook: 'incomingMessageReceived', idMessage: id, timestamp: Math.floor(Date.now() / 1000), senderData: { chatId }, messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } } });
  await say('W1', '96893000001@c.us', 'السلام عليكم');
  await tick();
  assert.deepEqual(sent.map((s) => s.message), ['أهلاً بك في بيك ميديا 👋'], 'first message: welcome (wins over away)');
  await say('W2', '96893000001@c.us', 'ممكن سعر؟');
  await tick();
  assert.equal(sent.at(-1).message, 'نحن خارج الدوام، نرد عليك صباحاً.');
  await say('W3', '96893000001@c.us', 'ألو؟');
  await say('W3', '96893000001@c.us', 'ألو؟');
  await tick();
  assert.equal(sent.length, 2, 'away once per 12 hours, nothing for a redelivery');

  const settings = ctx.store.getWhatsappChatSettings(ctx.company.id, '96893000001@c.us');
  assert.deepEqual([settings.status, settings.assigneeUserId], ['open', undefined], 'still ours to answer, nobody assigned');
  const autos = ctx.store.listWhatsappMessages(ctx.company.id, { chatId: '96893000001@c.us' }).filter((m) => m.contextEntityType === 'auto_reply');
  assert.deepEqual(autos.map((m) => [m.contextEntityId, m.actorName]).sort(), [['away', 'Auto-reply'], ['welcome', 'Auto-reply']]);
});
