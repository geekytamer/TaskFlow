const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { sweepPortalDeliverableReminders } = require('../dist/portal/reminders');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Submissions and the review loop. The influencer submits a link; staff review
 * first; if the campaign requires it the client reviews next. A client's
 * request for changes goes to staff, never straight to the influencer.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const DAY = 24 * 60 * 60 * 1000;

const build = ({ requireClientApproval = false } = {}) => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-submissions-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const owner = store.createUser({
    name: 'Carla Owner', email: 'carla@peak.test', password: 'x', role: 'Manager',
    companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Manager' }],
  });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'] });
  const rival = store.createContact({ companyId: company.id, kind: 'Person', name: 'Rival Influencer', roles: ['Influencer'] });
  const campaign = store.createCrmCampaign({
    companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', ownerUserId: owner.id, visibility: 'Public',
  });
  store.influencer.setCampaignBrief(company.id, { campaignId: campaign.id, influencerBrief: 'Brief', requireClientApproval });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: lina.id, role: 'Influencer', agreedRate: 1500, status: 'Confirmed' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: campaign.id, contactId: rival.id, role: 'Influencer', status: 'Confirmed' });
  const reel = store.createCampaignDeliverable({
    companyId: company.id, campaignId: campaign.id, title: 'Reel 1', platform: 'Instagram', status: 'Planned',
    fulfillment: 'External', vendorContactId: lina.id, cost: 1500, price: 3000, dueDate: new Date(Date.now() + DAY),
  });

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }),
  }).listen(0);
  server.unref();

  const session = async (audience, contact, email, name = email) => {
    const { token } = store.portal.inviteUser({
      companyId: company.id, audience, contactId: contact.id, email, name,
      role: audience === 'client' ? 'client_admin' : 'influencer',
    });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post(`/portal-api/${audience}/auth/login`).send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  const ownerAuth = { Authorization: `Bearer ${store.issueToken(owner.id)}` };
  return { server, store, company, owner, client, lina, rival, campaign, reel, session, ownerAuth };
};

const ip = (ctx, session, p, body = {}) => request(ctx.server).post(`/portal-api/influencer${p}`).set(session).send(body);
const submit = (ctx, session, contentUrl, caption = 'Iftar with Al Noor') => ip(ctx, session, `/deliverables/${ctx.reel.id}/submissions`, { contentUrl, caption });
const staffReview = (ctx, submissionId, body) =>
  request(ctx.server).post(`/companies/${ctx.company.id}/campaign-deliverables/${ctx.reel.id}/submissions/${submissionId}/review`).set(ctx.ownerAuth).send(body);
const myDeliverable = async (ctx, session) =>
  (await request(ctx.server).get('/portal-api/influencer/assignments').set(session)).body[0].deliverables[0];
const clientDeliverable = async (ctx, session) =>
  (await request(ctx.server).get(`/portal-api/client/campaigns/${ctx.campaign.id}`).set(session)).body.deliverables[0];

test('an influencer starts and submits their own deliverable as a new version', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await ip(ctx, lina, `/deliverables/${ctx.reel.id}/start`)).status, 200);
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'In Progress');
  assert.equal((await submit(ctx, lina, 'javascript:alert(1)')).status, 400);
  assert.equal((await submit(ctx, lina, 'not a url')).status, 400);
  const res = await submit(ctx, lina, 'https://drive.example/reel-v1');
  assert.equal(res.status, 201);
  const d = ctx.store.getCampaignDeliverableById(ctx.reel.id);
  assert.equal(d.status, 'Submitted');
  assert.equal(d.contentUrl, 'https://drive.example/reel-v1');
  const mine = await myDeliverable(ctx, lina);
  assert.equal(mine.status, 'submitted');
  assert.equal(mine.latestSubmission.version, 1);
  assert.equal(mine.waitingFor, 'team');
  assert.equal((await submit(ctx, lina, 'https://drive.example/reel-v1b')).status, 409, 'not while waiting for review');
});

test('another influencer cannot touch the deliverable, and a client session is refused', async () => {
  const ctx = build();
  const rival = await ctx.session('influencer', ctx.rival, 'rival@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await ip(ctx, rival, `/deliverables/${ctx.reel.id}/start`)).status, 404);
  assert.equal((await submit(ctx, rival, 'https://x.example/y')).status, 404);
  assert.equal((await submit(ctx, omar, 'https://x.example/y')).status, 401);
});

test('staff ask for changes with a comment the influencer sees, then approve the next version', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const v1 = (await submit(ctx, lina, 'https://drive.example/reel-v1')).body;
  assert.equal((await staffReview(ctx, v1.id, { decision: 'changes_requested' })).status, 400, 'a comment is required');
  assert.equal((await staffReview(ctx, v1.id, { decision: 'changes_requested', comment: 'Brighter lighting please.' })).status, 200);
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'In Progress');
  const mine = await myDeliverable(ctx, lina);
  assert.equal(mine.status, 'in_progress');
  assert.deepEqual(mine.latestSubmission.feedback, { decision: 'changes_requested', comment: 'Brighter lighting please.' });

  const v2 = (await submit(ctx, lina, 'https://drive.example/reel-v2')).body;
  assert.equal(v2.version, 2);
  assert.equal((await staffReview(ctx, v1.id, { decision: 'approved' })).status, 409, 'only the latest version is reviewed');
  assert.equal((await staffReview(ctx, v2.id, { decision: 'approved' })).status, 200);
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'Approved');

  const history = await request(ctx.server).get(`/companies/${ctx.company.id}/campaign-deliverables/${ctx.reel.id}/submissions`).set(ctx.ownerAuth);
  assert.deepEqual(history.body.map((s) => [s.version, s.staffDecision]), [[2, 'approved'], [1, 'changes_requested']]);
});

