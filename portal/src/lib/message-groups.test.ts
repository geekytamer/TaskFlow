import assert from 'node:assert/strict';
import test from 'node:test';
import { groupMessages, localDay } from './message-groups';

const zone = 'Asia/Muscat';
const msg = (id: string, createdAt: string, kind: 'you' | 'team' | 'client' = 'team', name: string | null = 'Carla') =>
  ({ id, createdAt, author: { kind, name } });

test('the business day decides the day, not UTC', () => {
  assert.equal(localDay('2026-10-06T21:30:00Z', zone), '2026-10-07', 'half past one in the morning in Muscat');
  assert.equal(localDay('2026-10-06T19:30:00Z', zone), '2026-10-06');
});

test('messages fall under their day, and a run from one author shows the author once', () => {
  const groups = groupMessages([
    msg('a', '2026-10-05T08:00:00Z'),
    msg('b', '2026-10-05T08:02:00Z'),
    msg('c', '2026-10-05T08:03:00Z', 'you', null),
    msg('d', '2026-10-05T09:30:00Z', 'you', null),
    msg('e', '2026-10-07T07:00:00Z'),
  ], zone);
  assert.deepEqual(groups.map((g) => [g.day, g.items.map((i) => `${i.message.id}:${i.first ? 'head' : 'cont'}`)]), [
    ['2026-10-05', ['a:head', 'b:cont', 'c:head', 'd:head']],
    ['2026-10-07', ['e:head']],
  ], 'a gap of more than ten minutes starts a new run, and a new day always does');
});

test('two team members are different authors', () => {
  const groups = groupMessages([msg('a', '2026-10-05T08:00:00Z', 'team', 'Carla'), msg('b', '2026-10-05T08:01:00Z', 'team', 'Omar')], zone);
  assert.deepEqual(groups[0].items.map((i) => i.first), [true, true]);
});
