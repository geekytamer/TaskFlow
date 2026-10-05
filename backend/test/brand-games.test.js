const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Brand games report: staff link a game to a client; that client's portal users
 * read an allow-listed report of it. Nothing about moderation, data gaps or
 * staff ever reaches them.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-brand-games-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const user = (role, name, email, companyId = company.id) => store.createUser({
    name, email, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }],
  });
  const admin = user('Admin', 'Carla Admin', 'carla@peak.test');
  const manager = user('Manager', 'Mo Manager', 'mo@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'] });
  const foreign = store.createContact({ companyId: other.id, kind: 'Organization', name: 'Elsewhere', roles: ['Client'] });
  const rendered = [];
  const pdf = {
    invoice: async () => Buffer.from('%PDF-invoice'),
    html: async (html) => { rendered.push(html); return Buffer.from('%PDF-html'); },
  };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), portalPdf: pdf,
  }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const session = async (contact, email, audience = 'client') => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, company, admin, manager, client, rival, lina, foreign, session, rendered, adminAuth: auth(admin), managerAuth: auth(manager) };
};

const staff = (ctx, method, p, body, as = ctx.adminAuth) => request(ctx.server)[method](`/companies/${ctx.company.id}/games${p}`).set(as).send(body);

const GAME = (over = {}) => ({
  slug: 'ramadan-challenge', name: 'Ramadan challenge', nameAr: 'تحدي رمضان',
  rules: 'Comment to earn points.', prize: 'Dinner', visibility: 'restricted',
  startsAt: new Date(Date.now() - 3 * DAY).toISOString(), endsAt: new Date(Date.now() + 2 * DAY).toISOString(),
  ...over,
});

const createGame = async (ctx, over) => {
  const created = await staff(ctx, 'post', '', GAME(over));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.id;
};

test('staff link a game to a client, and only to one of this company\'s clients', async () => {
  const ctx = build();
  const id = await createGame(ctx);
  const link = (contactId, as) => staff(ctx, 'put', `/${id}/client`, { contactId }, as);

  assert.equal((await link(ctx.client.id, ctx.managerAuth)).status, 403, 'a manager cannot');
  assert.equal((await link(ctx.lina.id)).status, 400, 'an influencer is not a client');
  assert.equal((await link(ctx.foreign.id)).status, 400, 'another company\'s client');
  assert.equal((await link('nope')).status, 400, 'unknown contact');

  const linked = await link(ctx.client.id);
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  const read = await staff(ctx, 'get', `/${id}`);
  assert.equal(read.body.clientContactId, ctx.client.id);
  assert.equal(read.body.clientName, 'Al Noor Dates');

  assert.equal((await link(null)).status, 200);
  const unlinked = await staff(ctx, 'get', `/${id}`);
  assert.equal(unlinked.body.clientContactId, null);
  assert.equal(unlinked.body.clientName, null);
});

test('a frozen game can still be linked: it changes who reads, not the results', async () => {
  const ctx = build();
  const id = await createGame(ctx, { startsAt: new Date(Date.now() - 3 * DAY).toISOString(), endsAt: new Date(Date.now() - DAY).toISOString() });
  assert.equal((await staff(ctx, 'put', `/${id}/metrics`, [{ metricKey: 'manual_points', weight: 1, params: {} }])).status, 200);
  assert.equal((await staff(ctx, 'post', `/${id}/publish`)).status, 200);
  const read = await staff(ctx, 'get', `/${id}`);
  assert.ok(read.body.frozenAt, 'ended games freeze when read');
  assert.equal((await staff(ctx, 'put', `/${id}/client`, { contactId: ctx.client.id })).status, 200);
});


