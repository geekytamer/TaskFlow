const test = require('node:test');
const assert = require('node:assert/strict');

const KEY1 = 'a'.repeat(64);
const KEY2 = 'b'.repeat(64);
const load = () => {
  delete require.cache[require.resolve('../dist/social/crypto')];
  return require('../dist/social/crypto');
};

test('a sealed token opens, and sealing twice gives different ciphertexts', () => {
  process.env.SOCIAL_TOKEN_KEYS = `k1:${KEY1}`;
  const { sealToken, openToken } = load();
  const a = sealToken('IGQ-secret-token');
  const b = sealToken('IGQ-secret-token');
  assert.notEqual(a, b);
  assert.match(a, /^v1:k1:/);
  assert.equal(a.includes('IGQ-secret-token'), false);
  assert.equal(openToken(a), 'IGQ-secret-token');
});

test('a tampered token is refused', () => {
  process.env.SOCIAL_TOKEN_KEYS = `k1:${KEY1}`;
  const { sealToken, openToken } = load();
  const parts = sealToken('secret').split(':');
  parts[4] = Buffer.from('tampered!').toString('base64url');
  assert.throws(() => openToken(parts.join(':')));
});

test('keys rotate: the first key seals, every listed key still opens', () => {
  process.env.SOCIAL_TOKEN_KEYS = `k1:${KEY1}`;
  const old = load().sealToken('old-token');
  process.env.SOCIAL_TOKEN_KEYS = `k2:${KEY2},k1:${KEY1}`;
  const { sealToken, openToken } = load();
  assert.equal(openToken(old), 'old-token');
  assert.match(sealToken('new'), /^v1:k2:/);
  process.env.SOCIAL_TOKEN_KEYS = `k2:${KEY2}`;
  assert.throws(() => load().openToken(old), /unknown key/i);
});

test('production refuses to run without keys; development uses a throwaway key', () => {
  const env = process.env.NODE_ENV;
  delete process.env.SOCIAL_TOKEN_KEYS;
  process.env.NODE_ENV = 'production';
  assert.throws(() => load().sealToken('x'), /SOCIAL_TOKEN_KEYS/);
  process.env.NODE_ENV = 'test';
  const { sealToken, openToken } = load();
  assert.equal(openToken(sealToken('x')), 'x');
  process.env.NODE_ENV = env;
});
