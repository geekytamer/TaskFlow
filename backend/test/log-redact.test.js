const test = require('node:test');
const assert = require('node:assert/strict');
const { redactUrl } = require('../dist/log-redact');

test('action tokens and push endpoints never reach the logs', () => {
  assert.equal(redactUrl('/push-actions/abc.DEF_123-x'), '/push-actions/[redacted]');
  assert.equal(redactUrl('/push-actions/abc.def?x=1'), '/push-actions/[redacted]?x=1');
  assert.equal(redactUrl('/push/devices?endpoint=https%3A%2F%2Fpush.example%2Fsend%2Fsecret'), '/push/devices?endpoint=[redacted]');
  assert.equal(redactUrl('/portal-api/client/push/devices?a=1&endpoint=https%3A%2F%2Fx&b=2'), '/portal-api/client/push/devices?a=1&endpoint=[redacted]&b=2');
  assert.equal(redactUrl('/tasks?status=open'), '/tasks?status=open');
});
