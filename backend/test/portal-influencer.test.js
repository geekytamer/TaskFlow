const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * The influencer portal: profile, change requests and assignments. Secrecy runs
 * both ways: an influencer sees their own agreed rate and nothing about client
 * prices, costs, budgets, other influencers or internal notes.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
// Decimal values cannot appear by chance in a UUID.
const POISON = [
  '98765.43', '11111.37', '22222.73', '55555.29', '66666.83',
  'CAMPAIGN-NOTE-POISON', 'DELIV-NOTE-POISON', 'ASSIGN-NOTE-POISON', 'CONTACT-NOTE-POISON', 'TAG-POISON',
  'Rival Influencer', 'ownerUserId', 'vendorBillId', '"price"', '"cost"', '"budget"', '"notes"', '"tags"',
];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-influencer-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const owner = staff('Manager', 'Carla Owner', 'carla@peak.test');
  const employee = staff('Employee', 'Eve Employee', 'eve@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'] });
  const lina = store.createContact({
    companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'], ownerUserId: owner.id,
    influencerNiche: 'Food', location: 'Muscat', languages: ['Arabic', 'English'], availabilityStatus: 'Available',
    rateCardAmount: 1200, notes: 'CONTACT-NOTE-POISON', tags: ['TAG-POISON'],
    influencerAccounts: [{ id: 'a', platform: 'Instagram', handle: '@lina.eats', url: 'https://instagram.com/lina.eats', followers: 184000, engagementRate: 4.2 }],
  });
  const rival = store.createContact({ companyId: company.id, kind: 'Person', name: 'Rival Influencer', roles: ['Influencer'] });

  const campaign = store.createCrmCampaign({
    companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', budget: 98765.43,
    startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30'), ownerUserId: owner.id, visibility: 'Public', notes: 'CAMPAIGN-NOTE-POISON',
  });
  const assign = (contact, status, agreedRate) => store.createCampaignAssignment({
    companyId: company.id, campaignId: campaign.id, contactId: contact.id, role: 'Influencer', agreedRate, status, notes: 'ASSIGN-NOTE-POISON',
  });
  const assignment = assign(lina, 'Contacted', 1500);
  assign(rival, 'Confirmed', 55555.29);
  const deliverable = (contact, title) => store.createCampaignDeliverable({
    companyId: company.id, campaignId: campaign.id, title, platform: 'Instagram', status: 'Planned',
    fulfillment: 'External', vendorContactId: contact.id, price: 11111.37, cost: 22222.73, notes: 'DELIV-NOTE-POISON',
    dueDate: new Date('2026-11-10'),
  });
  const reel = deliverable(lina, 'Reel 1');
  deliverable(rival, 'Rival reel');

  const planned = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Still planning', status: 'Planned', visibility: 'Public' });
  store.createCampaignAssignment({ companyId: company.id, campaignId: planned.id, contactId: lina.id, role: 'Influencer', agreedRate: 66666.83, status: 'Planned' });

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
  const auth = (user) => ({ Authorization: `Bearer ${store.issueToken(user.id)}` });
  return { server, store, company, owner, client, lina, rival, campaign, planned, assignment, reel, session, ownerAuth: auth(owner), employeeAuth: auth(employee) };
};

const get = (ctx, session, p) => request(ctx.server).get(`/portal-api/influencer${p}`).set(session);
const post = (ctx, session, p, body = {}) => request(ctx.server).post(`/portal-api/influencer${p}`).set(session).send(body);
const staff = (ctx, method, p, body, as = ctx.ownerAuth) => request(ctx.server)[method](`/companies/${ctx.company.id}${p}`).set(as).send(body);

const assertNoPoison = (bodies) => bodies.forEach((body, i) => {
  const json = JSON.stringify(body);
  for (const secret of POISON) assert.equal(json.includes(secret), false, `response ${i} leaked ${secret}`);
});

