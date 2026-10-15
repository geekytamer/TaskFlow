const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { sweepPortalAlerts, digest, defaultGroups } = require('../dist/portal/alerts');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * WhatsApp alerts for portal users: opt-in with a number, only what happens
 * after opting in, one digest per sweep, each event once, failures retried,
 * and no amounts or rates in any message.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const HOUR = 3600_000;

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-alerts-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const owner = store.createUser({ name: 'Carla', email: 'carla@peak.test', password: 'x', role: 'Manager', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'], ownerUserId: owner.id });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor', roles: ['Client'], ownerUserId: owner.id });
  const sent = [];
  const sender = async (companyId, phone, text, contactId) => {
    if (sender.fail) throw new Error('Green API down');
    sent.push({ companyId, phone, text, contactId });
  };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), portalWhatsApp: sender,
  }).listen(0);
  server.unref();
  const session = async (audience, contact, email) => {
    const { token, user } = store.portal.inviteUser({ companyId: company.id, audience, contactId: contact.id, email, name: email, role: audience === 'client' ? 'client_admin' : 'influencer' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { headers: { Authorization: `Bearer ${res.body.token}` }, id: user.id };
  };
  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', visibility: 'Public', ownerUserId: owner.id });
  const sweep = (now) => sweepPortalAlerts(store, sender, company.id, (a) => `https://${a}.peak.test`, now);
  return { server, store, company, owner, lina, client, campaign, sent, sender, session, sweep };
};

const staffMessage = (ctx, contact, body) => ctx.store.conversations.addMessage({ threadId: ctx.store.conversations.generalThread(ctx.company.id, contact.id).id, channel: 'portal', direction: 'out', visibility: 'external', authorType: 'staff', authorUserId: ctx.owner.id, authorPortalUserId: null, body });

test('alerts need a valid number and the company’s WhatsApp; turning them on skips what already happened', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  staffMessage(ctx, ctx.lina, 'Old news');
  const put = (body) => request(ctx.server).post('/portal-api/influencer/alerts').set(lina.headers).send(body);

  assert.deepEqual((await request(ctx.server).get('/portal-api/influencer/alerts').set(lina.headers)).body, { available: false, whatsapp: false, phone: null, lang: 'en', groups: defaultGroups(), preview: true });
  assert.equal((await put({ whatsapp: true, phone: '+971 50 123 4567' })).status, 409, 'no WhatsApp connected yet');
  ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'tok' });
  assert.equal((await put({ whatsapp: true })).status, 400, 'a number is needed');
  assert.equal((await put({ whatsapp: true, phone: '050' })).status, 400, 'with its country code');
  assert.equal((await put({ whatsapp: true, phone: '+971 50' })).status, 400, 'and the whole number');
  const on = await put({ whatsapp: true, phone: '+971 50-123 4567', lang: 'ar', groups: { messages: { whatsapp: true }, invites: { whatsapp: true } } });
  assert.equal(on.status, 200);
  assert.deepEqual([on.body.whatsapp, on.body.phone, on.body.lang], [true, '971501234567', 'ar']);

  assert.equal(await ctx.sweep(), 0, 'the old message is not announced');
  staffMessage(ctx, ctx.lina, 'Your brief is ready');
  ctx.store.createCampaignAssignment({ companyId: ctx.company.id, campaignId: ctx.campaign.id, contactId: ctx.lina.id, role: 'Influencer', agreedRate: 4321.5, status: 'Contacted' });
  assert.equal(await ctx.sweep(), 1);
  assert.equal(ctx.sent.length, 1);
  const { phone, text } = ctx.sent[0];
  assert.equal(phone, '971501234567');
  assert.match(text, /رسالة جديدة من الفريق/);
  assert.match(text, /لديك دعوة لحملة/);
  assert.match(text, /https:\/\/influencer\.peak\.test\//);
  assert.equal(/4321|4,321|rate/i.test(text), false, 'no amounts in a message');
  assert.equal(await ctx.sweep(), 0, 'each event once');
});

