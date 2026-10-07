const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { buildWorkspace } = require('./helpers/workspace');
const { sealToken } = require('../dist/social/crypto');

/** The influencer's public media kit: only what they chose to show, and only once published. */

const setup = async () => {
  const ctx = buildWorkspace();
  const lina = ctx.ws(await ctx.session('influencer', ctx.lina, 'lina@creator.test'));
  const sidr = (await lina.post('/contacts', { name: 'Sidr Coffee', kind: 'brand' })).body;
  const secret = (await lina.post('/contacts', { name: 'Secret Brand', kind: 'brand' })).body;
  const kit = (body) => lina.post('/media-kit', body);
  const publicKit = (slug) => request(ctx.server).get(`/public-api/kit/${slug}`);
  return { ...ctx, linaContact: ctx.lina, lina, sidr, secret, kit, publicKit };
};

test('an influencer saves and publishes a kit; the public page shows only what they chose', async () => {
  const { lina, sidr, kit, publicKit } = await setup();
  const draft = (await lina.get('/media-kit')).body;
  assert.equal(draft.published, false);
  assert.equal(draft.slug, 'lina-haddad', 'a slug is suggested from their name');

  const saved = await kit({
    slug: 'lina-eats', headline: 'Food and coffee in Muscat', bio: 'Reels about where to eat.', contactEmail: 'lina@creator.test',
    featuredContactIds: [sidr.id], manualStats: [{ platform: 'TikTok', handle: '@lina.eats', followers: 52000, engagementRate: 6.1 }],
  });
  assert.equal(saved.status, 200);
  assert.equal((await publicKit('lina-eats')).status, 404, 'not public until published');

  await kit({ published: true });
  const res = await publicKit('lina-eats');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Lina Haddad');
  assert.equal(res.body.headline, 'Food and coffee in Muscat');
  assert.deepEqual(res.body.brands, ['Sidr Coffee']);
  assert.deepEqual(res.body.stats.map((s) => [s.platform, s.followers, s.verified]), [['TikTok', 52000, false]]);
  const json = JSON.stringify(res.body);
  for (const secret of ['Secret Brand', 'amount', 'currency', 'deals', 'ownerContactId', 'companyId']) assert.equal(json.includes(secret), false, `leaked ${secret}`);

  await kit({ published: false });
  assert.equal((await publicKit('lina-eats')).status, 404);
});

test('a slug must be free and well formed', async () => {
  const ctx = await setup();
  const noel = ctx.ws(await ctx.session('influencer', ctx.noel, 'noel@creator.test'));
  await ctx.kit({ slug: 'lina-eats' });
  assert.equal((await noel.post('/media-kit', { slug: 'lina-eats' })).status, 409);
  for (const bad of ['ab', 'Has Spaces', 'emoji-😀', 'x'.repeat(41), '-starts-with-dash']) {
    assert.equal((await ctx.kit({ slug: bad })).status, 400, bad);
  }
});

test("a featured brand must be the influencer's own contact", async () => {
  const ctx = await setup();
  const noel = ctx.ws(await ctx.session('influencer', ctx.noel, 'noel@creator.test'));
  assert.equal((await noel.post('/media-kit', { featuredContactIds: [ctx.sidr.id] })).status, 400);
});

test('verified stats from a connected account replace typed ones for the same platform', async () => {
  const ctx = await setup();
  const account = ctx.store.social.upsertAccount({
    companyId: ctx.company.id, contactId: ctx.linaContact.id, externalId: '1784', username: 'lina.eats', accountType: 'MEDIA_CREATOR',
    tokenSealed: sealToken('fixture-token'), expiresAt: new Date(Date.now() + 864e5 * 30).toISOString(),
  });
  ctx.store.social.addSnapshot({ accountId: account.id, takenOn: '2026-10-06', followers: 184321, views: 0, reach: 0, engagedAccounts: 0, demographics: null });
  await ctx.kit({
    slug: 'lina-eats', published: true,
    manualStats: [{ platform: 'Instagram', handle: '@lina.eats', followers: 999999 }, { platform: 'TikTok', handle: '@lina.eats', followers: 52000 }],
  });
  const stats = (await ctx.publicKit('lina-eats')).body.stats;
  assert.deepEqual(stats.map((s) => [s.platform, s.followers, s.verified, s.asOf]), [
    ['Instagram', 184321, true, '2026-10-06'],
    ['TikTok', 52000, false, null],
  ]);
});