test('the profile shows the influencer their own record from an allowlist', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const { status, body } = await get(ctx, lina, '/profile');
  assert.equal(status, 200);
  assert.equal(body.name, 'Lina Haddad');
  assert.equal(body.niche, 'Food');
  assert.deepEqual(body.languages, ['Arabic', 'English']);
  assert.equal(body.availability, 'Available');
  assert.equal(body.rateCard.amount, 1200, 'their own rate card');
  assert.deepEqual(body.accounts.map((a) => [a.platform, a.handle, a.followers]), [['Instagram', '@lina.eats', 184000]]);
  assert.equal(body.pendingChange, null);
  assertNoPoison([body]);
});

test('availability applies at once; other edits wait for staff', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  assert.equal((await post(ctx, lina, '/profile/availability', { availability: 'Busy' })).status, 400);
  assert.equal((await post(ctx, lina, '/profile/availability', { availability: 'Unavailable' })).status, 200);
  assert.equal(ctx.store.getContactById(ctx.lina.id).availabilityStatus, 'Unavailable');

  const change = await post(ctx, lina, '/profile/change-requests', { niche: 'Food & travel', rateCardAmount: 1500 });
  assert.equal(change.status, 201);
  assert.equal(ctx.store.getContactById(ctx.lina.id).rateCardAmount, 1200, 'nothing changes before review');
  assert.equal((await post(ctx, lina, '/profile/change-requests', { niche: 'Travel' })).status, 409, 'one pending request at a time');
  assert.equal((await post(ctx, lina, '/profile/change-requests', {})).status, 400, 'an empty request is refused');
  assert.equal((await post(ctx, lina, '/profile/change-requests', { notes: 'sneaky', ownerUserId: 'x' })).status, 400, 'only allowed fields');
  assert.deepEqual((await get(ctx, lina, '/profile')).body.pendingChange.changes, { niche: 'Food & travel', rateCardAmount: 1500 });
  assert.equal(ctx.store.listNotifications(ctx.owner.id).filter((n) => n.title.includes('Lina Haddad')).length, 1, 'the owner is told');
});

test('staff approve a change request through the normal contact update, or reject it', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  await post(ctx, lina, '/profile/change-requests', { location: 'Dubai', languages: ['English'] });
  const list = await staff(ctx, 'get', `/contacts/${ctx.lina.id}/change-requests`);
  assert.equal(list.status, 200);
  const id = list.body[0].id;
  assert.equal((await staff(ctx, 'post', `/contacts/${ctx.lina.id}/change-requests/${id}/approve`, {}, ctx.employeeAuth)).status, 403);
  assert.equal((await staff(ctx, 'post', `/contacts/${ctx.lina.id}/change-requests/${id}/approve`, {})).status, 200);
  const contact = ctx.store.getContactById(ctx.lina.id);
  assert.equal(contact.location, 'Dubai');
  assert.deepEqual(contact.languages, ['English']);
  assert.equal((await staff(ctx, 'post', `/contacts/${ctx.lina.id}/change-requests/${id}/reject`, {})).status, 409, 'decided once');

  await post(ctx, lina, '/profile/change-requests', { location: 'Paris' });
  const second = (await staff(ctx, 'get', `/contacts/${ctx.lina.id}/change-requests`)).body.find((r) => r.status === 'pending');
  const rejected = await staff(ctx, 'post', `/contacts/${ctx.lina.id}/change-requests/${second.id}/reject`, { note: 'Please talk to us first.' });
  assert.equal(rejected.status, 200);
  assert.equal(ctx.store.getContactById(ctx.lina.id).location, 'Dubai');
  const profile = (await get(ctx, lina, '/profile')).body;
  assert.equal(profile.pendingChange, null);
  assert.equal(profile.lastDecision.status, 'rejected');
  assert.equal(profile.lastDecision.note, 'Please talk to us first.');
});

