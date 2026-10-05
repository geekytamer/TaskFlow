const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { FixtureMetaClient, MetaRateLimitError } = require('../dist/social/meta-client');
const { sealToken } = require('../dist/social/crypto');
const { collectGame, sweepGames } = require('../dist/games/collector');
const { ensureFrozen } = require('../dist/games/games');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Games G2: comments, replies and tags on connected accounts score followers;
 * creators score from their own game posts and follower growth. Removed
 * comments stop counting, results freeze only after a final re-read, and
 * webhooks are signed and only nudge collection.
 */

const quiet = { info() {}, warn() {}, error() {} };
const HOUR = 3600_000;
const APP_SECRET = 'test-app-secret';
const VERIFY = 'verify-me';
const FIXTURES = path.join(__dirname, 'fixtures', 'meta');
const ago = (h) => new Date(Date.now() - h * HOUR);

/** A Meta stand-in whose answers each test sets. */
const fakeMeta = () => {
  const c = new FixtureMetaClient(FIXTURES);
  c.comments = [];
  c.tags = [];
  c.media = [];
  c.figures = {};
  c.mediaByPermalink = async (_t, _u, link) => (link.includes('/p/GAME/') ? { id: 'game-post' } : null);
  c.mediaComments = async () => c.comments;
  c.taggedMedia = async () => c.tags;
  c.recentMedia = async (_t, _u, since) => c.media.filter((m) => m.timestamp >= since);
  c.mediaInsights = async (_t, id) => c.figures[id] ?? { views: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
  return c;
};
const comment = (id, username, text, hoursAgo, parentId = null) => ({ id, username, text, timestamp: ago(hoursAgo), userId: null, parentId });

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-games-live-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const user = (role, email) => store.createUser({ name: email, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }] });
  const admin = user('Admin', 'carla@peak.test');
  const manager = user('Manager', 'mo@peak.test');
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer'] });
  const sami = store.createContact({ companyId: company.id, kind: 'Person', name: 'Sami', roles: ['Influencer'] });
  const brand = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor', roles: ['Client'] });
  const account = (contact, externalId, username) => store.social.upsertAccount({
    companyId: company.id, contactId: contact.id, externalId, username, accountType: 'MEDIA_CREATOR',
    tokenSealed: sealToken(`token-${username}`), expiresAt: new Date(Date.now() + 50 * 86400_000).toISOString(),
  });
  const linaAccount = account(lina, '1784-lina', 'lina.eats');
  const samiAccount = account(sami, '1784-sami', 'sami.cooks');
  const meta = fakeMeta();
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
    social: { client: meta, appSecret: APP_SECRET, redirectUri: 'https://api.peak.test/cb', portalReturnUrl: 'https://creators.peak.test/profile', webhookVerifyToken: VERIFY },
  }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const staff = (method, p, body, as = auth(admin)) => request(server)[method](`/companies/${company.id}/games${p}`).set(as).send(body);
  return { server, store, company, admin, manager, lina, sami, brand, linaAccount, samiAccount, meta, staff, managerAuth: auth(manager) };
};

const makeGame = async (ctx, over = {}) => {
  const res = await ctx.staff('post', '', {
    slug: `g-${crypto.randomBytes(3).toString('hex')}`, name: 'Ramadan challenge', visibility: 'public',
    startsAt: ago(48).toISOString(), endsAt: new Date(Date.now() + 24 * HOUR).toISOString(), ...over,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};

const followersGame = async (ctx) => {
  const game = await makeGame(ctx);
  const post = await ctx.staff('post', `/${game.id}/sources`, { kind: 'post', accountId: ctx.linaAccount.id, permalink: 'https://www.instagram.com/p/GAME/' });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: ctx.linaAccount.id })).status, 201);
  const metrics = await ctx.staff('put', `/${game.id}/metrics`, [
    { metricKey: 'comments', weight: 1, params: { pointsPerComment: 2, minLength: 3, uniqueText: true, maxPerPost: 3 } },
    { metricKey: 'replies', weight: 1, params: { pointsPerReply: 1 } },
    { metricKey: 'mentions', weight: 1, params: { pointsPerMention: 5 } },
  ]);
  assert.equal(metrics.status, 200, JSON.stringify(metrics.body));
  assert.equal((await ctx.staff('post', `/${game.id}/publish`)).status, 200);
  return game;
};

const board = async (ctx, id) => (await ctx.staff('get', `/${id}/scoreboard`)).body.map((r) => [r.handle, r.points]);