// A live followers game for Al Noor with collected interactions, an excluded
// actor and planted values that must never reach the brand.
const liveBrandGame = async (ctx, over = {}) => {
  const id = await createGame(ctx, over);
  const { store } = ctx;
  const post = store.games.addSource({ gameId: id, kind: 'post', accountId: 'ACC-POISON', mediaId: 'm1', permalink: 'https://www.instagram.com/p/game1/' });
  const tags = store.games.addSource({ gameId: id, kind: 'tags', accountId: 'ACC-POISON', mediaId: '', permalink: null });
  const likes = store.games.addSource({ gameId: id, kind: 'import', accountId: '', mediaId: 'likers1', permalink: 'https://www.instagram.com/p/game2/' });
  store.games.updateSource(post.id, { lastError: 'LASTERROR-POISON', likersMissed: 31337, likersWindow: 4242 });
  const at = (daysAgo, h = 0) => new Date(Date.now() - daysAgo * DAY - h * HOUR).toISOString();
  const ev = (externalId, handle, action, occurredAt, textHash = externalId) => ({ externalId, actorKey: `instagram:${handle}`, actorHandle: handle, action, postRef: 'm1', occurredAt, textLength: 20, textHash });
  const now = new Date().toISOString();
  store.games.syncSourceEvents(id, post.id, [
    ev('c1', 'noor.m', 'comment', at(2)),
    ev('c2', 'noor.m', 'reply', at(1)),
    ev('c3', 'ahmed_88', 'comment', at(1)),
    ev('c4', 'bot_ring1', 'comment', at(1), 'same'),
    ev('c5', 'fatma.s', 'comment', at(0, 1)),
  ], now);
  // c5 disappears on the next full read: removed comments never count.
  store.games.syncSourceEvents(id, post.id, [
    ev('c1', 'noor.m', 'comment', at(2)), ev('c2', 'noor.m', 'reply', at(1)), ev('c3', 'ahmed_88', 'comment', at(1)), ev('c4', 'bot_ring1', 'comment', at(1), 'same'),
  ], now);
  store.games.syncSourceEvents(id, tags.id, [ev('t1', 'ahmed_88', 'mention', at(1))], now);
  store.games.syncSourceEvents(id, likes.id, [ev('l1', 'noor.m', 'like', at(2)), ev('l2', 'bot_ring1', 'like', at(2))], now);
  assert.equal((await staff(ctx, 'put', `/${id}/metrics`, [{ metricKey: 'weighted_interactions', weight: 1, params: {} }])).status, 200);
  assert.equal((await staff(ctx, 'post', `/${id}/publish`)).status, 200);
  assert.equal((await staff(ctx, 'post', `/${id}/actor-rules`, { platform: 'instagram', handle: 'bot_ring1', kind: 'exclude', reason: 'EXCLUDE-REASON-POISON' })).status, 201);
  assert.equal((await staff(ctx, 'put', `/${id}/client`, { contactId: ctx.client.id })).status, 200);
  return id;
};

const POISON = ['EXCLUDE-REASON-POISON', 'AWARD-REASON-POISON', 'Carla', 'same_text', 'burst', 'likersMissed', 'likersWindow', '31337', '4242',
  'LASTERROR-POISON', 'ACC-POISON', 'bot_ring1', 'createdByUserId', 'byUserId', 'excluded', 'viewers', 'accountId'];
const noPoison = (body, where) => {
  const json = JSON.stringify(body);
  for (const secret of POISON) assert.equal(json.includes(secret), false, `${where} leaked ${secret}`);
};

test('a linked client sees its game and report without being a viewer', async () => {
  const ctx = build();
  await liveBrandGame(ctx);
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const list = await request(ctx.server).get('/portal-api/client/brand-games').set(huda);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((g) => g.slug), ['ramadan-challenge']);
  assert.equal(list.body[0].status, 'live');
  assert.equal(list.body[0].players, 2);
  const detail = await request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge').set(huda);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.game.name, 'Ramadan challenge');
  assert.equal((await request(ctx.server).get('/portal-api/client/games/ramadan-challenge').set(huda)).status, 200, 'the lobby page opens too');
  noPoison(list.body, 'list');
  noPoison(detail.body, 'detail');
});