test('assignments: planned ones are hidden, the brief waits for acceptance, nothing secret leaks', async () => {
  const ctx = build();
  await staff(ctx, 'put', `/campaigns/${ctx.campaign.id}/portal-brief`, { influencerBrief: 'Show the gift box in the first 3 seconds.', requireClientApproval: true });
  await staff(ctx, 'put', `/campaign-deliverables/${ctx.reel.id}/portal-brief`, { brief: 'One 30-second reel.' });
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const { body } = await get(ctx, lina, '/assignments');
  assert.equal(body.length, 1, 'the planned assignment is hidden');
  const a = body[0];
  assert.equal(a.status, 'awaiting_reply');
  assert.equal(a.campaign.name, 'Ramadan launch');
  assert.equal(a.campaign.brand, 'Al Noor Dates');
  assert.equal(a.agreedRate, 1500);
  assert.deepEqual(a.deliverables.map((d) => d.title), ['Reel 1'], 'only their own deliverables');
  assert.equal(a.brief, null, 'no brief before accepting');
  assert.equal(a.deliverables[0].brief, null);
  assertNoPoison([body]);

  assert.equal((await post(ctx, lina, `/assignments/${a.id}/respond`, { decision: 'accepted' })).status, 200);
  const after = (await get(ctx, lina, '/assignments')).body[0];
  assert.equal(after.status, 'confirmed');
  assert.equal(after.brief, 'Show the gift box in the first 3 seconds.');
  assert.equal(after.deliverables[0].brief, 'One 30-second reel.');
  assert.equal(ctx.store.getCampaignAssignmentById(a.id).status, 'Confirmed');
  assertNoPoison([after]);
});

test('an assignment is answered once, only from Contacted, and a decline needs a reason', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const id = ctx.assignment.id;
  assert.equal((await post(ctx, lina, `/assignments/${id}/respond`, { decision: 'maybe' })).status, 400);
  assert.equal((await post(ctx, lina, `/assignments/${id}/respond`, { decision: 'declined' })).status, 400, 'a reason is required');
  const res = await post(ctx, lina, `/assignments/${id}/respond`, { decision: 'declined', reason: 'I am travelling that month.' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'declined');
  assert.equal((await post(ctx, lina, `/assignments/${id}/respond`, { decision: 'accepted' })).status, 409);
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { status: 'active' }).filter((f) => (f.notes ?? '').includes('travelling'));
  assert.equal(followups.length, 1, 'the campaign owner gets a follow-up for a decline');
});

test('influencers are isolated from each other and from the client audience', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const rival = await ctx.session('influencer', ctx.rival, 'rival@creator.test');
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await post(ctx, rival, `/assignments/${ctx.assignment.id}/respond`, { decision: 'accepted' })).status, 404);
  const rivalView = (await get(ctx, rival, '/assignments')).body;
  assert.equal(JSON.stringify(rivalView).includes('Lina'), false);
  assert.equal(JSON.stringify(rivalView).includes('1500'), false, 'another influencer’s rate never shows');
  assert.equal((await get(ctx, omar, '/assignments')).status, 401);
  assert.equal((await get(ctx, omar, '/profile')).status, 401);
  assert.equal((await request(ctx.server).get('/portal-api/client/catalogue').set(lina)).status, 401);
});

test('briefs are staff-only to write and validated', async () => {
  const ctx = build();
  assert.equal((await staff(ctx, 'put', `/campaigns/${ctx.campaign.id}/portal-brief`, { influencerBrief: 'x' }, ctx.employeeAuth)).status, 403);
  assert.equal((await staff(ctx, 'put', `/campaigns/${ctx.campaign.id}/portal-brief`, { influencerBrief: 'x'.repeat(5001) })).status, 400);
  const saved = await staff(ctx, 'put', `/campaigns/${ctx.campaign.id}/portal-brief`, { influencerBrief: 'Brief', requireClientApproval: false });
  assert.equal(saved.status, 200);
  assert.deepEqual((await staff(ctx, 'get', `/campaigns/${ctx.campaign.id}/portal-brief`)).body, { campaignId: ctx.campaign.id, influencerBrief: 'Brief', requireClientApproval: false });
  const other = ctx.store.createCompany({ name: 'Other', website: '', address: '' });
  const outsider = ctx.store.createUser({ name: 'Out', email: 'out@o.test', password: 'x', role: 'Manager', companyIds: [other.id], companyRoles: [{ companyId: other.id, role: 'Manager' }] });
  const res = await request(ctx.server).put(`/companies/${other.id}/campaigns/${ctx.campaign.id}/portal-brief`)
    .set({ Authorization: `Bearer ${ctx.store.issueToken(outsider.id)}` }).send({ influencerBrief: 'hijack' });
  assert.equal(res.status, 404);
});