test('a client hears about a new proposal; a failed send is retried an hour later, not every sweep', async () => {
  const ctx = build();
  ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'tok' });
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await request(ctx.server).post('/portal-api/client/alerts').set(omar.headers).send({ whatsapp: true, phone: '+96891234567' })).status, 200);
  const req = await request(ctx.server).post('/portal-api/client/requests').set(omar.headers).send({
    title: 'Ramadan dates launch', objective: 'Launch our premium Khalas box to young families in Muscat.', budget: 6000,
    startDate: '2026-11-01', endDate: '2026-11-30', platforms: ['Instagram'],
  });
  assert.equal(req.status, 201, JSON.stringify(req.body));
  const opp = ctx.store.listOpportunities(ctx.company.id).find((o) => o.contactId === ctx.client.id);
  ctx.store.createCrmProposal({
    companyId: ctx.company.id, opportunityId: opp.id, title: 'Three creators', status: 'Sent', issueDate: new Date(),
    validUntil: new Date(Date.now() + 14 * 86400000), items: [{ description: 'Reel', quantity: 1, unitPrice: 987.65 }],
  });
  ctx.sender.fail = true;
  const t0 = new Date();
  assert.equal(await ctx.sweep(t0), 0);
  assert.equal(await ctx.sweep(new Date(t0.getTime() + 5 * 60_000)), 0);
  ctx.sender.fail = false;
  assert.equal(await ctx.sweep(new Date(t0.getTime() + 10 * 60_000)), 0, 'not retried within the hour');
  assert.equal(await ctx.sweep(new Date(t0.getTime() + HOUR + 60_000)), 1);
  assert.match(ctx.sent[0].text, /A proposal is ready for your review/);
  assert.match(ctx.sent[0].text, /https:\/\/client\.peak\.test\/proposals\//);
  assert.equal(/987/.test(ctx.sent[0].text), false);
});

test('disabled portal users and users who turned alerts off get nothing; one user never sees another’s events', async () => {
  const ctx = build();
  ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'tok' });
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  for (const [aud, s, phone] of [['influencer', lina, '+971500000001'], ['client', omar, '+971500000002']]) {
    await request(ctx.server).post(`/portal-api/${aud}/alerts`).set(s.headers).send({ whatsapp: true, phone, groups: { messages: { whatsapp: true } } });
  }
  assert.equal((await request(ctx.server).post('/portal-api/influencer/messages').set(lina.headers).send({ body: 'My own note' })).status, 201);
  assert.equal(await ctx.sweep(), 0, 'nobody is alerted about their own message');
  staffMessage(ctx, ctx.lina, 'For Lina only');
  await ctx.sweep();
  assert.deepEqual(ctx.sent.map((m) => m.phone), ['971500000001'], 'only Lina, whose thread it is');
  await request(ctx.server).post('/portal-api/influencer/alerts').set(lina.headers).send({ whatsapp: false, phone: '+971500000001' });
  ctx.store.portal.disableUser(omar.id);
  staffMessage(ctx, ctx.lina, 'Another');
  staffMessage(ctx, ctx.client, 'For Omar');
  assert.equal(await ctx.sweep(), 0);
});

test('a digest groups events by kind in the chosen language', () => {
  const text = digest([
    { event: 'message', refId: 'a', path: '/messages' }, { event: 'message', refId: 'b', path: '/messages' },
    { event: 'payout', refId: 'c', path: '/payouts' },
  ], 'en', 'Peak Media', 'https://creators.peak.test');
  assert.equal(text, 'Peak Media:\n• 2 new messages from the team\n• A payout was marked paid\nOpen your portal: https://creators.peak.test/');
});

const ALL_WA = { messages: { whatsapp: true }, proposals: { whatsapp: true }, content: { whatsapp: true }, money: { whatsapp: true }, invites: { whatsapp: true } };
const POISON = 'POISON-internal-secret';

