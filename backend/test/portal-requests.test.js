const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Campaign requests and proposals in the client portal. A request becomes an
 * opportunity for the account owner; staff answer it with a proposal in the CRM;
 * the client accepts or declines it through the same transition staff use.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const POISON_STRINGS = ['OPP-NOTE-POISON', 'PROPOSAL-NOTE-POISON', '987654', 'probability', 'expectedRevenue', 'ownerUserId', 'rateCard', '4321'];

const build = ({ ownerless = false } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-requests-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const other = store.createCompany({ name: 'Other Agency', website: '', address: '' });
  const user = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const manager = user('Manager', 'Sara Manager', 'sara@peak.test');
  const inviter = user('Admin', 'Ivan Inviter', 'ivan@peak.test');

  const client = store.createContact({
    companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'],
    ownerUserId: ownerless ? undefined : manager.id,
  });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'], ownerUserId: manager.id });
  const lina = store.createContact({
    companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer'], rateCardAmount: 4321,
    influencerAccounts: [{ id: 'a', platform: 'Instagram', handle: '@lina.eats', followers: 184000 }],
  });
  const unlisted = store.createContact({ companyId: company.id, kind: 'Person', name: 'Unlisted One', roles: ['Influencer'] });
  const foreign = store.createContact({ companyId: other.id, kind: 'Person', name: 'Foreign One', roles: ['Influencer'] });
  store.catalogue.list(company.id, lina.id);

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();

  const session = async (audience, contact, email, name = email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name,
      role: audience === 'client' ? 'client_admin' : 'influencer', createdByUserId: inviter.id,
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };

  return { server, store, company, manager, inviter, client, rival, lina, unlisted, foreign, session };
};

const BRIEF = {
  title: 'Ramadan dates launch',
  objective: 'Launch our premium Khalas box to young families in Muscat before Ramadan.',
  budget: 6000,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  platforms: ['Instagram', 'TikTok'],
};

const submit = (ctx, session, body) => request(ctx.server).post('/portal-api/client/requests').set(session).send(body);

/** Staff answer a request: a proposal on its opportunity, as the CRM would create it. */
const propose = (ctx, opportunityId, overrides = {}) => ctx.store.createCrmProposal({
  companyId: ctx.company.id,
  opportunityId,
  title: 'Ramadan launch: 3 creators',
  status: 'Sent',
  issueDate: new Date(),
  validUntil: new Date(Date.now() + 14 * 86400000),
  items: [{ description: 'Instagram reel, Lina Haddad', quantity: 2, unitPrice: 900 }],
  notes: 'PROPOSAL-NOTE-POISON',
  ...overrides,
});

test('a submitted request becomes an opportunity for the account owner, with a follow-up and a notification', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test', 'Omar Al Noor');
  const res = await submit(ctx, omar, { ...BRIEF, influencerIds: [ctx.lina.id] });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'in_review');
  assert.deepEqual(res.body.influencers, [{ id: ctx.lina.id, name: 'Lina Haddad' }]);

  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  assert.equal(opportunity.contactId, ctx.client.id);
  assert.equal(opportunity.stage, 'New');
  assert.equal(opportunity.ownerUserId, ctx.manager.id);
  assert.equal(opportunity.expectedRevenue, 6000);
  assert.match(opportunity.notes, /Khalas box/);
  assert.match(opportunity.notes, /Lina Haddad/);
  assert.match(opportunity.notes, /Omar Al Noor/, 'staff can see who asked');
  assert.equal(opportunity.notes.includes('4321'), false, 'the brief never carries a rate');

  const followups = ctx.store.listFollowupEntities(ctx.company.id, { entityType: 'opportunity', entityId: opportunity.id });
  assert.equal(followups.length, 1);
  assert.equal(followups[0].ownerUserId, ctx.manager.id);

  const notes = ctx.store.listNotifications(ctx.manager.id);
  assert.equal(notes.filter((n) => n.type === 'followup_assigned').length, 1);
});

test('with no account owner, the staff member who invited the client is told', async () => {
  const ctx = build({ ownerless: true });
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await submit(ctx, omar, BRIEF)).status, 201);
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  assert.equal(opportunity.ownerUserId, ctx.inviter.id);
  assert.equal(ctx.store.listNotifications(ctx.inviter.id).filter((n) => n.type === 'followup_assigned').length, 1);
});