test('comments, replies and tags on a connected account score the people who made them', async () => {
  const ctx = build();
  const game = await followersGame(ctx);
  assert.deepEqual((await ctx.staff('get', `/${game.id}`)).body.availableMetrics.map((m) => m.key).sort(), ['comments', 'manual_points', 'mentions', 'replies']);
  ctx.meta.comments = [
    comment('c1', 'Sara.K', 'Ramadan Kareem, love this!', 5),
    comment('c1r', 'omar_1', 'Same here, beautiful', 4, 'c1'),
    comment('c2', 'omar_1', 'ok', 3),
    comment('c3', 'sara.k', 'ramadan kareem,   LOVE this!', 2),
    comment('c4', 'lina.eats', 'Thank you all!', 1),
    comment('c0', 'early', 'Before the start', 60),
  ];
  ctx.meta.tags = [{ id: 't1', username: 'laila_m', timestamp: ago(3), permalink: 'x', caption: 'Iftar with @lina.eats' }];
  const res = await ctx.staff('post', `/${game.id}/collect`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.errors, []);
  assert.ok(res.body.sources.every((s) => s.lastCollectedAt && !s.lastError));
  // sara: one comment (the repeat is the same text); omar: a reply, and "ok" is too short;
  // laila: a tag; lina answering her own post and the comment before the start do not count.
  assert.deepEqual(await board(ctx, game.id), [['laila_m', 5], ['sara.k', 2], ['omar_1', 1]]);

  ctx.meta.comments = [comment('c2', 'x', 'y', 3)];
  await ctx.staff('post', `/${game.id}/collect`);
  assert.deepEqual(await board(ctx, game.id), [['laila_m', 5]], 'deleted comments stop counting');
  assert.equal(ctx.store.games.events(game.id, true).length, 6, 'kept for the record');
  ctx.meta.comments = [comment('c1', 'Sara.K', 'Ramadan Kareem, love this!', 5)];
  await ctx.staff('post', `/${game.id}/collect`);
  assert.deepEqual(await board(ctx, game.id), [['laila_m', 5], ['sara.k', 2]], 'a restored comment counts again');
});

test('an ended game waits for its final re-read before freezing, or for the grace period', async () => {
  const ctx = build();
  const game = await followersGame(ctx);
  ctx.meta.comments = [comment('c1', 'sara', 'Ramadan Kareem!', 5), comment('c2', 'omar', 'Blessed month', 4)];
  await collectGame(ctx.store, ctx.meta, ctx.store.games.get(game.id));
  ctx.store.games.updateGame(game.id, { endsAt: ago(1).toISOString() });
  assert.equal(ensureFrozen(ctx.store, ctx.store.games.get(game.id)).frozenAt, null, 'not frozen before the re-read');

  ctx.meta.comments = [comment('c1', 'sara', 'Ramadan Kareem!', 5)];
  ctx.meta.mediaComments = async () => { throw new MetaRateLimitError('slow down'); };
  await sweepGames(ctx.store, ctx.meta, ctx.company.id);
  assert.equal(ctx.store.games.get(game.id).reconciledAt, null, 'a failed read does not count as the final one');
  ctx.meta.mediaComments = async () => ctx.meta.comments;
  await sweepGames(ctx.store, ctx.meta, ctx.company.id);
  const frozen = ensureFrozen(ctx.store, ctx.store.games.get(game.id));
  assert.ok(frozen.frozenAt);
  assert.deepEqual(ctx.store.games.results(game.id).map((r) => r.actorHandle), ['sara'], 'omar’s deleted comment is out of the final results');

  const stuck = await followersGame(ctx);
  ctx.store.games.updateGame(stuck.id, { startsAt: ago(100).toISOString(), endsAt: ago(49).toISOString() });
  assert.ok(ensureFrozen(ctx.store, ctx.store.games.get(stuck.id)).frozenAt, 'freezes after 48 hours without Meta');
});

