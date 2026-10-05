const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { FixtureMetaClient } = require('../dist/social/meta-client');
const { sealToken } = require('../dist/social/crypto');
const { discoverPosts, tickLikersSource, trackGames, nextInterval, requestSize, PACING } = require('../dist/games/tracker');
const { ensureFrozen, boardOf } = require('../dist/games/games');
const { WorkerLikersFetcher, ApifyLikersFetcher, likersFetcherFromEnv } = require('../dist/games/likers-fetcher');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Live tracking: posts on tracked accounts become sources by themselves, and
 * likers are fetched at a pace set by like speed so that a small window still
 * sees every liker, in order — the first N are secured, and what pacing could
 * not see is reported, not hidden.
 */

const quiet = { info() {}, warn() {}, error() {} };
const MIN = 60_000;
const FIXTURES = path.join(__dirname, 'fixtures', 'meta');
// A fixed minute in the near future, so a game built around it is live whatever day the suite runs.
const T0 = Math.ceil((Date.now() + 24 * 60 * 60000) / 60000) * 60000;

/** A post's likes over time, and a Meta + fetcher pair that only see what has happened by `clock.now`. */
const world = ({ perMinute, window = 100, likers = 3000, startAfter = 0 }) => {
  const clock = { now: T0 };
  const likes = Array.from({ length: likers }, (_, i) => ({ // Scrambled names, so alphabetical order can never pass for like order.
    handle: `fan${((i * 7919) % 10007).toString(36)}x${i}`, at: T0 + startAfter + Math.floor((i * MIN) / perMinute) }));
  const sofar = () => likes.filter((l) => l.at <= clock.now);
  const meta = new FixtureMetaClient(FIXTURES);
  meta.posts = [];
  meta.recentMedia = async (_t, _u, since) => meta.posts.filter((p) => p.timestamp >= since);
  meta.mediaCounts = async () => ({ likes: sofar().length, comments: 0 });
  const calls = [];
  const fetcher = {
    async fetch(permalink, max) {
      calls.push({ at: clock.now, max });
      return { handles: sofar().reverse().slice(0, Math.min(max, window)).map((l) => l.handle), complete: false };
    },
  };
  return { clock, likes, meta, fetcher, calls };
};

const build = (w) => {
  const dbPath = path.join(makeTmpDir('taskflow-tracking-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const admin = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Admin', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Admin' }] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'] });
  const account = store.social.upsertAccount({
    companyId: company.id, contactId: lina.id, externalId: '1784-lina', username: 'lina.eats', accountType: 'MEDIA_CREATOR',
    tokenSealed: sealToken('tok'), expiresAt: new Date(T0 + 50 * 86400_000).toISOString(),
  });
  const game = store.games.create({
    companyId: company.id, slug: 'first-100', name: 'First 100', nameAr: null, rules: null, rulesAr: null, prize: null, prizeAr: null,
    visibility: 'public', tag: '#AlNoor100', startsAt: new Date(T0 - 60 * MIN).toISOString(), endsAt: new Date(T0 + 120 * MIN).toISOString(), createdByUserId: admin.id,
  });
  store.games.updateGame(game.id, { publishedAt: new Date(T0 - 60 * MIN).toISOString() });
  store.games.setMetrics(game.id, [{ metricKey: 'first_likers', weight: 1, params: { n: 100, pointsFirst: 10, pointsLast: 1 } }]);
  store.games.setTrackedAccounts(game.id, [account.id]);
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy', portalCompanyId: company.id,
    sendPortalInvite: async () => ({ sent: true }), likersFetcher: w?.fetcher,
    social: { client: w?.meta ?? new FixtureMetaClient(FIXTURES), appSecret: 's', redirectUri: 'https://x/cb', portalReturnUrl: 'https://x/profile' },
  }).listen(0);
  server.unref();
  const staff = (method, p, body) => request(server)[method](`/companies/${company.id}/games${p}`).set({ Authorization: `Bearer ${store.issueToken(admin.id)}` }).send(body);
  return { store, company, game: store.games.get(game.id), account, server, staff };
};

