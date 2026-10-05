const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Analytics in both portals. A client reads verified results of its own
 * campaigns and what it paid for them; an influencer reads its own account,
 * posts and payouts. Neither ever sees rates, costs or anyone else's figures.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const DAY = 24 * 60 * 60 * 1000;
// Decimal poison values: a UUID has no dots, so none of these can appear by chance.
const POISON = ['33333.19', '22222.73', '11111.37', '98765.43', '5555.55', 'NOTE-POISON', 'agreedRate', 'rateCardAmount', 'budget', 'ownerUserId', 'Sidr Honey', '424242'];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-analytics-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], notes: 'NOTE-POISON' });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const influencer = (name, handle) => store.createContact({
    companyId: company.id, kind: 'Person', name, roles: ['Influencer', 'Vendor'], rateCardAmount: 5555.55, notes: 'NOTE-POISON',
    influencerAccounts: [{ id: handle, platform: 'Instagram', handle: `@${handle}` }],
  });
  const lina = influencer('Lina Haddad', 'lina.eats');
  const omar = influencer('Omar Balushi', 'omar.roams');
  const maybe = influencer('Not Confirmed', 'maybe');

  const campaign = (contact, name, extra = {}) => store.createCrmCampaign({
    companyId: company.id, contactId: contact.id, name, status: 'Active', visibility: 'Public', budget: 98765.43, notes: 'NOTE-POISON', ...extra,
  });
  const ramadan = campaign(client, 'Ramadan launch');
  const summer = campaign(client, 'Summer box');
  const honey = campaign(rival, 'Honey week');
  const confirm = (c, who, status = 'Confirmed') => store.createCampaignAssignment({ companyId: company.id, campaignId: c.id, contactId: who.id, role: 'Influencer', agreedRate: 33333.19, status, notes: 'NOTE-POISON' });
  confirm(ramadan, lina); confirm(ramadan, omar); confirm(summer, lina); confirm(ramadan, maybe, 'Planned'); confirm(honey, omar);

  const post = (c, who, title, platform, daysAgo, figures, checkpoints = ['24h', '7d']) => {
    const d = store.createCampaignDeliverable({
      companyId: company.id, campaignId: c.id, title, platform, status: 'Published', fulfillment: 'External', vendorContactId: who.id,
      price: 11111.37, cost: 22222.73, notes: 'NOTE-POISON', contentUrl: `https://www.instagram.com/p/${title.replace(/\W/g, '')}/`,
      publishedAt: new Date(Date.now() - daysAgo * DAY),
    });
    checkpoints.forEach((checkpoint, i) => store.social.addMediaResult({
      deliverableId: d.id, accountId: 'acc', mediaId: `m-${d.id}`, checkpoint,
      // Later checkpoints are larger; only the latest counts.
      views: figures.views * (i + 1) / checkpoints.length, likes: figures.likes, comments: figures.comments, saves: figures.saves, shares: figures.shares,
      fetchedAt: new Date().toISOString(),
    }));
    return d;
  };
  post(ramadan, lina, 'Iftar reel', 'Instagram', 5, { views: 10000, likes: 400, comments: 50, saves: 30, shares: 20 });
  post(ramadan, omar, 'Desert reel', 'TikTok', 12, { views: 30000, likes: 900, comments: 100, saves: 0, shares: 0 });
  post(ramadan, maybe, 'Unconfirmed post', 'Instagram', 6, { views: 1000, likes: 10, comments: 0, saves: 0, shares: 0 });
  post(summer, lina, 'Old post', 'Instagram', 200, { views: 5000, likes: 100, comments: 10, saves: 5, shares: 5 });
  post(honey, omar, 'Honey reel', 'Instagram', 3, { views: 424242, likes: 1, comments: 1, saves: 1, shares: 1 });
  // Published but no verified results: counted nowhere.
  store.createCampaignDeliverable({ companyId: company.id, campaignId: ramadan.id, title: 'No results', platform: 'Instagram', status: 'Published', vendorContactId: lina.id, publishedAt: new Date(Date.now() - DAY) });

  const invoice = (contact, c, total, currency = 'USD', extra = {}) => store.createInvoice({
    companyId: company.id, clientId: contact.id, contactId: contact.id, campaignId: c?.id,
    issueDate: new Date(Date.now() - 10 * DAY), dueDate: new Date(Date.now() + 20 * DAY), status: 'Sent', total, currency,
    lineItems: [{ description: 'Campaign', quantity: 1, unitPrice: total, amount: total, itemType: 'Manual' }], ...extra,
  });
  invoice(client, ramadan, 4100);
  invoice(client, ramadan, 900);
  invoice(client, ramadan, 7777, 'USD', { status: 'Draft' });
  invoice(rival, honey, 3000);

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const session = async (contact, email, audience = 'client') => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, company, client, rival, lina, omar, ramadan, summer, honey, session };
};