test('creators score from their own tagged posts and follower growth', async () => {
  const ctx = build();
  const game = await makeGame(ctx, { audience: 'creators', tag: '#RamadanWithAlNoor' });
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: ctx.linaAccount.id })).status, 409);
  assert.equal((await ctx.staff('put', `/${game.id}/participants`, [ctx.brand.id])).status, 400, 'only influencers take part');
  const set = await ctx.staff('put', `/${game.id}/participants`, [ctx.lina.id, ctx.sami.id]);
  assert.equal(set.status, 200);
  assert.deepEqual(set.body.availableMetrics.map((m) => m.key).sort(), ['creator_engagement', 'creator_shares', 'creator_views', 'follower_growth', 'manual_points']);
  assert.equal((await ctx.staff('put', `/${game.id}/metrics`, [{ metricKey: 'comments', weight: 1 }])).status, 400, 'per-person metrics are not offered to creators games');
  assert.equal((await ctx.staff('put', `/${game.id}/metrics`, [
    { metricKey: 'creator_shares', weight: 1, params: { pointsPerShare: 2 } },
    { metricKey: 'follower_growth', weight: 1, params: { pointsPerFollower: 0.1, maxPoints: 30 } },
  ])).status, 200);

  const day = (h) => ago(h).toISOString().slice(0, 10);
  ctx.store.social.addSnapshot({ accountId: ctx.linaAccount.id, takenOn: day(72), followers: 1000, views: 0, reach: 0, engagedAccounts: 0, demographics: null });
  ctx.store.social.addSnapshot({ accountId: ctx.linaAccount.id, takenOn: day(0), followers: 1500, views: 0, reach: 0, engagedAccounts: 0, demographics: null });
  ctx.meta.media = [
    { id: 'p1', permalink: 'a', timestamp: ago(10), caption: 'Dates for iftar #ramadanwithalnoor' },
    { id: 'p2', permalink: 'b', timestamp: ago(9), caption: 'My morning routine' },
    { id: 'p0', permalink: 'c', timestamp: ago(60), caption: 'Too early #RamadanWithAlNoor' },
  ];
  ctx.meta.figures = { p1: { views: 9000, likes: 300, comments: 40, saves: 20, shares: 12 }, p2: { views: 1, likes: 1, comments: 1, saves: 1, shares: 99 } };
  const res = await ctx.staff('post', `/${game.id}/collect`);
  assert.deepEqual(res.body.errors, []);
  const linaRow = res.body.participants.find((p) => p.contactId === ctx.lina.id);
  assert.deepEqual(linaRow.stats && [linaRow.stats.posts, linaRow.stats.views, linaRow.stats.shares, linaRow.stats.engagement, linaRow.stats.followerGrowth], [1, 9000, 12, 360, 500]);
  // Both accounts read the same fake posts; Sami has no snapshots, so no growth.
  assert.deepEqual(await board(ctx, game.id), [['lina.eats', 54], ['sami.cooks', 24]], '12 shares × 2, plus growth capped at 30');
  assert.equal((await ctx.staff('post', `/${game.id}/publish`)).status, 200);
});

test('a creators game cannot publish without its tag', async () => {
  const ctx = build();
  const game = await makeGame(ctx, { audience: 'creators' });
  await ctx.staff('put', `/${game.id}/metrics`, [{ metricKey: 'manual_points', weight: 1 }]);
  assert.equal((await ctx.staff('post', `/${game.id}/publish`)).status, 409);
  assert.equal((await ctx.staff('patch', `/${game.id}`, { tag: 'no tag' })).status, 400);
});

test('webhooks: subscription check, signature, and only the matching account is marked', async () => {
  const ctx = build();
  const game = await followersGame(ctx);
  await collectGame(ctx.store, ctx.meta, ctx.store.games.get(game.id));
  const ok = await request(ctx.server).get(`/social/meta/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
  assert.equal(ok.status, 200);
  assert.equal(ok.text, '12345');
  assert.equal((await request(ctx.server).get('/social/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status, 403);

  const send = (payload, secret = APP_SECRET) => {
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return request(ctx.server).post('/social/meta/webhook').set('Content-Type', 'application/json').set('X-Hub-Signature-256', `sha256=${sig}`).send(body);
  };
  const event = (id) => ({ object: 'instagram', entry: [{ id, time: 1, changes: [{ field: 'comments', value: { id: 'c9', text: 'forged' } }] }] });
  assert.equal((await send(event('1784-lina'), 'wrong')).status, 401);
  assert.equal(ctx.store.games.sources(game.id).some((s) => s.dirty), false);
  assert.equal((await send(event('1784-sami'))).status, 200);
  assert.equal(ctx.store.games.sources(game.id).some((s) => s.dirty), false, 'another account’s event marks nothing');
  ctx.meta.comments = [];
  let reads = 0;
  ctx.meta.mediaComments = async () => { reads += 1; return []; };
  assert.equal((await send(event('1784-lina'))).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(reads >= 1, 'a valid event triggers a re-read');
  assert.equal(ctx.store.games.events(game.id).some((e) => e.externalId === 'c9'), false, 'payload content is never trusted');
});

test('only admins manage sources; accounts must be connected and in the company', async () => {
  const ctx = build();
  const game = await makeGame(ctx);
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: ctx.linaAccount.id }, ctx.managerAuth)).status, 403);
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: 'nope' })).status, 400);
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'post', accountId: ctx.linaAccount.id, permalink: 'https://www.instagram.com/p/OTHER/' })).status, 400);
  ctx.store.social.updateAccount(ctx.samiAccount.id, { status: 'needs_reconnect' });
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: ctx.samiAccount.id })).status, 400);
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: ctx.linaAccount.id })).status, 201);
  assert.equal((await ctx.staff('post', `/${game.id}/sources`, { kind: 'tags', accountId: ctx.linaAccount.id })).status, 409);
  const accounts = await request(ctx.server).get(`/companies/${ctx.company.id}/game-accounts`).set({ Authorization: `Bearer ${ctx.store.issueToken(ctx.admin.id)}` });
  assert.deepEqual(accounts.body.map((a) => a.username), ['lina.eats']);
  assert.equal(JSON.stringify(accounts.body).match(/token|v1:/i), null);
});
