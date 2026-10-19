const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { addWorkingHours, workingHoursBetween, slaOf, DEFAULT_CONVERSATION_SETTINGS: D } = require('../dist/conversations/sla');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };

test('addWorkingHours runs inside Sun-Thu 08:00-17:00 Muscat', () => {
  // Thu 16:30 Muscat + 4h: 30 min Thursday, 3.5 h from Sunday 08:00.
  assert.equal(addWorkingHours('2026-10-15T12:30:00Z', 4, D), '2026-10-18T07:30:00.000Z');
  // Thu 22:00 Muscat: counts from Sunday 08:00.
  assert.equal(addWorkingHours('2026-10-15T18:00:00Z', 4, D), '2026-10-18T08:00:00.000Z');
  // Fri 10:00 Muscat: counts from Sunday 08:00.
  assert.equal(addWorkingHours('2026-10-16T06:00:00Z', 1, D), '2026-10-18T05:00:00.000Z');
  // Inside a day: Sun 09:00 Muscat + 2h = 11:00 Muscat.
  assert.equal(addWorkingHours('2026-10-18T05:00:00Z', 2, D), '2026-10-18T07:00:00.000Z');
});

test('workingHoursBetween excludes the weekend and off hours', () => {
  // Thu 16:00 Muscat to Sun 09:00 Muscat = 1h + 1h.
  assert.equal(workingHoursBetween('2026-10-15T12:00:00Z', '2026-10-18T05:00:00Z', D), 2);
  assert.equal(workingHoursBetween('2026-10-16T00:00:00Z', '2026-10-17T20:00:00Z', D), 0);
  assert.equal(workingHoursBetween('2026-10-18T05:00:00Z', '2026-10-18T04:00:00Z', D), 0);
  // A whole Sun-Thu week is five 9-hour days.
  assert.equal(workingHoursBetween('2026-10-18T00:00:00Z', '2026-10-25T00:00:00Z', D), 45);
});

test('slaOf is ok, amber at half the target, red past it', () => {
  const since = '2026-10-18T04:00:00Z'; // Sun 08:00 Muscat
  assert.equal(slaOf(null, since, D), null);
  assert.equal(slaOf(since, '2026-10-18T05:00:00Z', D).level, 'ok');
  const amber = slaOf(since, '2026-10-18T06:00:00Z', D);
  assert.equal(amber.level, 'amber');
  assert.equal(amber.dueAt, '2026-10-18T08:00:00.000Z');
  assert.equal(slaOf(since, '2026-10-18T08:00:00Z', D).level, 'amber');
  assert.equal(slaOf(since, '2026-10-18T08:01:00Z', D).level, 'red');
});

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-conv-sla-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, name, email) => store.createUser({ name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const carla = staff('Manager', 'Carla', 'carla@peak.test');
  const eve = staff('Employee', 'Eve', 'eve@peak.test');
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  return { store, company, server, carlaAuth: auth(carla), eveAuth: auth(eve) };
};

const GOOD = { responseTargetHours: 2, workDays: [1, 2, 3], dayStart: '09:00', dayEnd: '18:00', timeZone: 'Asia/Dubai' };

test('settings default, round trip and validation', async () => {
  const ctx = build();
  const url = `/companies/${ctx.company.id}/conversation-settings`;
  const got = await request(ctx.server).get(url).set(ctx.eveAuth);
  assert.equal(got.status, 200);
  assert.deepEqual(got.body, D);
  assert.equal((await request(ctx.server).put(url).set(ctx.eveAuth).send(GOOD)).status, 403);
  const saved = await request(ctx.server).put(url).set(ctx.carlaAuth).send(GOOD);
  assert.equal(saved.status, 200);
  assert.deepEqual((await request(ctx.server).get(url).set(ctx.eveAuth)).body, GOOD);
  for (const bad of [
    { dayStart: '17:00', dayEnd: '08:00' },
    { dayStart: '09:00', dayEnd: '09:00' },
    { timeZone: 'Mars/Olympus' },
    { responseTargetHours: 0.1 },
    { responseTargetHours: 100 },
    { workDays: [] },
    { workDays: [7] },
    { dayStart: '9am' },
  ]) {
    assert.equal((await request(ctx.server).put(url).set(ctx.carlaAuth).send({ ...GOOD, ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual((await request(ctx.server).get(url).set(ctx.eveAuth)).body, GOOD);
});

test('inbox state=overdue lists only red threads, oldest first for waiting_us; thread view carries sla', async () => {
  const ctx = build();
  const c = ctx.store.conversations;
  const mk = (name, waitingSince) => {
    const contact = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name, roles: ['Client'] });
    const t = c.generalThread(ctx.company.id, contact.id);
    c.addMessage({ threadId: t.id, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: 'p', body: 'hi' });
    ctx.store.db.prepare('UPDATE conversation_threads SET waitingSince = ? WHERE id = ?').run(waitingSince, t.id);
    return t;
  };
  mk('Newer Red', '2026-01-06T05:00:00.000Z');
  mk('Older Red', '2026-01-04T05:00:00.000Z');
  mk('Fresh', new Date().toISOString());
  const get = (q) => request(ctx.server).get(`/companies/${ctx.company.id}/inbox?view=all${q}`).set(ctx.eveAuth);
  const overdue = await get('&state=overdue');
  assert.equal(overdue.status, 200);
  assert.deepEqual(overdue.body.threads.map((t) => t.contact.name), ['Older Red', 'Newer Red']);
  assert.ok(overdue.body.threads.every((t) => t.sla.level === 'red'));
  const waiting = await get('&state=waiting_us');
  assert.deepEqual(waiting.body.threads.map((t) => t.contact.name), ['Older Red', 'Newer Red', 'Fresh']);
  assert.equal(waiting.body.threads[2].sla.level, 'ok');
  const done = ctx.store.conversations.generalThread(ctx.company.id, ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Quiet', roles: ['Client'] }).id);
  const view = await request(ctx.server).get(`/conversation-threads/${done.id}`).set(ctx.eveAuth);
  assert.equal(view.body.thread.sla, null);
});
