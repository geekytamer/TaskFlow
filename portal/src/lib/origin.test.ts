import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from './origin';

test('a request from the same host is accepted, including a non-default port', () => {
  assert.equal(isSameOrigin({ origin: 'https://clients.peak.test', host: 'clients.peak.test' }), true);
  assert.equal(isSameOrigin({ origin: 'http://localhost:9003', host: 'localhost:9003' }), true);
  assert.equal(isSameOrigin({ origin: 'https://Clients.Peak.test', host: 'clients.peak.test' }), true);
});

test('a missing, foreign, or malformed origin is refused', () => {
  assert.equal(isSameOrigin({ origin: null, host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://evil.test', host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://clients.peak.test.evil.test', host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'null', host: 'clients.peak.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://clients.peak.test', host: null }), false);
});