const post = (id, minutes, caption = 'Like to win #AlNoor100') => ({ id, permalink: `https://www.instagram.com/p/${id}/`, timestamp: new Date(T0 + minutes * MIN), caption });

/** Runs the minute sweep from now to `until` minutes after T0. */
const run = async (ctx, w, untilMinutes) => {
  for (; w.clock.now <= T0 + untilMinutes * MIN; w.clock.now += MIN) {
    await trackGames(ctx.store, w.meta, w.fetcher, ctx.company.id, new Date(w.clock.now));
  }
};

test('a tracked account’s new post with the game tag becomes a comments and a paced likers source by itself', async () => {
  const w = world({ perMinute: 1 });
  const ctx = build(w);
  w.meta.posts = [post('GAME1', 0), post('OTHER', 1, 'Morning coffee'), post('OLD', -90)];
  w.clock.now = T0 + 2 * MIN;
  assert.equal(await discoverPosts(ctx.store, w.meta, ctx.game, new Date(w.clock.now)), 1);
  assert.equal(await discoverPosts(ctx.store, w.meta, ctx.game, new Date(w.clock.now)), 0, 'once');
  const sources = ctx.store.games.sources(ctx.game.id);
  assert.deepEqual(sources.map((s) => [s.kind, s.autoAdded, Boolean(s.metaMediaId)]), [['post', 1, false], ['import', 1, true]]);
  assert.equal(sources[1].metaMediaId, 'GAME1');
});

test('pacing keeps a 100-liker window ahead of 20 likes a minute: every liker seen, first 100 in true order, nothing missed', async () => {
  const w = world({ perMinute: 20, window: 100 });
  const ctx = build(w);
  w.meta.posts = [post('GAME1', 0)];
  await run(ctx, w, 60);
  const src = ctx.store.games.sources(ctx.game.id).find((s) => s.kind === 'import');
  const liked = w.likes.filter((l) => l.at <= w.clock.now - MIN).length;
  assert.equal(ctx.store.games.events(ctx.game.id).length, liked, 'every liker so far');
  assert.equal(src.likersMissed, 0);
  const board = boardOf(ctx.store, ctx.store.games.get(ctx.game.id));
  assert.deepEqual(board.slice(0, 100).map((r) => r.handle), w.likes.slice(0, 100).map((l) => l.handle), 'first 100 in the order they liked');
  assert.equal(board[0].points, 10);
  assert.equal(board[99].points, 1);
  // About one fetch every 2.5 minutes, not one a minute.
  assert.ok(w.calls.length < 35, `${w.calls.length} fetches`);
});

test('when likes outrun the window, the shortfall is reported; quiet posts are only checked, not fetched', async () => {
  const w = world({ perMinute: 400, window: 100 });
  const ctx = build(w);
  w.meta.posts = [post('GAME1', 0)];
  await run(ctx, w, 5);
  const src = ctx.store.games.sources(ctx.game.id).find((s) => s.kind === 'import');
  assert.ok(src.likersMissed > 500, `missed ${src.likersMissed}`);

  const calm = world({ perMinute: 1, likers: 3 });
  const ctx2 = build(calm);
  calm.meta.posts = [post('GAME1', 0)];
  await run(ctx2, calm, 40);
  assert.ok(calm.calls.length <= 5, `${calm.calls.length} fetches for 3 likes`);
  assert.equal(ctx2.store.games.events(ctx2.game.id).length, 3);
});

