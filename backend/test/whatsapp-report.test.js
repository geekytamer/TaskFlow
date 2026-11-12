const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { whatsappReport } = require('../dist/services/whatsappReport');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The WhatsApp report: who answered customer waits and how fast (working
 * hours), what auto replies and campaigns do not count as, and who may see it.
 */

const quiet = { info() {}, warn() {}, error() {} };

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-wa-report-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const member = (name, role) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const ada = member('Ada', 'Admin');
  const carla = member('Carla', 'Manager');
  const acc = member('Acc', 'Accountant');
  const instance = store.upsertWhatsappInstance(company.id, { idInstance: '1101', apiToken: 't' });
  // Every hour is working time, so the numbers are plain hours.
  store.conversations.setSettings(company.id, { responseTargetHours: 4, workDays: [0, 1, 2, 3, 4, 5, 6], dayStart: '00:00', dayEnd: '23:59', timeZone: 'UTC' });
  const msg = (chatId, direction, at, extra = {}) => store.createWhatsappMessage({
    companyId: company.id, instanceId: instance.id, direction, chatId, phone: chatId.replace('@c.us', ''), type: 'text', body: 'x',
    status: direction === 'inbound' ? 'delivered' : 'sent', createdAt: new Date(at),
    ...(direction === 'inbound' ? { receivedAt: new Date(at) } : { sentAt: new Date(at) }), ...extra,
  });
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet }).listen(0);
  app.unref();
  return { store, company, ada, carla, acc, msg, app, as: (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` }) };
};

test('first replies per person, in working hours; auto replies and campaigns are not replies', () => {
  const ctx = build();
  const now = new Date('2026-11-12T12:00:00Z');
  const h = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();
  // Chat A: customer waits 2h, Carla answers; then waits 1h, Ada answers.
  ctx.msg('968001@c.us', 'inbound', h(10));
  ctx.msg('968001@c.us', 'inbound', h(9.5));
  ctx.msg('968001@c.us', 'outbound', h(8), { actorUserId: ctx.carla.id, actorName: 'Carla' });
  ctx.msg('968001@c.us', 'outbound', h(7.9), { actorUserId: ctx.carla.id, actorName: 'Carla' });
  ctx.msg('968001@c.us', 'inbound', h(6));
  ctx.msg('968001@c.us', 'outbound', h(5), { actorUserId: ctx.ada.id, actorName: 'Ada' });
  // Chat B: an auto reply and a campaign message do not end the wait; still unanswered.
  ctx.msg('968002@c.us', 'inbound', h(3));
  ctx.msg('968002@c.us', 'outbound', h(2.99), { actorName: 'Auto-reply', contextEntityType: 'auto_reply', contextEntityId: 'away' });
  ctx.msg('968002@c.us', 'outbound', h(2), { actorUserId: ctx.ada.id, contextEntityType: 'whatsapp_campaign', contextEntityId: 'c1' });
  // Chat C: older than the window: left out.
  ctx.msg('968003@c.us', 'inbound', h(24 * 40));
  ctx.msg('968003@c.us', 'outbound', h(24 * 40 - 1), { actorUserId: ctx.ada.id });

  const r = whatsappReport(ctx.store, ctx.company.id, 30, now, []);
  assert.equal(r.totals.inbound, 4);
  assert.equal(r.totals.answered, 2);
  assert.equal(r.totals.unanswered, 1);
  assert.equal(r.totals.chats, 2);
  const carla = r.people.find((p) => p.name === 'Carla');
  const ada = r.people.find((p) => p.name === 'Ada');
  assert.ok(Math.abs(carla.medianReplyHours - 2) < 0.05, `Carla ${carla.medianReplyHours}`);
  assert.ok(Math.abs(ada.medianReplyHours - 1) < 0.05, `Ada ${ada.medianReplyHours}`);
  assert.deepEqual([carla.answered, carla.messagesSent, ada.answered, ada.messagesSent], [1, 2, 1, 1], 'the campaign message is not Ada\'s reply');
  assert.ok(Math.abs(r.totals.medianReplyHours - 1.5) < 0.05);
  assert.equal(r.days.length, 30);
  assert.equal(r.days.reduce((s, d) => s + d.inbound, 0), 4);
});

test('the report compares people: Admins and Managers only', async () => {
  const ctx = build();
  const url = `/companies/${ctx.company.id}/whatsapp/report?days=7`;
  assert.equal((await request(ctx.app).get(url).set(ctx.as(ctx.carla))).status, 200);
  assert.equal((await request(ctx.app).get(url).set(ctx.as(ctx.acc))).status, 403);
  const res = await request(ctx.app).get(url).set(ctx.as(ctx.ada));
  assert.equal(res.body.days.length, 7);
  assert.deepEqual(Object.keys(res.body.totals).sort(), ['answered', 'chats', 'inbound', 'lateNow', 'medianReplyHours', 'newChats', 'openNow', 'outbound', 'unanswered']);
});
