const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');
const { canSeeContact, canSeeMessage } = require('../dist/conversations/visibility');
const { staffMessageView, portalMessageView, staffThreadView } = require('../dist/conversations/views');

const POISON_INTERNAL = 'POISON-INTERNAL-7f3';
const POISON_PRIVATE = 'POISON-PRIVATE-91c';

const setup = () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-convvis-'), 'taskflow.db'), seedOnEmpty: true });
  const companyId = '1';
  const owner = store.db.prepare('SELECT id FROM users LIMIT 1').get().id;
  const contact = store.createContact({ companyId, name: 'Vis Client', roles: ['Customer'] });
  store.db.prepare('UPDATE contacts SET ownerUserId = ? WHERE id = ?').run(owner, contact.id);
  const { user: pu } = store.portal.inviteUser({ companyId, audience: 'client', contactId: contact.id, email: 'v@x.test', name: 'Vera', role: 'client_admin' });
  const c = store.conversations;
  const thread = c.generalThread(companyId, contact.id);
  const base = { threadId: thread.id, authorPortalUserId: null };
  const external = c.addMessage({ ...base, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff', authorUserId: owner, body: 'hello client' });
  const inbound = c.addMessage({ ...base, channel: 'portal', direction: 'in', visibility: 'external', authorType: 'portal', authorUserId: null, authorPortalUserId: pu.id, body: 'hi team' });
  const note = c.addMessage({ ...base, channel: 'note', direction: 'none', visibility: 'internal', authorType: 'staff', authorUserId: owner, body: POISON_INTERNAL });
  const priv = c.addMessage({ ...base, channel: 'note', direction: 'none', visibility: 'owner_private', authorType: 'staff', authorUserId: owner, body: POISON_PRIVATE });
  return { store, companyId, owner, contact, pu, thread, external, inbound, note, priv };
};

test('portal viewers never see internal or owner-private messages', () => {
  const { store, contact, pu, thread } = setup();
  const viewer = { kind: 'portal', portalUserId: pu.id, contactId: contact.id };
  const visible = store.conversations.messages(thread.id).filter((m) => canSeeMessage(m, viewer));
  assert.equal(visible.length, 2);
  const json = JSON.stringify(visible.map((m) => portalMessageView(store, m, pu.id)));
  assert.ok(!json.includes(POISON_INTERNAL));
  assert.ok(!json.includes(POISON_PRIVATE));
  assert.ok(json.includes('hello client'));
  const views = visible.map((m) => portalMessageView(store, m, pu.id));
  assert.equal(views[1].author.kind, 'you');
  assert.equal(views[0].author.kind, 'team');
});

test("staff see internal notes but not someone else's owner-private mail", () => {
  const { owner, thread, store } = setup();
  const ms = store.conversations.messages(thread.id);
  const other = { kind: 'staff', userId: 'someone-else', seesPrivate: true };
  const me = { kind: 'staff', userId: owner, seesPrivate: false };
  assert.deepEqual(ms.filter((m) => canSeeMessage(m, other)).map((m) => m.body).includes(POISON_INTERNAL), true);
  assert.equal(ms.filter((m) => canSeeMessage(m, other)).some((m) => m.body === POISON_PRIVATE), false);
  assert.equal(ms.filter((m) => canSeeMessage(m, me)).some((m) => m.body === POISON_PRIVATE), true);
});

test('a private contact is hidden from staff who are neither owner nor allowed', () => {
  const contact = { visibility: 'Private', ownerUserId: 'u1' };
  assert.equal(canSeeContact(contact, { kind: 'staff', userId: 'u2', seesPrivate: false }), false);
  assert.equal(canSeeContact(contact, { kind: 'staff', userId: 'u1', seesPrivate: false }), true);
  assert.equal(canSeeContact(contact, { kind: 'staff', userId: 'u2', seesPrivate: true }), true);
  assert.equal(canSeeContact({ ownerUserId: 'u1' }, { kind: 'staff', userId: 'u2', seesPrivate: false }), true);
});

test('seenAt is set once a portal user of that contact read after the staff message', () => {
  const { store, owner, pu, thread, external } = setup();
  const t = store.conversations.getThread(thread.id);
  const before = new Date(Date.parse(external.createdAt) - 1000).toISOString();
  store.conversations.markRead(thread.id, { type: 'portal', id: pu.id }, before);
  assert.equal(staffMessageView(store, external, t).seenAt, null);
  const after = new Date(Date.parse(external.createdAt) + 5000).toISOString();
  store.conversations.markRead(thread.id, { type: 'portal', id: pu.id }, after);
  const v = staffMessageView(store, external, t);
  assert.equal(v.seenAt, after);
  assert.equal(v.author.name !== null, true);
  assert.equal(v.author.kind, 'staff');
});

test('editableUntil is 15 minutes for notes; mentions and unread work', () => {
  const { store, owner, thread, note } = setup();
  const t = store.conversations.getThread(thread.id);
  store.conversations.addMentions(note.id, [owner]);
  const v = staffMessageView(store, note, t, owner);
  assert.equal(v.editableUntil, new Date(Date.parse(note.createdAt) + 15 * 60000).toISOString());
  assert.deepEqual(v.mentions.map((m) => m.id), [owner]);
  assert.equal(staffMessageView(store, note, t, 'other').editableUntil, null);
  const tv = staffThreadView(store, t, owner, note.createdAt);
  assert.equal(tv.unread, true);
  store.conversations.markRead(thread.id, { type: 'staff', id: owner }, '9999-01-01T00:00:00.000Z');
  assert.equal(staffThreadView(store, store.conversations.getThread(thread.id), owner, note.createdAt).unread, false);
  assert.equal(tv.contact.name, 'Vis Client');
  assert.equal(tv.lastMessage.visibility, 'owner_private');
});

test('staff view keeps a deleted author as name null; thread view reports effective state', () => {
  const { store, thread } = setup();
  const t = store.conversations.getThread(thread.id);
  const ghost = store.conversations.addMessage({
    threadId: thread.id, channel: 'note', direction: 'none', visibility: 'internal', authorType: 'staff',
    authorUserId: 'deleted-user', authorPortalUserId: null, body: 'from ghost',
  });
  const v = staffMessageView(store, ghost, t);
  assert.equal(v.author.name, null);
  assert.equal(v.author.avatar, null);
  store.conversations.setState(thread.id, 'snoozed', '2020-01-01T00:00:00.000Z');
  const tv = staffThreadView(store, store.conversations.getThread(thread.id), 'x', '2030-01-01T00:00:00.000Z');
  assert.equal(tv.state, 'waiting_us');
  assert.equal(tv.waitingSince, store.conversations.getThread(thread.id).waitingSince);
});

test('portalMessageView throws for internal and owner-private messages', () => {
  const { store, pu, note, priv } = setup();
  assert.throws(() => portalMessageView(store, note, pu.id), /not visible/);
  assert.throws(() => portalMessageView(store, priv, pu.id), /not visible/);
});

test("another viewer's preview and unread skip an owner_private message; ownerOf is honoured", () => {
  const { store, owner, thread, note, priv } = setup();
  const t = store.conversations.getThread(thread.id);
  const tv = staffThreadView(store, t, 'someone-else', priv.createdAt);
  assert.equal(tv.lastMessage.body, POISON_INTERNAL);
  assert.ok(!JSON.stringify(tv).includes(POISON_PRIVATE));
  // read after the visible note, before the hidden private one: not unread for them
  store.conversations.markRead(thread.id, { type: 'staff', id: 'someone-else' }, note.createdAt);
  assert.equal(staffThreadView(store, t, 'someone-else', priv.createdAt).unread, false);
  assert.equal(staffThreadView(store, t, owner, priv.createdAt).lastMessage.body, POISON_PRIVATE);
  const viewer = { kind: 'staff', userId: 'x', seesPrivate: false };
  assert.equal(canSeeMessage(priv, viewer, () => 'x'), true);
  assert.equal(canSeeMessage(priv, viewer, () => 'y'), false);
});

test('portal author company is their own contact; team keeps the tenant company', () => {
  const { store, pu, external, inbound } = setup();
  assert.equal(portalMessageView(store, inbound, pu.id).author.company, 'Vis Client');
  assert.equal(portalMessageView(store, external, pu.id).author.company, store.getCompanyById('1').name);
});