test('requests are validated, and the shortlist only takes listed influencers', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const bad = [
    {},
    { ...BRIEF, title: '' },
    { ...BRIEF, objective: 'short' },
    { ...BRIEF, budget: -1 },
    { ...BRIEF, startDate: 'not-a-date' },
    { ...BRIEF, startDate: '2026-12-01', endDate: '2026-11-01' },
    { ...BRIEF, platforms: ['Myspace'] },
    { ...BRIEF, influencerIds: [ctx.unlisted.id] },
    { ...BRIEF, influencerIds: [ctx.foreign.id] },
    { ...BRIEF, influencerIds: [ctx.client.id] },
  ];
  for (const body of bad) assert.equal((await submit(ctx, omar, body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal(ctx.store.listOpportunities(ctx.company.id).length, 0, 'nothing half-created');
});

test('a request moves from in review to proposal ready to accepted, and accepting wins the opportunity', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test', 'Omar Al Noor');
  const created = (await submit(ctx, omar, BRIEF)).body;
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  const status = async () => (await request(ctx.server).get(`/portal-api/client/requests/${created.id}`).set(omar)).body.status;

  propose(ctx, opportunity.id, { status: 'Draft' });
  assert.equal(await status(), 'in_review', 'a draft is invisible to the client');
  assert.equal((await request(ctx.server).get('/portal-api/client/proposals').set(omar)).body.length, 0);

  const sent = propose(ctx, opportunity.id);
  assert.equal(await status(), 'proposal_ready');
  const listed = (await request(ctx.server).get('/portal-api/client/proposals').set(omar)).body;
  assert.deepEqual(listed.map((p) => p.id), [sent.id]);

  const accepted = await request(ctx.server).post(`/portal-api/client/proposals/${sent.id}/accept`).set(omar);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.status, 'accepted');
  assert.equal(accepted.body.respondedBy, 'Omar Al Noor');
  assert.equal(ctx.store.getCrmProposalById(sent.id).status, 'Accepted');
  assert.equal(ctx.store.getOpportunityById(opportunity.id).stage, 'Won');
  assert.equal(await status(), 'accepted');

  const again = await request(ctx.server).post(`/portal-api/client/proposals/${sent.id}/accept`).set(omar);
  assert.equal(again.status, 409, 'a proposal is answered once');

  // Winning the opportunity already schedules the CRM's own kickoff follow-up; the
  // portal must not add a second one for the same event, only tell the owner at once.
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { entityType: 'opportunity', entityId: opportunity.id });
  assert.equal(followups.filter((f) => f.sourceTrigger === 'portal_proposal_response').length, 0, 'no duplicate follow-up');
  const kickoff = ctx.store.listFollowupEntities(ctx.company.id, { entityType: 'contact', entityId: ctx.client.id })
    .concat(followups)
    .filter((f) => f.sourceTrigger === 'OppWon');
  assert.equal(kickoff.length, 1, 'the CRM scheduled its kickoff follow-up');
  const told = ctx.store.listNotifications(ctx.manager.id).filter((n) => /accepted proposal/.test(n.title));
  assert.equal(told.length, 1, 'the owner hears about it immediately');
});

test('declining records the reason, loses the opportunity, and closes the request', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const created = (await submit(ctx, omar, BRIEF)).body;
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  const sent = propose(ctx, opportunity.id);

  const res = await request(ctx.server).post(`/portal-api/client/proposals/${sent.id}/decline`).set(omar)
    .send({ reason: 'Over our budget for November.' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'declined');
  assert.equal(ctx.store.getOpportunityById(opportunity.id).stage, 'Lost');
  assert.equal((await request(ctx.server).get(`/portal-api/client/requests/${created.id}`).set(omar)).body.status, 'closed');
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { entityType: 'opportunity', entityId: opportunity.id });
  assert.ok(followups.some((f) => (f.notes ?? '').includes('Over our budget')), 'staff see the reason');
});

test('an expired proposal cannot be accepted', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  await submit(ctx, omar, BRIEF);
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  const stale = propose(ctx, opportunity.id, { issueDate: new Date(Date.now() - 30 * 86400000), validUntil: new Date(Date.now() - 86400000) });
  const view = await request(ctx.server).get(`/portal-api/client/proposals/${stale.id}`).set(omar);
  assert.equal(view.body.status, 'expired');
  assert.equal((await request(ctx.server).post(`/portal-api/client/proposals/${stale.id}/accept`).set(omar)).status, 409);
  assert.equal(ctx.store.getCrmProposalById(stale.id).status, 'Sent');
});

test('clients only ever see their own requests and proposals', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const sara = await ctx.session('client', ctx.rival, 'sara@sidr.test');
  const mine = (await submit(ctx, omar, BRIEF)).body;
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  const proposal = propose(ctx, opportunity.id);

  assert.deepEqual((await request(ctx.server).get('/portal-api/client/requests').set(sara)).body, []);
  assert.equal((await request(ctx.server).get(`/portal-api/client/requests/${mine.id}`).set(sara)).status, 404);
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/proposals').set(sara)).body, []);
  assert.equal((await request(ctx.server).get(`/portal-api/client/proposals/${proposal.id}`).set(sara)).status, 404);
  assert.equal((await request(ctx.server).post(`/portal-api/client/proposals/${proposal.id}/accept`).set(sara)).status, 404);
  assert.equal(ctx.store.getCrmProposalById(proposal.id).status, 'Sent');

  const influencer = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await request(ctx.server).get('/portal-api/client/requests').set(influencer)).status, 401);
  assert.equal((await request(ctx.server).post(`/portal-api/client/proposals/${proposal.id}/accept`).set(influencer)).status, 401);
});

test('no request or proposal response carries internal CRM fields', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const created = (await submit(ctx, omar, { ...BRIEF, influencerIds: [ctx.lina.id] })).body;
  const [opportunity] = ctx.store.listOpportunities(ctx.company.id);
  ctx.store.updateOpportunity(opportunity.id, { notes: 'OPP-NOTE-POISON', expectedRevenue: 987654, probability: 80 });
  const proposal = propose(ctx, opportunity.id);

  const bodies = [
    (await request(ctx.server).get('/portal-api/client/requests').set(omar)).body,
    (await request(ctx.server).get(`/portal-api/client/requests/${created.id}`).set(omar)).body,
    (await request(ctx.server).get('/portal-api/client/proposals').set(omar)).body,
    (await request(ctx.server).get(`/portal-api/client/proposals/${proposal.id}`).set(omar)).body,
    (await request(ctx.server).post(`/portal-api/client/proposals/${proposal.id}/accept`).set(omar)).body,
  ];
  bodies.forEach((body, i) => {
    const json = JSON.stringify(body);
    for (const secret of POISON_STRINGS) assert.equal(json.includes(secret), false, `response ${i} leaked ${secret}`);
  });
});
