import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudience, parseHost } from './audience';

test('only client and influencer are audiences', () => {
  assert.equal(parseAudience('client'), 'client');
  assert.equal(parseAudience('influencer'), 'influencer');
  for (const bad of [undefined, '', 'admin', 'Client']) {
    assert.throws(() => parseAudience(bad), /PORTAL_AUDIENCE/);
  }
});

test('a host is an audience or the public lobby', () => {
  assert.equal(parseHost('lobby'), 'lobby');
  assert.equal(parseHost('client'), 'client');
  assert.throws(() => parseHost('admin'), /PORTAL_AUDIENCE/);
  assert.throws(() => parseAudience('lobby'), /PORTAL_AUDIENCE/, 'the lobby is not a signed-in audience');
});
