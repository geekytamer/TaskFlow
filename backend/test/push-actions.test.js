const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

process.env.PUSH_ACTION_SECRET = 'push-action-secret-for-tests';

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { signActionToken, verifyActionToken } = require('../dist/push/action-token');
const { sweepPortalPush } = require('../dist/portal/push-alerts');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Thread pushes carry the inbox badge, re-alert on the same tag, and offer
 * "Mark done" through a signed, short-lived token that is re-checked on use.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const tick = () => new Promise((r) => setTimeout(r, 30));
const device = (name) => ({ endpoint: `https://push.example/send/${name}`, keys: { p256dh: 'BKey', auth: 'auth' } });
const HOUR = 3_600_000;

const build = async () => {
  const dbPath = path.join(makeTmpDir('taskflow-push-actions-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Elsewhere', website: '', address: '' });
  const member = (name, role, companyId = company.id) => store.createUser({ name, email: `${name.toLowerCase()}@peak.test`, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }] });
  const carla = member('Carla', 'Manager');
  const eve = member('Eve', 'Employee');
  const dan = member('Dan', 'Employee');
  const outsider = member('Olga', 'Manager', other.id);
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Mouj Café', roles: ['Client'], ownerUserId: carla.id });
  const sent = [];
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
    push: { publicKey: 'BKeyForTests', send: async (s, payload) => { sent.push({ endpoint: s.endpoint, ...JSON.parse(payload) }); return { statusCode: 201 }; } },
  }).listen(0);
  server.unref();
  const staff = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  assert.equal((await request(server).post('/push/subscribe').set(staff(carla)).send(device('carla'))).status, 201);
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
  const thread = () => store.conversations.getThread(general.id);
  const markDone = (userId, threadId = general.id) => request(server).post(`/push-actions/${signActionToken({ userId, threadId, action: 'done' })}`);
  return { store, server, company, carla, eve, dan, outsider, client, general, staff, portal, sent, clientSays, thread, markDone };
};

test('an action token round-trips its claims', () => {
  const token = signActionToken({ userId: 'u1', threadId: 't1', action: 'done' });
  assert.equal(typeof token, 'string');
  assert.match(token, /^[A-Za-z0-9_.-]+$/, 'safe in a URL path');
  assert.deepEqual(verifyActionToken(token), { userId: 'u1', threadId: 't1', action: 'done' });
});

test('an expired token is refused', () => {
  assert.equal(verifyActionToken(signActionToken({ userId: 'u1', threadId: 't1', action: 'done' }, -1)), null);
  assert.notEqual(verifyActionToken(signActionToken({ userId: 'u1', threadId: 't1', action: 'done' }, HOUR)), null);
});

test('a tampered or foreign token is refused', () => {
  const token = signActionToken({ userId: 'u1', threadId: 't1', action: 'done' });
  const [body, sig] = token.split('.');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...claims, userId: 'u2' })).toString('base64url');
  assert.equal(verifyActionToken(`${forged}.${sig}`), null, 'claims changed');
  const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  assert.equal(verifyActionToken(`${body}.${flipped}`), null, 'signature changed');
  assert.equal(verifyActionToken(`${body}.${sig.slice(0, 10)}`), null, 'signature cut short');
  assert.equal(verifyActionToken(''), null);
  assert.equal(verifyActionToken('not-a-token'), null);
  const saved = process.env.PUSH_ACTION_SECRET;
  process.env.PUSH_ACTION_SECRET = 'another-secret';
  try {
    assert.equal(verifyActionToken(token), null, 'signed with another key');
  } finally {
    process.env.PUSH_ACTION_SECRET = saved;
  }
});

test('Mark done from the phone closes the thread the same way the inbox does', async () => {
  const ctx = await build();
  await ctx.clientSays('Can you send the invoice?');
  // The General thread starts with the contact's owner; unassigned, anyone who can see the contact may close it.
  ctx.store.conversations.setAssignee(ctx.general.id, null);
  assert.equal(ctx.thread().state, 'waiting_us');
  assert.ok(ctx.thread().waitingSince);
  const res = await ctx.markDone(ctx.eve.id);
  assert.equal(res.status, 204, JSON.stringify(res.body));
  assert.equal(ctx.thread().state, 'done');
  assert.equal(ctx.thread().waitingSince, null, 'the reply clock clears');
});

test('someone who lost sight of the contact cannot Mark done: 404 and nothing changes', async () => {
  const ctx = await build();
  await ctx.clientSays('Hello?');
  ctx.store.conversations.setAssignee(ctx.general.id, null);
  assert.equal((await ctx.markDone(ctx.eve.id, 'no-such-thread')).status, 404);
  const token = signActionToken({ userId: ctx.eve.id, threadId: ctx.general.id, action: 'done' });
  // Made private after the push went out; Eve is neither the owner nor allowed to read private contacts.
  ctx.store.updateContact(ctx.client.id, { visibility: 'Private' });
  const res = await request(ctx.server).post(`/push-actions/${token}`);
  assert.equal(res.status, 404);
  assert.equal(ctx.thread().state, 'waiting_us');
  // The owner still can.
  assert.equal((await ctx.markDone(ctx.carla.id)).status, 204);
  assert.equal(ctx.thread().state, 'done');
});