test('once approved the influencer marks it published with the post link', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const publish = (url) => ip(ctx, lina, `/deliverables/${ctx.reel.id}/publish`, { postUrl: url });
  const v1 = (await submit(ctx, lina, 'https://drive.example/reel-v1')).body;
  assert.equal((await publish('https://instagram.com/p/abc')).status, 409, 'not before approval');
  await staffReview(ctx, v1.id, { decision: 'approved' });
  assert.equal((await publish('javascript:alert(1)')).status, 400);
  assert.equal((await publish('https://instagram.com/p/abc')).status, 200);
  const d = ctx.store.getCampaignDeliverableById(ctx.reel.id);
  assert.equal(d.status, 'Published');
  assert.equal(d.contentUrl, 'https://instagram.com/p/abc');
  assert.ok(d.publishedAt);
});

test('with client approval required, the client reviews only after staff approve, and the client approval completes it', async () => {
  const ctx = build({ requireClientApproval: true });
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const v1 = (await submit(ctx, lina, 'https://drive.example/reel-v1')).body;

  const before = await clientDeliverable(ctx, omar);
  assert.equal(before.contentUrl, null, 'the client does not see unreviewed work');
  assert.notEqual(before.status, 'ready_for_review');

  await staffReview(ctx, v1.id, { decision: 'approved' });
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'Submitted', 'waits for the client');
  assert.equal((await myDeliverable(ctx, lina)).waitingFor, 'client');
  const ready = await clientDeliverable(ctx, omar);
  assert.equal(ready.status, 'ready_for_review');
  assert.equal(ready.contentUrl, 'https://drive.example/reel-v1');

  const approve = await request(ctx.server).post(`/portal-api/client/campaigns/${ctx.campaign.id}/deliverables/${ctx.reel.id}/review`).set(omar).send({ decision: 'approved' });
  assert.equal(approve.status, 200);
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'Approved');
});

test('a client asking for changes goes to staff, who relay it; the client comment never reaches the influencer', async () => {
  const ctx = build({ requireClientApproval: true });
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const v1 = (await submit(ctx, lina, 'https://drive.example/reel-v1')).body;
  await staffReview(ctx, v1.id, { decision: 'approved' });
  await request(ctx.server).post(`/portal-api/client/campaigns/${ctx.campaign.id}/deliverables/${ctx.reel.id}/review`).set(omar)
    .send({ decision: 'changes_requested', comment: 'CLIENT-ONLY: the logo is too small' });
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'Submitted', 'the client does not move it');
  const influencerView = JSON.stringify((await request(ctx.server).get('/portal-api/influencer/assignments').set(lina)).body);
  assert.equal(influencerView.includes('CLIENT-ONLY'), false);

  const relay = await staffReview(ctx, v1.id, { decision: 'changes_requested', comment: 'Please make the logo bigger.' });
  assert.equal(relay.status, 200, 'staff can still ask for changes while the client has not approved');
  assert.equal(ctx.store.getCampaignDeliverableById(ctx.reel.id).status, 'In Progress');
  assert.equal((await myDeliverable(ctx, lina)).latestSubmission.feedback.comment, 'Please make the logo bigger.');
});

test('the influencer view of submissions carries no reviewer identity or internal fields', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const v1 = (await submit(ctx, lina, 'https://drive.example/reel-v1')).body;
  await staffReview(ctx, v1.id, { decision: 'changes_requested', comment: 'Brighter.' });
  const json = JSON.stringify((await request(ctx.server).get('/portal-api/influencer/assignments').set(lina)).body);
  for (const secret of ['reviewedByUserId', ctx.owner.id, 'Carla', '"price"', '"cost"', '3000']) {
    assert.equal(json.includes(secret), false, `leaked ${secret}`);
  }
});

test('deliverables due within two days and not submitted get one reminder follow-up for the campaign owner', async () => {
  const ctx = build();
  await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const later = ctx.store.createCampaignDeliverable({
    companyId: ctx.company.id, campaignId: ctx.campaign.id, title: 'Story', status: 'Planned', fulfillment: 'External', vendorContactId: ctx.lina.id, dueDate: new Date(Date.now() + 10 * DAY),
  });
  assert.equal(sweepPortalDeliverableReminders(ctx.store, ctx.company.id), 1);
  assert.equal(sweepPortalDeliverableReminders(ctx.store, ctx.company.id), 0, 'idempotent');
  const reminders = ctx.store.listFollowupEntities(ctx.company.id, { status: 'active' }).filter((f) => f.sourceTrigger === 'portal_deliverable_due');
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].sourceId, ctx.reel.id);
  assert.equal(reminders[0].ownerUserId, ctx.owner.id);
  assert.ok(!reminders.some((r) => r.sourceId === later.id));
});
