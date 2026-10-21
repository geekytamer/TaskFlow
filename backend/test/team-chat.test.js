const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Seed: admin (companies 1-3), user-2 Manager of 1, user-3 Employee of 1,
 * user-4 Manager of 2 only. Staff chats are private to their members.
 */
function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-team-chat-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const sent = [];
  const push = { publicKey: 'test-key', send: async (subscription, payload) => { sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy', push,
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  server.unref();
  const admin = store.listUsers().find((u) => u.email === 'admin@taskflow.com');
  const auth = (id) => `Bearer ${store.issueToken(id)}`;
  const as = (id) => ({
    get: (url) => request(server).get(url).set('Authorization', auth(id)),
    post: (url, body) => request(server).post(url).set('Authorization', auth(id)).send(body ?? {}),
    patch: (url, body) => request(server).patch(url).set('Authorization', auth(id)).send(body ?? {}),
    del: (url) => request(server).delete(url).set('Authorization', auth(id)),
  });
  const device = (userId) => store.push.subscribe({ audience: 'staff', principalId: userId, companyId: '1', endpoint: `https://push.test/${userId}`, p256dh: 'k', auth: 'a', userAgent: null });
  return { server, store, admin, as, auth, sent, device };
}

const base = '/companies/1/team-chats';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('a direct chat is private to its two people', async () => {
  const { admin, as } = setup();
  const opened = await as(admin.id).post(base, { kind: 'direct', userId: 'user-3' });
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  const again = await as('user-3').post(base, { kind: 'direct', userId: admin.id });
  assert.equal(again.body.id, opened.body.id, 'the same pair always gets the same chat');

  const sent = await as(admin.id).post(`${base}/${opened.body.id}/messages`, { body: 'POISON-direct salary talk' });
  assert.equal(sent.status, 201);

  const theirs = await as('user-3').get(`${base}/${opened.body.id}/messages`);
  assert.equal(theirs.status, 200);
  assert.equal(theirs.body.messages.at(-1).body, 'POISON-direct salary talk');

  // A colleague in the same company, an admin of it included, never sees it.
  for (const [who, url] of [['user-2', `${base}/${opened.body.id}/messages`], ['user-2', base], ['user-4', '/companies/2/team-chats']]) {
    const res = await as(who).get(url);
    assert.ok(!JSON.stringify(res.body).includes('POISON'), `${who} ${url} leaks the message`);
  }
  assert.equal((await as('user-2').get(`${base}/${opened.body.id}/messages`)).status, 404);
  assert.equal((await as('user-2').post(`${base}/${opened.body.id}/messages`, { body: 'hi' })).status, 404);
  assert.equal((await as('user-4').get(`${base}/${opened.body.id}/messages`)).status, 403, 'other company');
});

test('chats only reach colleagues of the same company', async () => {
  const { admin, as } = setup();
  assert.equal((await as(admin.id).post(base, { kind: 'direct', userId: 'user-4' })).status, 400, 'user-4 is not in company 1');
  assert.equal((await as(admin.id).post(base, { kind: 'group', name: 'Mixed', memberIds: ['user-3', 'user-4'] })).status, 400);
  assert.equal((await as(admin.id).post(base, { kind: 'direct', userId: admin.id })).status, 400, 'not with yourself');
  const people = await as('user-3').get('/companies/1/team-members');
  assert.equal(people.status, 200);
  assert.ok(people.body.some((p) => p.id === admin.id));
  assert.ok(!people.body.some((p) => p.id === 'user-4'));
  assert.ok(people.body.every((p) => !('email' in p) || typeof p.email === 'string'));
});

test('unread counts and read receipts', async () => {
  const { admin, as } = setup();
  const chat = (await as(admin.id).post(base, { kind: 'direct', userId: 'user-3' })).body;
  await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'one' });
  await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'two' });

  let list = (await as('user-3').get(base)).body;
  assert.equal(list.find((c) => c.id === chat.id).unread, 2);
  assert.equal((await as('user-3').get(`${base}/unread-count`)).body.count, 2);
  assert.equal((await as(admin.id).get(base)).body.find((c) => c.id === chat.id).unread, 0, 'own messages are never unread');

  assert.equal((await as('user-3').post(`${base}/${chat.id}/read`)).status, 200);
  list = (await as('user-3').get(base)).body;
  assert.equal(list.find((c) => c.id === chat.id).unread, 0);
  const view = (await as(admin.id).get(`${base}/${chat.id}/messages`)).body;
  const reader = view.members.find((m) => m.userId === 'user-3');
  assert.ok(reader.lastReadAt, 'the sender can see it was read');
});

