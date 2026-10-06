const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Games G1: admins build a game on manual points; the public board shows rank,
 * handle and points only; restricted games exist only for their viewers;
 * results freeze once and change only through an audited reopen.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const HOUR = 60 * 60 * 1000;
const POISON = ['REASON-POISON', 'EXCLUDE-POISON', 'Carla', 'createdByUserId', 'byUserId', 'viewers', 'cheater'];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-games-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const user = (role, name, email, companyId = company.id) => store.createUser({
    name, email, password: 'x', role, companyIds: [companyId], companyRoles: [{ companyId, role }],
  });
  const admin = user('Admin', 'Carla Admin', 'carla@peak.test');
  const manager = user('Manager', 'Mo Manager', 'mo@peak.test');
  const otherAdmin = user('Admin', 'Olga', 'olga@other.test', other.id);
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'] });
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const auth = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const session = async (audience, contact, email) => {
    const { token, user: pu } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { headers: { Authorization: `Bearer ${res.body.token}` }, portalUserId: pu.id };
  };
  return { server, store, company, other, admin, manager, otherAdmin, client, lina, session, adminAuth: auth(admin), managerAuth: auth(manager), otherAuth: auth(otherAdmin) };
};

const staff = (ctx, method, p, body, as = ctx.adminAuth) => request(ctx.server)[method](`/companies/${ctx.company.id}/games${p}`).set(as).send(body);

const GAME = (over = {}) => ({
  slug: 'ramadan-challenge', name: 'Ramadan challenge', nameAr: 'تحدي رمضان',
  rules: 'Comment on our posts to earn points.', rulesAr: 'علّق على منشوراتنا لتكسب النقاط.',
  prize: 'A dinner for two', prizeAr: 'عشاء لشخصين', visibility: 'public',
  startsAt: new Date(Date.now() - HOUR).toISOString(), endsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
  ...over,
});

const liveGame = async (ctx, over) => {
  const created = await staff(ctx, 'post', '', GAME(over));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal((await staff(ctx, 'put', `/${id}/metrics`, [{ metricKey: 'manual_points', weight: 1, params: {} }])).status, 200);
  assert.equal((await staff(ctx, 'post', `/${id}/publish`)).status, 200);
  return id;
};
const award = (ctx, id, actor, points, reason = 'REASON-POISON') => staff(ctx, 'post', `/${id}/awards`, { platform: 'instagram', handle: actor, points, reason });

test('only admins of the portal company can build games', async () => {
  const ctx = build();
  assert.equal((await staff(ctx, 'post', '', GAME(), ctx.managerAuth)).status, 403, 'a manager cannot');
  assert.equal((await request(ctx.server).post(`/companies/${ctx.other.id}/games`).set(ctx.otherAuth).send(GAME())).status, 404, 'no games for another company');
  assert.equal((await staff(ctx, 'post', '', GAME({ slug: 'Bad Slug!' }))).status, 400);
  assert.equal((await staff(ctx, 'post', '', GAME({ endsAt: new Date(Date.now() - 2 * HOUR).toISOString() }))).status, 400, 'end before start');
  const created = await staff(ctx, 'post', '', GAME());
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'draft');
  assert.equal((await staff(ctx, 'post', '', GAME())).status, 409, 'slug is unique');
  assert.equal((await staff(ctx, 'post', `/${created.body.id}/publish`)).status, 409, 'a game needs a metric before it is published');
  assert.equal((await staff(ctx, 'put', `/${created.body.id}/metrics`, [{ metricKey: 'comments', weight: 1, params: {} }])).status, 400, 'comments needs a source that supplies comments');
});

test('status follows the clock: scheduled, live, ended', async () => {
  const ctx = build();
  const future = await liveGame(ctx, { slug: 'later', startsAt: new Date(Date.now() + HOUR).toISOString() });
  assert.equal((await staff(ctx, 'get', `/${future}`)).body.status, 'scheduled');
  const live = await liveGame(ctx);
  assert.equal((await staff(ctx, 'get', `/${live}`)).body.status, 'live');
});

