const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { HttpMetaClient, FixtureMetaClient, MetaAuthError, MetaRateLimitError } = require('../dist/social/meta-client');

const FIXTURES = path.join(__dirname, 'fixtures', 'meta');
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('the fixture client answers in the shapes the app uses', async () => {
  const c = new FixtureMetaClient(FIXTURES);
  const me = await c.profile('t');
  assert.deepEqual([me.username, me.accountType, me.followers], ['lina.eats', 'MEDIA_CREATOR', 184230]);
  const ins = await c.accountInsights('t', me.id);
  assert.deepEqual([ins.views, ins.reach, ins.engagedAccounts], [52310, 31877, 4120]);
  assert.equal(ins.demographics.country.OM, 98000);
  assert.deepEqual(await c.mediaByPermalink('t', me.id, 'https://instagram.com/reel/AbC123'), { id: '18000000000000011' });
  assert.equal(await c.mediaByPermalink('t', me.id, 'https://instagram.com/p/nope'), null);
  assert.deepEqual(await c.mediaInsights('t', '1'), { views: 88412, likes: 6120, comments: 431, saves: 902, shares: 377 });
});

test('the HTTP client calls Graph v26 with views, never impressions, and maps errors', async () => {
  const calls = [];
  const fetchStub = async (url) => {
    calls.push(String(url));
    if (String(url).includes('bad-token')) return json({ error: { code: 190, message: 'Invalid OAuth access token' } }, 400);
    if (String(url).includes('slow-down')) return json({ error: { code: 4, message: 'Application request limit reached' } }, 400);
    if (String(url).includes('/me?')) return json(require(path.join(FIXTURES, 'me.json')));
    return json({ data: [] });
  };
  const c = new HttpMetaClient({ appId: 'app', appSecret: 'secret', fetch: fetchStub });
  await c.profile('good');
  assert.match(calls[0], /^https:\/\/graph\.instagram\.com\/v26\.0\/me\?fields=/);
  await c.accountInsights('good', '1');
  assert.ok(calls.some((u) => u.includes('metric=views') && !u.includes('impressions')));
  await assert.rejects(c.profile('bad-token'), MetaAuthError);
  await assert.rejects(c.profile('slow-down'), MetaRateLimitError);
  const url = new URL(c.authorizeUrl('state-123', 'https://peak.example/cb'));
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_insights');
  assert.equal(url.searchParams.get('state'), 'state-123');
});