test('groups: the creator manages them; members can leave; a removed member loses access', async () => {
  const { admin, as } = setup();
  const created = await as(admin.id).post(base, { kind: 'group', name: 'Sales team', memberIds: ['user-2', 'user-3'] });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.members.length, 3);

  assert.equal((await as('user-3').patch(`${base}/${id}`, { name: 'Hijacked' })).status, 403);
  assert.equal((await as(admin.id).patch(`${base}/${id}`, { name: 'Sales' })).body.name, 'Sales');

  await as(admin.id).post(`${base}/${id}/messages`, { body: 'POISON-group plan' });
  assert.equal((await as(admin.id).patch(`${base}/${id}`, { removeMemberIds: ['user-2'] })).status, 200);
  const gone = await as('user-2').get(`${base}/${id}/messages`);
  assert.equal(gone.status, 404);
  assert.ok(!JSON.stringify((await as('user-2').get(base)).body).includes('POISON'));

  assert.equal((await as('user-3').post(`${base}/${id}/leave`)).status, 200);
  assert.equal((await as('user-3').get(`${base}/${id}/messages`)).status, 404);
});

test('only the author edits or deletes, and only for 15 minutes', async () => {
  const { admin, as, store } = setup();
  const chat = (await as(admin.id).post(base, { kind: 'direct', userId: 'user-3' })).body;
  const msg = (await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'typo' })).body;
  assert.equal((await as('user-3').patch(`${base}/${chat.id}/messages/${msg.id}`, { body: 'not mine' })).status, 403);
  const edited = await as(admin.id).patch(`${base}/${chat.id}/messages/${msg.id}`, { body: 'fixed' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.body, 'fixed');
  assert.ok(edited.body.editedAt);

  store.db.prepare('UPDATE team_chat_messages SET createdAt = ? WHERE id = ?').run(new Date(Date.now() - 16 * 60_000).toISOString(), msg.id);
  assert.equal((await as(admin.id).patch(`${base}/${chat.id}/messages/${msg.id}`, { body: 'late' })).status, 409);
  assert.equal((await as(admin.id).del(`${base}/${chat.id}/messages/${msg.id}`)).status, 409);

  const second = (await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'oops' })).body;
  assert.equal((await as(admin.id).del(`${base}/${chat.id}/messages/${second.id}`)).status, 200);
  const view = (await as('user-3').get(`${base}/${chat.id}/messages`)).body.messages;
  const deleted = view.find((m) => m.id === second.id);
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.body, '', 'a deleted message keeps its place but not its words');
});

test('bad messages are refused', async () => {
  const { admin, as } = setup();
  const chat = (await as(admin.id).post(base, { kind: 'direct', userId: 'user-3' })).body;
  assert.equal((await as(admin.id).post(`${base}/${chat.id}/messages`, { body: '   ' })).status, 400);
  assert.equal((await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'x'.repeat(4001) })).status, 400);
  assert.equal((await as(admin.id).post(base, { kind: 'group', name: '', memberIds: ['user-3'] })).status, 400);
});

test('a new message reaches members\' phones, not the author, not someone who muted it', async () => {
  const { admin, as, sent, device } = setup();
  device('user-2');
  device('user-3');
  device(admin.id);
  const chat = (await as(admin.id).post(base, { kind: 'group', name: 'Ops', memberIds: ['user-2', 'user-3'] })).body;
  assert.equal((await as('user-2').patch(`${base}/${chat.id}`, { muted: true })).status, 200, 'anyone may mute for themselves');
  await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'Truck arrives at 3' });
  await wait(50);
  const to = sent.map((s) => s.endpoint);
  assert.deepEqual(to, ['https://push.test/user-3']);
  const payload = sent[0].payload;
  assert.match(payload.title, /Ops/);
  assert.equal(payload.url, `/inbox?team=${chat.id}`);
  assert.equal(payload.tag, `team:${chat.id}`);
  assert.equal(payload.body, 'Truck arrives at 3');

  // A mention reaches someone even when they muted the chat.
  sent.length = 0;
  await as(admin.id).post(`${base}/${chat.id}/messages`, { body: '@Manager please check', mentionIds: ['user-2'] });
  await wait(50);
  assert.ok(sent.some((s) => s.endpoint === 'https://push.test/user-2'));
});

function openStream(server, auth) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path: '/live', headers: { Authorization: auth } }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const data = block.split('\n').find((l) => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      });
      resolve({ events, close: () => req.destroy() });
    });
    req.on('error', (e) => (e.code === 'ECONNRESET' ? undefined : reject(e)));
  });
}

test('live: members hear a new message at once; other colleagues hear nothing', async (t) => {
  const { server, admin, as, auth } = setup();
  const chat = (await as(admin.id).post(base, { kind: 'direct', userId: 'user-3' })).body;
  const member = await openStream(server, auth('user-3'));
  const colleague = await openStream(server, auth('user-2'));
  t.after(() => { member.close(); colleague.close(); });
  await wait(50);
  await as(admin.id).post(`${base}/${chat.id}/messages`, { body: 'ping' });
  await wait(100);
  assert.ok(member.events.some((e) => e.topics.includes('team-chat')), JSON.stringify(member.events));
  assert.equal(colleague.events.length, 0, JSON.stringify(colleague.events));
});