test('preferences: defaults, partial updates keep current values, and bad matrices are refused', async () => {
  const ctx = build();
  ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'tok' });
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const post = (body) => request(ctx.server).post('/portal-api/client/alerts').set(omar.headers).send(body);
  const put = (body) => request(ctx.server).put('/portal-api/client/alerts').set(omar.headers).send(body);
  const got = (await request(ctx.server).get('/portal-api/client/alerts').set(omar.headers)).body;
  assert.equal(got.preview, true);
  assert.deepEqual(got.groups, {
    messages: { push: true, whatsapp: false }, proposals: { push: true, whatsapp: true }, content: { push: true, whatsapp: true },
    money: { push: true, whatsapp: false }, invites: { push: true, whatsapp: false },
  });
  assert.equal((await post({ whatsapp: true, phone: '+96891234567' })).status, 200);
  const r = await put({ groups: { messages: { push: false } }, preview: false });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.groups.messages, { push: false, whatsapp: false }, 'only the named field changed');
  assert.deepEqual(r.body.groups.proposals, { push: true, whatsapp: true });
  assert.equal(r.body.preview, false);
  assert.equal(r.body.whatsapp, true, 'master switch untouched');
  assert.equal(r.body.phone, '96891234567', 'phone untouched');
  assert.equal((await put({ lang: 'ar' })).body.preview, false, 'preview untouched by an unrelated update');
  for (const bad of [{ groups: { gossip: { push: true } } }, { groups: { messages: { push: 'yes' } } }, { groups: { messages: { sms: true } } }, { groups: [] }, { groups: { messages: true } }, { preview: 'no' }]) {
    assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  }
});

test('a group switched off for WhatsApp is left out of the digest and does not come back when switched on', async () => {
  const ctx = build();
  ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'tok' });
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const put = (body) => request(ctx.server).put('/portal-api/influencer/alerts').set(lina.headers).send(body);
  assert.equal((await put({ whatsapp: true, phone: '+971500000001', groups: { messages: { whatsapp: false }, invites: { whatsapp: true } } })).status, 200);
  staffMessage(ctx, ctx.lina, 'Hello there');
  ctx.store.createCampaignAssignment({ companyId: ctx.company.id, campaignId: ctx.campaign.id, contactId: ctx.lina.id, role: 'Influencer', agreedRate: 100, status: 'Contacted' });
  assert.equal(await ctx.sweep(), 1);
  assert.match(ctx.sent[0].text, /You are invited to a campaign/);
  assert.equal(/message/i.test(ctx.sent[0].text), false, 'no message line while messages are off');
  await put({ groups: { messages: { whatsapp: true } } });
  assert.equal(await ctx.sweep(), 0, 'the earlier message is not announced late');
  staffMessage(ctx, ctx.lina, 'Second');
  assert.equal(await ctx.sweep(), 1);
  assert.match(ctx.sent[1].text, /A new message from the team/);
});

test('an internal note or private message never reaches a digest', async () => {
  const ctx = build();
  ctx.store.upsertWhatsappInstance(ctx.company.id, { idInstance: '1101', apiToken: 'tok' });
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  await request(ctx.server).put('/portal-api/client/alerts').set(omar.headers).send({ whatsapp: true, phone: '+96891234567', groups: ALL_WA });
  const threadId = ctx.store.conversations.generalThread(ctx.company.id, ctx.client.id).id;
  const add = (extra) => ctx.store.conversations.addMessage({ threadId, authorType: 'staff', authorUserId: ctx.owner.id, authorPortalUserId: null, ...extra });
  add({ channel: 'note', direction: 'out', visibility: 'internal', body: POISON });
  add({ channel: 'portal', direction: 'out', visibility: 'owner_private', body: POISON });
  add({ channel: 'whatsapp', direction: 'out', visibility: 'external', body: POISON });
  assert.equal(await ctx.sweep(), 0);
  staffMessage(ctx, ctx.client, 'Visible one');
  assert.equal(await ctx.sweep(), 1);
  assert.equal(ctx.sent[0].text.includes(POISON), false);
  assert.match(ctx.sent[0].text, /A new message from the team/);
});
