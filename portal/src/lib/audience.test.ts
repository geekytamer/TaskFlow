import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudience } from './audience';

test('only client and influencer are audiences', () => {
  assert.equal(parseAudience('client'), 'client');
  assert.equal(parseAudience('influencer'), 'influencer');
  for (const bad of [undefined, '', 'admin', 'Client']) {
    assert.throws(() => parseAudience(bad), /PORTAL_AUDIENCE/);
  }
});