test('Mark done is refused for a thread assigned to someone else, a non-member, a deleted user or a bad token', async () => {
  const ctx = await build();
  await ctx.clientSays('Hello?');
  ctx.store.conversations.setAssignee(ctx.general.id, ctx.dan.id);
  assert.equal((await ctx.markDone(ctx.eve.id)).status, 404, 'assigned to Dan');
  assert.equal((await ctx.markDone(ctx.outsider.id)).status, 404, 'not a member');
  assert.equal((await ctx.markDone('no-such-user')).status, 404, 'no such user');
  assert.equal((await ctx.markDone(ctx.dan.id, 'no-such-thread')).status, 404, 'no such thread');
  assert.equal((await request(ctx.server).post('/push-actions/garbage')).status, 404, 'bad token');
  const expired = signActionToken({ userId: ctx.dan.id, threadId: ctx.general.id, action: 'done' }, -1);
  assert.equal((await request(ctx.server).post(`/push-actions/${expired}`)).status, 404, 'expired');
  assert.equal(ctx.thread().state, 'waiting_us');
  assert.equal((await ctx.markDone(ctx.dan.id)).status, 204, 'the assignee can');
  assert.equal(ctx.thread().state, 'done');
});

test('a staff message push carries the badge, re-alerts, and offers Open and Mark done', async () => {
  const ctx = await build();
  await ctx.clientSays('First question');
  await tick();
  const pushes = ctx.sent.filter((p) => p.endpoint.endsWith('/carla'));
  assert.equal(pushes.length, 1);
  const [p] = pushes;
  assert.equal(p.tag, `thread:${ctx.general.id}`);
  assert.equal(p.renotify, true);
  assert.equal(p.badge, 1, 'one unassigned thread waiting on us');
  assert.deepEqual(p.actions.map((a) => a.action), ['open', 'done']);
  assert.ok(p.actions.every((a) => typeof a.title === 'string' && a.title.length > 0));
  assert.deepEqual(verifyActionToken(p.actionToken), { userId: ctx.carla.id, threadId: ctx.general.id, action: 'done' });
});

test('the staff badge counts mine plus unassigned waiting threads the person can see', async () => {
  const ctx = await build();
  const { store, company, carla, dan } = ctx;
  const waiting = (name, opts = {}) => {
    const contact = store.createContact({ companyId: company.id, kind: 'Organization', name, roles: ['Client'], ownerUserId: opts.owner ?? carla.id });
    if (opts.private) store.updateContact(contact.id, { visibility: 'Private' });
    const t = store.conversations.generalThread(company.id, contact.id);
    store.conversations.addMessage({ threadId: t.id, channel: 'note', direction: 'none', visibility: 'internal', authorType: 'staff', authorUserId: carla.id, authorPortalUserId: null, body: 'n' });
    store.conversations.setState(t.id, 'waiting_us');
    // A General thread starts with the contact's owner.
    store.conversations.setAssignee(t.id, opts.assignee ?? null);
    return t;
  };
  waiting('Mine', { assignee: carla.id });
  waiting('Unassigned');
  waiting('Dans', { assignee: dan.id });
  waiting('Private, Dan owns', { owner: dan.id, private: true });
  const { staffInboxBadge } = require('../dist/conversations/alerts');
  assert.equal(staffInboxBadge(store, carla.id, company.id), 3, 'hers, the unassigned one, and the private one (a Manager reads private contacts)');
  assert.equal(staffInboxBadge(store, dan.id, company.id), 3, 'his own, the unassigned one, and the private one he owns');
  assert.equal(staffInboxBadge(store, ctx.eve.id, company.id), 1, 'an Employee: only the unassigned public one; the private one is hidden');
});

test('a portal message push carries the number of unread threads, and no actions', async () => {
  const ctx = await build();
  const { store, server, company, carla, portal } = ctx;
  assert.equal((await request(server).post('/portal-api/client/push/subscribe').set(portal).send(device('badr'))).status, 201);
  store.conversations.addMessage({ threadId: ctx.general.id, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff', authorUserId: carla.id, authorPortalUserId: null, body: 'Your draft is ready' });
  const sent = [];
  const send = async (s, payload) => { sent.push(JSON.parse(payload)); return { statusCode: 201 }; };
  assert.equal(await sweepPortalPush(store, send, company.id), 1);
  assert.equal(sent[0].tag, `thread:${ctx.general.id}`);
  assert.equal(sent[0].badge, 1);
  assert.equal(sent[0].renotify, true);
  assert.equal(sent[0].actions, undefined);
  assert.equal(sent[0].actionToken, undefined);
});