test('the public board shows rank, handle and points only, and excluded actors not at all', async () => {
  const ctx = build();
  const id = await liveGame(ctx);
  await award(ctx, id, 'Sara.K', 10);
  await award(ctx, id, 'omar_1', 7);
  await award(ctx, id, 'cheater', 99);
  assert.equal((await staff(ctx, 'post', `/${id}/actor-rules`, { platform: 'instagram', handle: 'cheater', kind: 'disqualify', reason: 'EXCLUDE-POISON' })).status, 201);
  assert.equal((await award(ctx, id, 'x', 1, '')).status, 400, 'an award needs a reason');

  const list = await request(ctx.server).get('/public-api/games');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((g) => g.slug), ['ramadan-challenge']);
  const board = await request(ctx.server).get('/public-api/games/ramadan-challenge');
  assert.equal(board.status, 200);
  assert.match(board.headers['cache-control'], /max-age=60/);
  assert.deepEqual(board.body.board, [
    { rank: 1, platform: 'instagram', handle: 'sara.k', points: 10 },
    { rank: 2, platform: 'instagram', handle: 'omar_1', points: 7 },
  ]);
  assert.equal(board.body.prize, 'A dinner for two');
  assert.deepEqual(board.body.metrics.map((m) => m.key), ['manual_points']);
  const json = JSON.stringify([list.body, board.body]);
  for (const secret of POISON) assert.equal(json.includes(secret), false, `public board leaked ${secret}`);

  const full = await staff(ctx, 'get', `/${id}/scoreboard`);
  assert.ok(full.body.find((r) => r.handle === 'cheater' && r.excluded === 'disqualify'), 'staff still see who was disqualified');
});

test('a restricted game exists only for its viewers', async () => {
  const ctx = build();
  const id = await liveGame(ctx, { slug: 'staff-only', visibility: 'restricted' });
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await request(ctx.server).get('/public-api/games/staff-only')).status, 404);
  assert.deepEqual((await request(ctx.server).get('/public-api/games')).body, []);
  assert.equal((await request(ctx.server).get('/portal-api/client/games/staff-only').set(omar.headers)).status, 404);
  // The picker offers the company's staff and portal users, nobody else.
  const candidates = (await staff(ctx, 'get', `/${id}/viewer-candidates`)).body;
  assert.ok(candidates.portal.some((c) => c.subjectId === lina.portalUserId && c.subjectType === 'portal_user'), JSON.stringify(candidates));
  assert.ok(candidates.staff.length > 0 && candidates.staff.every((c) => c.subjectType === 'user'));
  assert.ok(!JSON.stringify(candidates).includes('passwordHash'), 'names and emails only');
  assert.equal((await staff(ctx, 'put', `/${id}/viewers`, [{ subjectType: 'portal_user', subjectId: lina.portalUserId }])).status, 200);
  assert.equal((await request(ctx.server).get('/portal-api/influencer/games/staff-only').set(lina.headers)).status, 200);
  assert.deepEqual((await request(ctx.server).get('/portal-api/influencer/games').set(lina.headers)).body.map((g) => g.slug), ['staff-only']);
  assert.equal((await request(ctx.server).get('/portal-api/client/games/staff-only').set(omar.headers)).status, 404, 'still not for other portal users');
});

test('drafts and archived games are never public', async () => {
  const ctx = build();
  await staff(ctx, 'post', '', GAME({ slug: 'draft-one' }));
  assert.equal((await request(ctx.server).get('/public-api/games/draft-one')).status, 404);
  const id = await liveGame(ctx);
  assert.equal((await staff(ctx, 'post', `/${id}/archive`)).status, 200);
  assert.equal((await request(ctx.server).get('/public-api/games/ramadan-challenge')).status, 404);
});

test('an ended game freezes once; awards are refused after; reopen is audited', async () => {
  const ctx = build();
  const id = await liveGame(ctx);
  await award(ctx, id, 'sara', 10);
  ctx.store.games.updateGame(id, { endsAt: new Date(Date.now() - 1000).toISOString() });
  const first = await request(ctx.server).get('/public-api/games/ramadan-challenge');
  assert.equal(first.body.status, 'ended');
  assert.equal(first.body.frozen, true);
  assert.equal((await award(ctx, id, 'late', 50)).status, 409, 'no awards after the freeze');
  ctx.store.games.addAward({ gameId: id, actorKey: 'instagram:sneaky', actorHandle: 'sneaky', points: 500, reason: 'direct write', byUserId: ctx.admin.id });
  const again = await request(ctx.server).get('/public-api/games/ramadan-challenge');
  assert.deepEqual(again.body.board, first.body.board, 'frozen results do not change');

  assert.equal((await staff(ctx, 'post', `/${id}/reopen`, { reason: 'x' })).status, 400, 'reopen needs a reason and a new end');
  const reopened = await staff(ctx, 'post', `/${id}/reopen`, { reason: 'A judge found a scoring mistake.', endsAt: new Date(Date.now() + HOUR).toISOString() });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.status, 'live');
  const events = ctx.store.listActivityEvents ? ctx.store.listActivityEvents(ctx.company.id, { entityType: 'game', entityId: id }) : [];
  assert.ok(events.some((e) => e.action === 'reopened' && (e.summary ?? '').includes('scoring mistake')), 'the reopen is in the activity log');
});
