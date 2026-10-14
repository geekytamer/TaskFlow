const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const open = (dbPath) => new DataStore({ dbPath, seedOnEmpty: true });
const setup = () => {
  const dbPath = path.join(makeTmpDir('taskflow-conv-'), 'taskflow.db');
  const store = open(dbPath);
  const companyId = '1';
  const owner = store.db.prepare('SELECT id FROM users LIMIT 1').get().id;
  const contact = store.createContact({ companyId, name: 'Conv Client', roles: ['Customer'] });
  store.db.prepare('UPDATE contacts SET ownerUserId = ? WHERE id = ?').run(owner, contact.id);
  return { store, dbPath, companyId, owner, contactId: contact.id };
};
const staffMsg = (threadId, userId, extra = {}) => ({
  threadId, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff',
  authorUserId: userId, authorPortalUserId: null, body: 'hello', ...extra,
});
const portalMsg = (threadId) => ({
  threadId, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal',
  authorUserId: null, authorPortalUserId: 'pu-1', body: 'hi there',
});

test('ensureConversation is one per contact and creates the General thread assigned to the contact owner', () => {
  const { store, companyId, owner, contactId } = setup();
  const a = store.conversations.ensureConversation(companyId, contactId);
  const b = store.conversations.ensureConversation(companyId, contactId);
  assert.equal(a.id, b.id);
  assert.equal(a.ownerUserId, owner);
  const general = store.conversations.generalThread(companyId, contactId);
  assert.equal(general.subject, 'General');
  assert.equal(general.assigneeUserId, owner);
  assert.equal(store.conversations.threadsOf(a.id).length, 1);
});

test('a portal message sets waiting_us and keeps the first waitingSince; a staff portal reply sets waiting_them; a note changes nothing', () => {
  const { store, companyId, owner, contactId } = setup();
  const c = store.conversations;
  const thread = c.generalThread(companyId, contactId);
  const first = c.addMessage(portalMsg(thread.id));
  let t = c.getThread(thread.id);
  assert.equal(t.state, 'waiting_us');
  assert.equal(t.waitingSince, first.createdAt);
  c.addMessage(portalMsg(thread.id));
  t = c.getThread(thread.id);
  assert.equal(t.state, 'waiting_us');
  assert.equal(t.waitingSince, first.createdAt);
  c.addMessage({ ...staffMsg(thread.id, owner), channel: 'note', direction: 'none', visibility: 'internal' });
  t = c.getThread(thread.id);
  assert.equal(t.state, 'waiting_us');
  assert.equal(t.waitingSince, first.createdAt);
  c.addMessage(staffMsg(thread.id, owner));
  t = c.getThread(thread.id);
  assert.equal(t.state, 'waiting_them');
  assert.equal(t.waitingSince, null);
  assert.equal(c.messages(thread.id).length, 4);
  assert.throws(() => c.addMessage(staffMsg(thread.id, owner, { body: '' })));
  assert.throws(() => c.addMessage(staffMsg(thread.id, owner, { body: 'x'.repeat(4001) })));
});

test('a snoozed thread past its date reads as waiting_us', () => {
  const { store, companyId, contactId } = setup();
  const c = store.conversations;
  const thread = c.generalThread(companyId, contactId);
  c.setState(thread.id, 'snoozed', '2030-01-01T00:00:00.000Z');
  const t = c.getThread(thread.id);
  assert.equal(c.effectiveState(t, '2029-12-31T00:00:00.000Z'), 'snoozed');
  assert.equal(c.effectiveState(t, '2030-01-02T00:00:00.000Z'), 'waiting_us');
});

test('reads, mentions and listing work', () => {
  const { store, companyId, owner, contactId } = setup();
  const c = store.conversations;
  const thread = c.generalThread(companyId, contactId);
  const m = c.addMessage(portalMsg(thread.id));
  c.markRead(thread.id, { type: 'staff', id: owner }, 'a');
  c.markRead(thread.id, { type: 'staff', id: owner }, 'b');
  assert.deepEqual(c.readsOf(thread.id), [{ readerType: 'staff', readerId: owner, lastReadAt: 'b' }]);
  c.addMentions(m.id, [owner, owner]);
  assert.deepEqual(c.mentionsOf(m.id), [owner]);
  assert.equal(c.listThreads(companyId, { contactIds: new Set([contactId]), states: ['waiting_us'] }).length, 1);
  assert.equal(c.listThreads(companyId, { assigneeUserId: null }).length, 0);
});

test('migration 131 copies account_messages into the General thread with the same ids, authors and files', () => {
  const { store, dbPath, companyId, owner, contactId } = setup();
  const ins = store.db.prepare(
    `INSERT INTO account_messages (id, companyId, contactId, authorType, authorUserId, authorPortalUserId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  ins.run('m-portal', companyId, contactId, 'portal', null, 'pu-1', 'from client', '2026-01-01T10:00:00.000Z');
  ins.run('m-staff', companyId, contactId, 'staff', owner, null, 'from staff', '2026-01-01T11:00:00.000Z');
  ins.run('m-gone', companyId, contactId, 'staff', 'deleted-user', null, 'from a leaver', '2026-01-01T12:00:00.000Z');
  ins.run('m-last', companyId, contactId, 'portal', null, 'pu-1', 'client again', '2026-01-01T13:00:00.000Z');
  const file = store.thread.addFile({
    companyId, contactId, uploader: { kind: 'staff', userId: owner }, fileName: 'a.png', mimeType: 'image/png', content: Buffer.from('x'),
  });
  store.thread.attach([file.id], { type: 'message', id: 'm-staff' }, { companyId, contactId, uploader: { kind: 'staff', userId: owner } });
  store.db.prepare("DELETE FROM users WHERE id = 'deleted-user'").run();
  store.db.exec(`DELETE FROM schema_migrations WHERE id = '131_conversations';
    DROP TABLE conversation_mentions; DROP TABLE conversation_reads; DROP TABLE conversation_messages;
    DROP TABLE conversation_threads; DROP TABLE conversations;`);
  store.db.close();

  const again = open(dbPath);
  const general = again.conversations.generalThread(companyId, contactId);
  const msgs = again.conversations.messages(general.id);
  assert.deepEqual(msgs.map((m) => m.id), ['m-portal', 'm-staff', 'm-gone', 'm-last']);
  assert.equal(msgs[1].authorUserId, owner);
  assert.equal(msgs[2].authorUserId, 'deleted-user');
  assert.equal(msgs[0].direction, 'in');
  assert.equal(msgs[1].direction, 'out');
  assert.equal(msgs[0].body, 'from client');
  assert.equal(again.thread.filesOf('message', 'm-staff')[0].id, file.id);
  assert.equal(general.state, 'waiting_us');
  assert.equal(general.waitingSince, '2026-01-01T13:00:00.000Z');
  assert.equal(general.assigneeUserId, owner);
});