test('results wait for the likers fetch after the end; a quiet post is final at its first check after the end', async () => {
  const w = world({ perMinute: 2, likers: 50 });
  const ctx = build(w);
  w.meta.posts = [post('GAME1', 0)];
  await run(ctx, w, 119);
  ctx.store.games.updateGame(ctx.game.id, { reconciledAt: new Date(w.clock.now).toISOString() });
  const ended = ctx.store.games.get(ctx.game.id);
  assert.equal(ensureFrozen(ctx.store, ended, T0 + 121 * MIN).frozenAt, null, 'waits for the final likers check');
  await run(ctx, w, 135);
  assert.ok(ensureFrozen(ctx.store, ctx.store.games.get(ctx.game.id), w.clock.now).frozenAt);
});

test('pacing rules', () => {
  assert.equal(nextInterval(0, 10 * MIN, 100), PACING.idleIntervalMs);
  assert.equal(nextInterval(20 * 5, 5 * MIN, 100), 2.5 * MIN, '20/min with a 100 window: every 2.5 minutes');
  assert.equal(nextInterval(10000, MIN, 100), PACING.minIntervalMs);
  assert.equal(nextInterval(1, 60 * MIN, 1000), PACING.maxIntervalMs);
  assert.equal(requestSize(10, false), 50);
  assert.equal(requestSize(400, false), 520);
  assert.equal(requestSize(5, true), 1000, 'the first fetch reaches as far back as it can');
});

test('staff choose tracked accounts, fetch now, and a pasted list adds to a paced one', async () => {
  const w = world({ perMinute: 10, likers: 30 });
  const ctx = build(w);
  assert.equal((await ctx.staff('put', `/${ctx.game.id}/tracked-accounts`, ['nope'])).status, 400);
  const set = await ctx.staff('put', `/${ctx.game.id}/tracked-accounts`, [ctx.account.id]);
  assert.deepEqual([set.status, set.body.trackedAccounts, set.body.likersFetcher], [200, [ctx.account.id], true]);
  w.meta.posts = [post('GAME1', 0)];
  w.clock.now = T0 + 10 * MIN;
  await discoverPosts(ctx.store, w.meta, ctx.store.games.get(ctx.game.id), new Date(w.clock.now));
  const src = ctx.store.games.sources(ctx.game.id).find((s) => s.kind === 'import');
  const fetched = await ctx.staff('post', `/${ctx.game.id}/sources/${src.id}/fetch-likers`);
  assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
  assert.equal(fetched.body.sources.find((s) => s.id === src.id).interactions, 30);
  const pasted = await ctx.staff('post', `/${ctx.game.id}/sources/${src.id}/likers`, { text: 'late_fan' });
  assert.deepEqual([pasted.body.imported.added, pasted.body.imported.removed], [1, 0], 'nothing fetched is removed');
});

test('fetchers: the worker gets a bearer secret, Apify results are ordered by position, the environment picks one', async () => {
  const seen = [];
  const http = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => (url.includes('apify') ? [{ username: 'B', position: 2 }, { username: '@a', position: 1 }, { username: 'bad name', position: 3 }] : { handles: ['X', 'x', 'y'], complete: true }) }; };
  const worker = await new WorkerLikersFetcher('https://likers.internal/run', 'shh', http).fetch('https://www.instagram.com/p/A/', 100);
  assert.deepEqual(worker, { handles: ['x', 'y'], complete: true });
  assert.equal(seen[0].init.headers.Authorization, 'Bearer shh');
  const apify = await new ApifyLikersFetcher('tok', 'peak/likers', http).fetch('https://www.instagram.com/p/A/', 100);
  assert.deepEqual(apify, { handles: ['a', 'b'], complete: false });
  assert.match(seen[1].url, /acts\/peak~likers\/run-sync-get-dataset-items/);
  assert.equal(likersFetcherFromEnv({}), undefined);
  assert.ok(likersFetcherFromEnv({ LIKERS_WORKER_URL: 'u', LIKERS_WORKER_SECRET: 's', APIFY_TOKEN: 't', APIFY_LIKERS_ACTOR: 'a' }) instanceof WorkerLikersFetcher, 'own worker first');
});
