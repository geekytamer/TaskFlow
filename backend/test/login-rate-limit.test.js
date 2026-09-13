const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer, trustProxySetting } = require('../dist/server');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Behind nginx every request reaches the API from 127.0.0.1. The login limiter
 * keys on the client address, so unless Express trusts the proxy's
 * X-Forwarded-For, every user shares one budget of ten attempts and anyone can
 * lock the whole company out.
 *
 * The limiter is enforced only when NODE_ENV is production, and its memory
 * store is shared by the whole process, so each test uses its own addresses.
 */

const quiet = { info() {}, warn() {}, error() {} };

const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (values) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(saved);
  }
};

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-ratelimit-'), 'taskflow.db');
  const app = createServer({ dbPath, seedOnEmpty: true, allowSeedReset: false, authzEngine: 'legacy', logger: quiet });
  const server = app.listen(0);
  server.unref();
  return server;
};

const failedLogin = (server, forwardedFor) =>
  request(server)
    .post('/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ email: 'nobody@example.com', password: 'wrong' });

test('each client behind the proxy gets its own login budget', () =>
  withEnv({ NODE_ENV: 'production', TRUST_PROXY: undefined }, async () => {
    const server = build();
    for (let i = 0; i < 10; i += 1) {
      assert.notEqual((await failedLogin(server, '203.0.113.10')).status, 429);
    }
    assert.equal((await failedLogin(server, '203.0.113.10')).status, 429, 'the eleventh attempt from one client is throttled');
    assert.notEqual(
      (await failedLogin(server, '203.0.113.11')).status,
      429,
      'another client must not inherit that lockout',
    );
  }));

test('with the proxy untrusted, every client shares one budget', () =>
  withEnv({ NODE_ENV: 'production', TRUST_PROXY: 'false' }, async () => {
    const server = build();
    for (let i = 1; i <= 10; i += 1) {
      await failedLogin(server, `198.51.100.${i}`);
    }
    assert.equal(
      (await failedLogin(server, '198.51.100.99')).status,
      429,
      'this is the behaviour production had: ten different people exhaust one shared budget',
    );
  }));

test('TRUST_PROXY accepts false, hop counts and subnets, and refuses true', () => {
  assert.equal(trustProxySetting(undefined), 'loopback');
  assert.equal(trustProxySetting('  '), 'loopback');
  assert.equal(trustProxySetting('false'), false);
  assert.equal(trustProxySetting('2'), 2);
  assert.equal(trustProxySetting('10.0.0.0/8'), '10.0.0.0/8');
  assert.throws(() => trustProxySetting('true'), /any client/);
});