const noPoison = (body, where) => {
  const json = JSON.stringify(body);
  for (const secret of POISON) assert.equal(json.includes(secret), false, `${where} leaked ${secret}`);
};

test('client analytics: totals from the latest verified result of each own post', async () => {
  const ctx = build();
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const res = await request(ctx.server).get('/portal-api/client/analytics').set(huda);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const t = res.body.totals;
  assert.deepEqual({ posts: t.posts, views: t.views, likes: t.likes, comments: t.comments, saves: t.saves, shares: t.shares }, {
    posts: 4, views: 46000, likes: 1410, comments: 160, saves: 35, shares: 25,
  });
  assert.equal(t.engagements, 1410 + 160 + 35 + 25);
  assert.equal(t.perView, Number(((1410 + 160 + 35 + 25) / 46000).toFixed(4)));
  assert.deepEqual(res.body.campaigns.map((c) => c.name).sort(), ['Ramadan launch', 'Summer box']);
  noPoison(res.body, 'client analytics');
});

test('client analytics: date range and campaign filters', async () => {
  const ctx = build();
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const day = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  const ranged = await request(ctx.server).get(`/portal-api/client/analytics?from=${day(30)}&to=${day(0)}`).set(huda);
  assert.equal(ranged.body.totals.posts, 3, 'the 200-day-old post is outside the range');
  assert.equal(ranged.body.range.from, day(30));
  const one = await request(ctx.server).get(`/portal-api/client/analytics?campaign=${ctx.summer.id}`).set(huda);
  assert.equal(one.body.totals.posts, 1);
  const theirs = await request(ctx.server).get(`/portal-api/client/analytics?campaign=${ctx.honey.id}`).set(huda);
  assert.equal(theirs.body.totals, null, 'another client\'s campaign is never counted');
  assert.equal((await request(ctx.server).get('/portal-api/client/analytics?from=yesterday').set(huda)).status, 400);
  assert.ok(ranged.body.weekly.every((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.week)));
  assert.equal(ranged.body.weekly.reduce((s, w) => s + w.views, 0), 41000);
});

test('client analytics: by creator names only confirmed creators and carries no money', async () => {
  const ctx = build();
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const { body } = await request(ctx.server).get('/portal-api/client/analytics').set(huda);
  const names = body.byCreator.map((c) => c.name);
  assert.deepEqual(names, ['Omar Balushi', 'Lina Haddad'], 'sorted by views; unconfirmed creator left out');
  assert.deepEqual(Object.keys(body.byCreator[0]).sort(), ['engagements', 'handle', 'name', 'perView', 'posts', 'views']);
  assert.equal(body.byCreator[0].handle, '@omar.roams');
  assert.deepEqual(body.byPlatform.map((p) => p.platform), ['TikTok', 'Instagram']);
});

