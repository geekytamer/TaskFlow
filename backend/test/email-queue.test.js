const test = require('node:test');
const assert = require('node:assert/strict');

const { createEmailQueue, isRateLimitError } = require('../dist/email-queue');
const { send, setEmailTransport, configureEmailQueue } = require('../dist/email');

/**
 * Resend allows 10 requests a second. Production lost ~1,560 emails when the
 * hourly reminder sweep fired dozens of critical-notification emails at once.
 * Every email now waits its turn in one queue and retries a rate-limit 429.
 */

/** A virtual clock: sleep() moves time forward instantly, so tests are exact and fast. */
function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; await Promise.resolve(); },
  };
}

test('a burst of 35 emails never starts more than perSecond in any one-second window', async () => {
  const clock = virtualClock();
  const queue = createEmailQueue({ perSecond: 8, maxRetries: 0, baseDelayMs: 100, maxDelayMs: 1000, ...clock, random: () => 0 });
  const starts = [];
  const results = await Promise.all(
    Array.from({ length: 35 }, () => queue.run(async () => { starts.push(clock.now()); return { sent: true }; })),
  );
  assert.equal(results.length, 35);
  assert.ok(results.every((r) => r.sent));
  assert.equal(starts.length, 35);
  for (let i = 0; i < starts.length; i += 1) {
    const inWindow = starts.filter((s) => s > starts[i] - 1000 && s <= starts[i]).length;
    assert.ok(inWindow <= 8, `window ending at ${starts[i]}ms had ${inWindow} starts`);
  }
  // 35 emails at 8/s need just over four seconds, not more.
  assert.ok(starts[34] >= 4000 && starts[34] < 5000, `last start at ${starts[34]}ms`);
});

test('a rate-limit 429 is retried with growing backoff until it goes through', async () => {
  const clock = virtualClock();
  const queue = createEmailQueue({ perSecond: 10, maxRetries: 4, baseDelayMs: 500, maxDelayMs: 8000, ...clock, random: () => 0 });
  const attempts = [];
  const result = await queue.run(async () => {
    attempts.push(clock.now());
    return attempts.length < 3 ? { sent: false, error: 'Too many requests.', rateLimited: true } : { sent: true };
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(attempts.length, 3);
  assert.ok(attempts[1] - attempts[0] >= 500, 'first retry waits at least the base delay');
  assert.ok(attempts[2] - attempts[1] >= 1000, 'second retry waits twice as long');
});

test('retries stop after maxRetries and the last error is returned; other failures are not retried', async () => {
  const clock = virtualClock();
  const queue = createEmailQueue({ perSecond: 10, maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000, ...clock, random: () => 0 });
  let calls = 0;
  const limited = await queue.run(async () => { calls += 1; return { sent: false, error: 'Too many requests.', rateLimited: true }; });
  assert.equal(limited.sent, false);
  assert.equal(calls, 3, 'one try plus two retries');

  calls = 0;
  const quota = await queue.run(async () => { calls += 1; return { sent: false, error: 'You have reached your monthly email sending quota.' }; });
  assert.equal(quota.sent, false);
  assert.equal(calls, 1, 'a quota or other error is not retried');

  calls = 0;
  const thrown = await queue.run(async () => { calls += 1; throw new Error('boom'); });
  assert.equal(thrown.sent, false);
  assert.equal(thrown.error, 'boom');
  assert.equal(calls, 1);
});

test('Resend rate-limit errors are told apart from quota errors', () => {
  assert.equal(isRateLimitError({ name: 'rate_limit_exceeded', statusCode: 429, message: 'Too many requests. You can only make 10 requests per second.' }), true);
  assert.equal(isRateLimitError({ statusCode: 429, message: 'Too many requests.' }), true);
  assert.equal(isRateLimitError({ name: 'monthly_quota_exceeded', statusCode: 429, message: 'You have reached your monthly email sending quota.' }), false);
  assert.equal(isRateLimitError({ name: 'daily_quota_exceeded', statusCode: 429, message: 'You have reached your daily email sending quota.' }), false);
  assert.equal(isRateLimitError({ name: 'validation_error', statusCode: 403, message: 'The domain is not verified.' }), false);
  assert.equal(isRateLimitError(undefined), false);
});

test('send() goes through the queue: a burst stays under the limit and a 429 is retried', async (t) => {
  t.after(() => { setEmailTransport(null); configureEmailQueue(null); });
  configureEmailQueue({ perSecond: 5, maxRetries: 3, baseDelayMs: 20, maxDelayMs: 100 });
  const starts = [];
  let failFirst = 1;
  setEmailTransport(async () => {
    starts.push(Date.now());
    if (failFirst > 0) { failFirst -= 1; return { sent: false, error: 'Too many requests.', rateLimited: true }; }
    return { sent: true };
  });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => send(`p${i}@example.com`, 'Hi', '<p>Hi</p>')));
  assert.ok(results.every((r) => r.sent), JSON.stringify(results));
  assert.equal(starts.length, 13, '12 emails plus one retry');
  for (let i = 0; i < starts.length; i += 1) {
    const inWindow = starts.filter((s) => s > starts[i] - 1000 && s <= starts[i]).length;
    assert.ok(inWindow <= 5, `${inWindow} sends within one second`);
  }
});
