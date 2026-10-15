import assert from 'node:assert/strict';
import test from 'node:test';
import { authorLine, previewLine, relativeTime, threadTitle } from './thread-labels';

test('the General thread shows the localized name, other subjects stay as written', () => {
  assert.equal(threadTitle('General', 'en'), 'General');
  assert.equal(threadTitle('General', 'ar'), 'عام');
  assert.equal(threadTitle('Invoice 114', 'ar'), 'Invoice 114');
});

test('team messages read "Name · Company", yours "You", a colleague by name', () => {
  assert.equal(authorLine({ kind: 'team', name: 'Carla', company: 'Peak Media' }, 'en'), 'Carla · Peak Media');
  assert.equal(authorLine({ kind: 'team', name: null, company: 'Peak Media' }, 'en'), 'Your account team · Peak Media');
  assert.equal(authorLine({ kind: 'team', name: 'Carla', company: null }, 'en'), 'Carla');
  assert.equal(authorLine({ kind: 'you', name: 'Sam', company: 'Acme' }, 'en'), 'You');
  assert.equal(authorLine({ kind: 'client', name: 'Dana', company: 'Acme' }, 'en'), 'Dana');
  assert.equal(authorLine({ kind: 'client', name: null, company: null }, 'ar'), 'أحد زملائك');
});

test('the preview prefixes your own last message', () => {
  assert.equal(previewLine({ body: 'Thanks', authorKind: 'you' }, 'en'), 'You: Thanks');
  assert.equal(previewLine({ body: 'Thanks', authorKind: 'team' }, 'en'), 'Thanks');
  assert.equal(previewLine(null, 'en'), '');
});

test('relative time is short, and falls back to the date after a week', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  assert.equal(relativeTime('2026-10-15T11:59:40Z', now, 'en'), 'now');
  assert.equal(relativeTime('2026-10-15T11:15:00Z', now, 'en'), '45 min ago');
  assert.equal(relativeTime('2026-10-15T07:00:00Z', now, 'en'), '5 hr ago');
  assert.equal(relativeTime('2026-10-13T12:00:00Z', now, 'en'), '2 days ago');
  assert.equal(relativeTime('2026-09-01T12:00:00Z', now, 'en'), 'Sep 1, 2026');
  assert.equal(relativeTime(null, now, 'en'), '');
});
