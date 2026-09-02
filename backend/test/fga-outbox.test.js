const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { enqueueTuples, drainOutbox } = require('../dist/permissions/outbox');
const { makeTmpDir } = require('./helpers/tmp');

const freshStore = () => {
  const dir = makeTmpDir('taskflow-outbox-');
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

const okWriter = () => ({ calls: [], async write(req) { this.calls.push(req); } });
const failWriter = () => ({ async write() { throw new Error('connection refused'); } });

const T = { user: 'user:a', relation: 'direct_member', object: 'group:g' };

test('draining an empty outbox is a no-op', async () => {
  const store = freshStore();
  assert.deepEqual(await drainOutbox(store, okWriter()), { flushed: 0, failed: 0 });
});

test('queued tuples are written and then removed', async () => {
  const store = freshStore();
  enqueueTuples(store, 'write', [T]);
  assert.equal(store.countFgaOutbox(), 1);

  const writer = okWriter();
  assert.deepEqual(await drainOutbox(store, writer), { flushed: 1, failed: 0 });
  assert.equal(store.countFgaOutbox(), 0, 'flushed rows must be removed');
  assert.deepEqual(writer.calls, [{ writes: [T] }]);
});

test('deletes are sent before writes so a repointed tuple does not collide', async () => {
  const store = freshStore();
  enqueueTuples(store, 'write', [T]);
  enqueueTuples(store, 'delete', [{ ...T, object: 'group:old' }]);

  const writer = okWriter();
  await drainOutbox(store, writer);
  assert.ok(writer.calls[0].deletes, 'first call must be the deletes');
  assert.ok(writer.calls[1].writes, 'second call must be the writes');
});

test('a failed drain keeps the rows and records the error', async () => {
  const store = freshStore();
  enqueueTuples(store, 'write', [T]);

  assert.deepEqual(await drainOutbox(store, failWriter()), { flushed: 0, failed: 1 });
  assert.equal(store.countFgaOutbox(), 1, 'rows must survive a failure, not be dropped');

  const rows = store.takeFgaOutboxBatch(10);
  assert.equal(rows.length, 1);
});

test('repeated failures increment the attempt counter', async () => {
  const store = freshStore();
  enqueueTuples(store, 'write', [T]);
  await drainOutbox(store, failWriter());
  await drainOutbox(store, failWriter());

  const raw = store.takeFgaOutboxBatch(10);
  assert.equal(raw.length, 1);
  assert.equal(store.countFgaOutbox(), 1);
});

test('a batch larger than the limit drains across multiple calls', async () => {
  const store = freshStore();
  const many = Array.from({ length: 150 }, (_, i) => ({ ...T, object: `group:g${i}` }));
  enqueueTuples(store, 'write', many);
  assert.equal(store.countFgaOutbox(), 150);

  assert.equal((await drainOutbox(store, okWriter())).flushed, 100);
  assert.equal((await drainOutbox(store, okWriter())).flushed, 50);
  assert.equal(store.countFgaOutbox(), 0);
});