test('client analytics: cost per result from the client\'s own sent invoices, per currency', async () => {
  const ctx = build();
  const huda = await ctx.session(ctx.client, 'huda@alnoor.test');
  const { body } = await request(ctx.server).get('/portal-api/client/analytics').set(huda);
  const ramadan = body.byCampaign.find((c) => c.name === 'Ramadan launch');
  assert.deepEqual(ramadan.cost, [{ currency: 'USD', invoiced: 5000, perThousandViews: Number((5000 / 41000 * 1000).toFixed(2)), perEngagement: Number((5000 / (1300 + 150 + 30 + 20 + 10)).toFixed(2)) }]);
  const summer = body.byCampaign.find((c) => c.name === 'Summer box');
  assert.deepEqual(summer.cost, [], 'no invoices: no cost');
});

test('client analytics: a client with nothing published gets empty answers', async () => {
  const ctx = build();
  const quiet2 = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Quiet Co', roles: ['Client'] });
  const q = await ctx.session(quiet2, 'q@quiet.test');
  const { status, body } = await request(ctx.server).get('/portal-api/client/analytics').set(q);
  assert.equal(status, 200);
  assert.equal(body.totals, null);
  assert.deepEqual([body.weekly, body.byCreator, body.byPlatform, body.byCampaign], [[], [], [], []]);
});

const buildInfluencer = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-analytics-inf-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const supplier = store.createSupplier({ companyId: company.id, name: 'Lina Haddad Trading', isActive: true });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'], supplierId: supplier.id, rateCardAmount: 5555.55 });
  const rival = store.createContact({ companyId: company.id, kind: 'Person', name: 'Rival', roles: ['Influencer', 'Vendor'] });
  const quiet3 = store.createContact({ companyId: company.id, kind: 'Person', name: 'No Account', roles: ['Influencer'] });
  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', visibility: 'Public', budget: 98765.43 });
  [lina, rival].forEach((c) => store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: c.id, role: 'Influencer', status: 'Confirmed', agreedRate: 33333.19 }));
  const deliverable = (who, title, cost, daysAgo) => store.createCampaignDeliverable({
    companyId: company.id, campaignId: campaign.id, title, status: 'Published', fulfillment: 'External', vendorContactId: who.id,
    cost, price: 11111.37, publishedAt: new Date(Date.now() - daysAgo * DAY), contentUrl: `https://www.instagram.com/p/${title.replace(/\W/g, '')}/`,
  });
  const reel = deliverable(lina, 'Iftar reel', 1500, 10);
  const story = deliverable(lina, 'Story', 400, 2);
  const rivalReel = deliverable(rival, 'Rival reel', 777, 3);
  const result = (d, checkpoint, views) => store.social.addMediaResult({ deliverableId: d.id, accountId: 'acc', mediaId: `m-${d.id}`, checkpoint, views, likes: views / 10, comments: 5, saves: 2, shares: 1, fetchedAt: new Date().toISOString() });
  result(reel, '24h', 4000); result(reel, '7d', 9000); result(story, '24h', 2000); result(rivalReel, '24h', 424242);
  store.generateCampaignVendorBills(company.id, campaign.id);
  const billOf = (d) => store.listCampaignDeliverables(campaign.id).find((x) => x.id === d.id).vendorBillId;
  store.updateVendorBillStatus(billOf(reel), 'Approved');
  store.createVendorBillPayment({ billId: billOf(reel), amount: 1500, paidAt: new Date(), method: 'Bank Transfer' });
  store.createInvoice({ companyId: company.id, clientId: client.id, contactId: client.id, campaignId: campaign.id, issueDate: new Date(), dueDate: new Date(), status: 'Sent', total: 7777.77,
    lineItems: [{ description: 'Campaign', quantity: 1, unitPrice: 7777.77, amount: 7777.77, itemType: 'Manual' }] });

  const account = (contact, username) => store.social.upsertAccount({ companyId: company.id, contactId: contact.id, externalId: `ext-${username}`, username, accountType: 'MEDIA_CREATOR', tokenSealed: 'v1:x', expiresAt: null });
  const mine = account(lina, 'lina.eats');
  const theirs = account(rival, 'rival');
  const demographics = { country: { OM: 0.6, AE: 0.3 }, age: { '18-24': 0.4, '25-34': 0.5 }, gender: { F: 0.7, M: 0.3 } };
  const day = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  [[20, 1000], [10, 1100], [1, 1250]].forEach(([n, followers]) => store.social.addSnapshot({ accountId: mine.id, takenOn: day(n), followers, views: followers * 3, reach: followers * 2, engagedAccounts: followers / 10, demographics: n === 1 ? demographics : null }));
  store.social.addSnapshot({ accountId: theirs.id, takenOn: day(1), followers: 424242, views: 1, reach: 1, engagedAccounts: 1, demographics: null });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();
  const session = async (contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'influencer', contactId: contact.id, email, name: email, role: 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post('/portal-api/influencer/auth/login').send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, lina, quiet3, session, day };
};

