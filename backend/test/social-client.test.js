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

test('comments come back flat with replies, and tagged and recent media in the shapes the collector uses', async () => {
  const c = new FixtureMetaClient(FIXTURES);
  const comments = await c.mediaComments('t', 'm');
  assert.deepEqual(comments.map((x) => [x.id, x.username, x.parentId]), [['c1', 'sara.k', null], ['c1r1', 'omar_1', 'c1'], ['c2', 'omar_1', null], ['c3', 'copycat', null]]);
  assert.equal(comments[0].text, 'Ramadan Kareem, love this!');
  assert.ok(comments[0].timestamp instanceof Date);
  const tagged = await c.taggedMedia('t', 'u');
  assert.deepEqual(tagged.map((x) => x.username), ['laila_m', 'sara.k']);
  const recent = await c.recentMedia('t', 'u', new Date('2026-10-01'));
  assert.deepEqual(recent.map((x) => x.id), ['m1', 'm2']);
});

test('the HTTP client pages through comments with replies and asks for tags', async () => {
  const calls = [];
  const fetchStub = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/comments') && !String(url).includes('after=')) return json({ data: [{ id: 'a', text: 'x', timestamp: '2026-10-05T10:00:00+0000', username: 'u', from: { id: '1', username: 'u' } }], paging: { cursors: { after: 'NEXT' }, next: 'https://graph.instagram.com/v26.0/m/comments?after=NEXT' } });
    return json({ data: [] });
  };
  const c = new HttpMetaClient({ appId: 'app', appSecret: 's', fetch: fetchStub });
  const all = await c.mediaComments('tok', 'm');
  assert.equal(all.length, 1);
  assert.ok(calls[0].includes('fields=id,text,timestamp,username,from,replies'));
  assert.ok(calls.some((u) => u.includes('after=NEXT')), 'followed the next page');
  await c.taggedMedia('tok', 'u1');
  assert.ok(calls.some((u) => u.includes('/u1/tags?fields=')));
});

test('paging stops at the cap and says the list is incomplete', async () => {
  let calls = 0;
  const fetchStub = async () => { calls += 1; return json({ data: [{ id: `x${calls}`, text: 't', timestamp: '2026-10-04T10:00:00+0000', username: 'u' }], paging: { next: `https://graph.instagram.com/v26.0/m/comments?after=${calls}` } }); };
  const c = new HttpMetaClient({ appId: 'app', appSecret: 's', fetch: fetchStub });
  const all = await c.mediaComments('tok', 'm');
  assert.equal(calls, 20);
  assert.equal(all.length, 20);
  assert.equal(all.truncated, true);
});