test('totals and the daily series leave out removed events and excluded actors', async () => {
  const ctx = build();
  await liveBrandGame(ctx);
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const { body } = await request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge').set(huda);
  assert.deepEqual(body.totals, { comments: 2, replies: 1, tags: 1, likes: 1 });
  const sum = (k) => body.daily.reduce((s, d) => s + d[k], 0);
  assert.deepEqual({ comments: sum('comments'), replies: sum('replies'), tags: sum('tags'), likes: sum('likes') }, body.totals);
  assert.ok(body.daily.length >= 3, 'one row per day from the start');
  assert.match(body.daily[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(body.posts, [{ url: 'https://www.instagram.com/p/game1/', kind: 'comment' }, { url: 'https://www.instagram.com/p/game2/', kind: 'like' }]);
});

test('top fans match the public board, and winners appear only once results freeze', async () => {
  const ctx = build();
  const id = await liveBrandGame(ctx);
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const live = await request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge').set(huda);
  const board = await request(ctx.server).get('/portal-api/client/games/ramadan-challenge').set(huda);
  assert.deepEqual(live.body.topFans, board.body.board.slice(0, 10).map(({ rank, handle, points }) => ({ rank, handle, points })));
  assert.equal(live.body.winners, null);
  assert.equal(live.body.game.frozen, false);

  ctx.store.games.updateGame(id, { endsAt: new Date(Date.now() - HOUR).toISOString(), reconciledAt: new Date().toISOString() });
  const ended = await request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge').set(huda);
  assert.equal(ended.body.game.status, 'ended');
  assert.equal(ended.body.game.frozen, true);
  assert.deepEqual(ended.body.winners, ended.body.topFans.slice(0, 3));
  noPoison(ended.body, 'ended detail');
});

test('another client, drafts and archived games answer 404', async () => {
  const ctx = build();
  const id = await liveBrandGame(ctx);
  const draft = await createGame(ctx, { slug: 'draft-one' });
  await staff(ctx, 'put', `/${draft}/client`, { contactId: ctx.client.id });
  const rival = await ctx.session(ctx.rival, 'sam@sidr.test');
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const lina = await ctx.session(ctx.lina, 'lina@creator.test', 'influencer');
  assert.equal((await request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge').set(rival)).status, 404);
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/brand-games').set(rival)).body, []);
  assert.equal((await request(ctx.server).get('/portal-api/client/games/ramadan-challenge').set(rival)).status, 404, 'restricted stays hidden from other clients');
  assert.equal((await request(ctx.server).get('/portal-api/client/brand-games/draft-one').set(huda)).status, 404, 'drafts are not shown');
  assert.equal((await request(ctx.server).get('/portal-api/influencer/brand-games').set(lina)).status, 404, 'influencers have no brand reports');
  assert.equal((await staff(ctx, 'post', `/${id}/archive`)).status, 200);
  assert.equal((await request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge').set(huda)).status, 404, 'archived');
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/brand-games').set(huda)).body, []);
});

test('a game nobody has played yet reports zeros, not errors', async () => {
  const ctx = build();
  const id = await createGame(ctx, { slug: 'quiet' });
  ctx.store.games.addSource({ gameId: id, kind: 'post', accountId: 'a', mediaId: 'm', permalink: 'https://www.instagram.com/p/q/' });
  await staff(ctx, 'put', `/${id}/metrics`, [{ metricKey: 'comments', weight: 1, params: {} }]);
  await staff(ctx, 'post', `/${id}/publish`);
  await staff(ctx, 'put', `/${id}/client`, { contactId: ctx.client.id });
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const { status, body } = await request(ctx.server).get('/portal-api/client/brand-games/quiet').set(huda);
  assert.equal(status, 200);
  assert.equal(body.players, 0);
  assert.deepEqual(body.totals, { comments: 0, replies: 0, tags: 0, likes: 0 });
  assert.deepEqual(body.topFans, []);
  assert.ok(body.daily.every((d) => d.comments === 0 && d.likes === 0));
});

test('results CSV neutralises spreadsheet formulas and starts with a BOM', () => {
  const { resultsCsv } = require('../dist/games/brand-report-doc');
  const csv = resultsCsv([{ rank: 1, handle: '=cmd', points: 12.5 }, { rank: 2, handle: 'noor.m', points: 3 }]);
  assert.equal(csv, '﻿rank,handle,points\r\n1,\'=cmd,12.5\r\n2,noor.m,3\r\n');
});

test('CSV and PDF exist only once results are final, and only for the brand', async () => {
  const ctx = build();
  const id = await liveBrandGame(ctx);
  ctx.store.games.updateGame(id, { name: 'Ramadan <b>challenge</b>' });
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const rival = await ctx.session(ctx.rival, 'sam@sidr.test');
  const csv = (as) => request(ctx.server).get('/portal-api/client/brand-games/ramadan-challenge/results.csv').set(as);
  const pdf = (as, lang = 'en') => request(ctx.server).get(`/portal-api/client/brand-games/ramadan-challenge/summary.pdf?lang=${lang}`).set(as);
  assert.equal((await csv(huda)).status, 409, 'not before the end');
  assert.equal((await pdf(huda)).status, 409);

  ctx.store.games.updateGame(id, { endsAt: new Date(Date.now() - HOUR).toISOString(), reconciledAt: new Date().toISOString() });
  const file = await csv(huda);
  assert.equal(file.status, 200);
  assert.match(file.headers['content-type'], /text\/csv/);
  assert.match(file.headers['content-disposition'], /attachment; filename="ramadan-challenge-results\.csv"/);
  assert.ok(file.text.startsWith('﻿rank,handle,points\r\n1,'));
  assert.ok(!file.text.includes('bot_ring1'));

  const doc = await pdf(huda, 'ar');
  assert.equal(doc.status, 200);
  assert.equal(doc.headers['content-type'], 'application/pdf');
  const html = ctx.rendered[ctx.rendered.length - 1];
  assert.ok(html.includes('Ramadan &lt;b&gt;challenge&lt;/b&gt;') || html.includes('تحدي رمضان'), 'name escaped or Arabic name');
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(!html.includes('<b>challenge'), 'no raw markup');
  noPoison(html, 'pdf html');

  assert.equal((await csv(rival)).status, 404);
  assert.equal((await pdf(rival)).status, 404);
});