const INFLUENCER_POISON = ['5555.55', '11111.37', '33333.19', '98765.43', '7777.77', '424242', 'Rival', 'tokenSealed', 'v1:x', 'agreedRate'];

test('influencer analytics: own account growth, audience, posts and earnings only', async () => {
  const ctx = buildInfluencer();
  const lina = await ctx.session(ctx.lina, 'lina@creator.test');
  const res = await request(ctx.server).get('/portal-api/influencer/analytics').set(lina);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { growth, audience, posts, averages, earnings } = res.body;
  assert.deepEqual(growth.days.map((d) => d.followers), [1000, 1100, 1250]);
  assert.deepEqual(growth.change, { followers: 250, reach: 500, views: 750, engaged: 25 });
  assert.deepEqual(audience, { country: { OM: 0.6, AE: 0.3 }, age: { '18-24': 0.4, '25-34': 0.5 }, gender: { F: 0.7, M: 0.3 } });
  assert.deepEqual(posts.map((p) => p.title), ['Story', 'Iftar reel'], 'newest first, own posts only');
  assert.deepEqual(Object.keys(posts[1].checkpoints).sort(), ['24h', '7d']);
  assert.equal(posts[1].checkpoints['7d'].views, 9000);
  assert.equal(posts[1].campaign, 'Ramadan launch');
  assert.equal(averages.views, (9000 + 2000) / 2, 'average of each post\'s latest result');
  // Paid money sits in the month it was paid; pending money in the month it is due (bills fall due in 30 days).
  const month = new Date().toISOString().slice(0, 7);
  const dueMonth = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 7);
  assert.deepEqual(earnings, month === dueMonth
    ? [{ month, currency: 'USD', paid: 1500, pending: 400 }]
    : [{ month, currency: 'USD', paid: 1500, pending: 0 }, { month: dueMonth, currency: 'USD', paid: 0, pending: 400 }]);
  const json = JSON.stringify(res.body);
  for (const secret of INFLUENCER_POISON) assert.equal(json.includes(secret), false, `influencer analytics leaked ${secret}`);
});

test('influencer analytics: a date range trims growth, and no account means no growth or audience', async () => {
  const ctx = buildInfluencer();
  const lina = await ctx.session(ctx.lina, 'lina@creator.test');
  const ranged = await request(ctx.server).get(`/portal-api/influencer/analytics?from=${ctx.day(15)}`).set(lina);
  assert.deepEqual(ranged.body.growth.days.map((d) => d.followers), [1100, 1250]);
  assert.deepEqual(ranged.body.posts.map((p) => p.title), ['Story', 'Iftar reel']);
  const none = await ctx.session(ctx.quiet3, 'none@creator.test');
  const empty = await request(ctx.server).get('/portal-api/influencer/analytics').set(none);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.growth, null);
  assert.equal(empty.body.audience, null);
  assert.deepEqual(empty.body.posts, []);
  assert.equal(empty.body.averages, null);
  assert.deepEqual(empty.body.earnings, []);
});
