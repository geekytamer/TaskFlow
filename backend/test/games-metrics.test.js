const test = require('node:test');
const assert = require('node:assert/strict');
const { METRICS, offeredMetrics, scoreGame } = require('../dist/games/metrics');

/** Metrics are pure: same events and params, same points. No clock, network or randomness. */

const ev = (actorKey, postRef, text, at, action = 'comment') => ({
  externalId: `${actorKey}-${postRef}-${at}`, actorKey, actorHandle: actorKey.split(':')[1], action, postRef,
  occurredAt: new Date(at), textLength: text.length, textHash: text,
});

test('comments: points per valid comment, with a per-post cap, a minimum length and unique text', () => {
  const events = [
    ev('ig:a', 'p1', 'love this!!', 1), ev('ig:a', 'p1', 'so good wow', 2), ev('ig:a', 'p1', 'third one here', 3),
    ev('ig:a', 'p2', 'ok', 4),
    ev('ig:b', 'p1', 'love this!!', 5), ev('ig:b', 'p2', 'love this!!', 6),
  ];
  const scores = METRICS.comments.score(events, { pointsPerComment: 2, maxPerPost: 2, minLength: 5, uniqueText: true });
  assert.equal(scores.get('ig:a').points, 4, 'two on p1 (capped), the short one ignored');
  assert.equal(scores.get('ig:b').points, 2, 'the same text again does not count twice');
});

test('replies and mentions only count their own action', () => {
  const events = [ev('ig:a', 'p1', 'hello there', 1, 'reply'), ev('ig:a', 'p1', 'hello again', 2, 'comment'), ev('ig:a', 'p1', '@peak hi', 3, 'mention')];
  assert.equal(METRICS.replies.score(events, { pointsPerReply: 3 }).get('ig:a').points, 3);
  assert.equal(METRICS.mentions.score(events, { pointsPerMention: 5 }).get('ig:a').points, 5);
});

test('only metrics whose actions the sources supply are offered', () => {
  assert.deepEqual(offeredMetrics([]).map((m) => m.key), ['manual_points']);
  assert.deepEqual(offeredMetrics(['comment']).map((m) => m.key).sort(), ['comments', 'manual_points']);
});

test('a game total is the sum of points times weight, exclusions removed, ties to whoever got there first', () => {
  const awards = [
    { actorKey: 'ig:a', actorHandle: 'a', points: 10, createdAt: new Date(1) },
    { actorKey: 'ig:b', actorHandle: 'b', points: 5, createdAt: new Date(2) },
    { actorKey: 'ig:b', actorHandle: 'b', points: 5, createdAt: new Date(3) },
    { actorKey: 'ig:c', actorHandle: 'c', points: 50, createdAt: new Date(4) },
    { actorKey: 'ig:a', actorHandle: 'a', points: -2, createdAt: new Date(5) },
    { actorKey: 'ig:a', actorHandle: 'a', points: 2, createdAt: new Date(6) },
  ];
  const board = scoreGame({
    metrics: [{ metricKey: 'manual_points', weight: 2, params: {} }],
    events: [], awards, excluded: new Set(['ig:c']),
  });
  assert.deepEqual(board.map((r) => [r.rank, r.actorKey, r.points]), [[1, 'ig:b', 20], [2, 'ig:a', 20]],
    'b reached 10 raw points at t=3; a fell back and only reached 10 again at t=6');
  assert.equal(board.find((r) => r.actorKey === 'ig:c'), undefined, 'an excluded actor is not ranked');
  assert.deepEqual(board[0].breakdown, { manual_points: 20 });
});

test('scoring is deterministic and replaying the same input changes nothing', () => {
  const input = { metrics: [{ metricKey: 'manual_points', weight: 1, params: {} }], events: [], awards: [{ actorKey: 'x:1', actorHandle: '1', points: 3, createdAt: new Date(1) }], excluded: new Set() };
  assert.deepEqual(scoreGame(input), scoreGame(input));
});
