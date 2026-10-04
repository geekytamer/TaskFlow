const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Referrals and their commissions. A referral is reviewed by staff before it
 * becomes anything in the CRM; a commission is optional, its terms are set by
 * staff, and its payout reuses the documents finance already has. Nothing
 * here posts to the ledger by itself: a vendor bill is created as a draft, and
 * a credit note is issued by an accountant and then linked.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
// Values that must never reach a referrer.
const POISON = ['STAFF-NOTE-POISON', '77777.31', 'OPP-NOTE-POISON', 'reviewedByUserId', 'staffNote', 'opportunityId', 'payoutRefId', 'prospectContactId', 'expectedRevenue'];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-referrals-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const staff = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const owner = staff('Manager', 'Carla Owner', 'carla@peak.test');
  const employee = staff('Employee', 'Eve Employee', 'eve@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: owner.id });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const lina = store.createContact({ companyId: company.id, kind: 'Person', name: 'Lina Haddad', roles: ['Influencer', 'Vendor'] });

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
  return { server, store, company, owner, client, rival, lina, session, ownerAuth: auth(owner), employeeAuth: auth(employee) };
};

const BRIEF = {
  prospectName: 'Bahja Perfumes',
  prospectContact: 'marketing@bahja.test, +968 9000 0000',
  description: 'They are launching a new oud line in December and asked me who runs our campaigns.',
  estimatedValue: 5000,
};

const refer = (ctx, session, body = BRIEF, audience = 'client') =>
  request(ctx.server).post(`/portal-api/${audience}/referrals`).set(session).send(body);
const staffPath = (ctx, rest = '') => `/companies/${ctx.company.id}/portal-referrals${rest}`;
const staffPost = (ctx, rest, body = {}, as = ctx.ownerAuth) => request(ctx.server).post(staffPath(ctx, rest)).set(as).send(body);

test('a client refers a prospect and sees it as received; staff are told', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test', 'Omar');
  const res = await refer(ctx, omar);
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'received');
  assert.equal(res.body.prospectName, 'Bahja Perfumes');
  assert.equal(res.body.commission, null);

  const notes = ctx.store.listNotifications(ctx.owner.id).filter((n) => n.title.includes('Bahja Perfumes'));
  assert.equal(notes.length, 1, 'the account manager is notified');
  const followups = ctx.store.listFollowupEntities(ctx.company.id, { status: 'active', entityType: 'contact', entityId: ctx.client.id })
    .filter((f) => f.sourceTrigger === 'portal_referral');
  assert.equal(followups.length, 1, 'and gets a review follow-up');
  assert.equal(ctx.store.listOpportunities(ctx.company.id).length, 0, 'nothing enters the CRM before review');
});

test('referrals are validated and capped while unreviewed', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  assert.equal((await refer(ctx, omar, { ...BRIEF, prospectName: 'x' })).status, 400);
  assert.equal((await refer(ctx, omar, { ...BRIEF, prospectContact: '' })).status, 400);
  assert.equal((await refer(ctx, omar, { ...BRIEF, description: 'short' })).status, 400);
  assert.equal((await refer(ctx, omar, { ...BRIEF, estimatedValue: -5 })).status, 400);
  for (let i = 0; i < 10; i += 1) assert.equal((await refer(ctx, omar, { ...BRIEF, prospectName: `Prospect ${i}` })).status, 201);
  assert.equal((await refer(ctx, omar)).status, 429, 'ten waiting for review is the limit');
});

test('each referrer sees only their own referrals, in either portal', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const sara = await ctx.session('client', ctx.rival, 'sara@sidr.test');
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  await refer(ctx, omar);
  await refer(ctx, lina, { ...BRIEF, prospectName: 'Muscat Cafe' }, 'influencer');

  assert.deepEqual((await request(ctx.server).get('/portal-api/client/referrals').set(omar)).body.map((r) => r.prospectName), ['Bahja Perfumes']);
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/referrals').set(sara)).body, []);
  assert.deepEqual((await request(ctx.server).get('/portal-api/influencer/referrals').set(lina)).body.map((r) => r.prospectName), ['Muscat Cafe']);
  assert.equal((await request(ctx.server).get('/portal-api/influencer/referrals').set(omar)).status, 401, 'a client session is not an influencer session');
});

test('staff need the portal permission to see or act on referrals', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await refer(ctx, omar);
  assert.equal((await request(ctx.server).get(staffPath(ctx)).set(ctx.employeeAuth)).status, 403);
  assert.equal((await staffPost(ctx, `/${body.id}/decline`, {}, ctx.employeeAuth)).status, 403);
  const list = await request(ctx.server).get(staffPath(ctx)).set(ctx.ownerAuth);
  assert.equal(list.status, 200);
  assert.equal(list.body[0].referrer.name, 'Al Noor Dates');
  assert.equal(list.body[0].status, 'submitted');
});

test('declining keeps the staff note internal and closes the review follow-up', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await refer(ctx, omar);
  const res = await staffPost(ctx, `/${body.id}/decline`, { staffNote: 'STAFF-NOTE-POISON' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'declined');
  assert.equal((await staffPost(ctx, `/${body.id}/decline`)).status, 409, 'only a submitted referral can be decided');

  const mine = (await request(ctx.server).get('/portal-api/client/referrals').set(omar)).body;
  assert.equal(mine[0].status, 'not_pursued');
  assert.equal(JSON.stringify(mine).includes('STAFF-NOTE-POISON'), false);
  const open = ctx.store.listFollowupEntities(ctx.company.id, { status: 'active', entityType: 'contact', entityId: ctx.client.id })
    .filter((f) => f.sourceTrigger === 'portal_referral');
  assert.equal(open.length, 0);
});

test('converting creates exactly one lead and opportunity that point back to the referral', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await refer(ctx, omar);
  const res = await staffPost(ctx, `/${body.id}/convert`, { expectedRevenue: 6000, staffNote: 'STAFF-NOTE-POISON' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'converted');

  const opportunities = ctx.store.listOpportunities(ctx.company.id);
  assert.equal(opportunities.length, 1);
  assert.equal(res.body.opportunity.id, opportunities[0].id);
  assert.equal(opportunities[0].expectedRevenue, 6000);
  const prospect = ctx.store.getContactById(opportunities[0].contactId);
  assert.equal(prospect.name, 'Bahja Perfumes');
  assert.equal(prospect.leadSource, 'Referral');
  assert.ok(prospect.roles.includes('Lead'));
  assert.equal((await staffPost(ctx, `/${body.id}/convert`)).status, 409, 'a referral converts once');

  const mine = (await request(ctx.server).get('/portal-api/client/referrals').set(omar)).body;
  assert.equal(mine[0].status, 'taken_forward');
});

test('converting can attach to a contact staff already have', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const existing = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Bahja Perfumes LLC', roles: ['Lead'] });
  const { body } = await refer(ctx, omar);
  const res = await staffPost(ctx, `/${body.id}/convert`, { prospectContactId: existing.id });
  assert.equal(res.status, 200);
  assert.equal(ctx.store.listOpportunities(ctx.company.id)[0].contactId, existing.id);
  assert.equal(ctx.store.listContacts(ctx.company.id).filter((c) => c.name === 'Bahja Perfumes').length, 0, 'no duplicate contact');
});

const convertWon = async (ctx, session, commission, expectedRevenue = 10000, audience = 'client') => {
  const { body } = await refer(ctx, session, BRIEF, audience);
  const converted = await staffPost(ctx, `/${body.id}/convert`, { expectedRevenue, commission });
  assert.equal(converted.status, 200, JSON.stringify(converted.body));
  return { referralId: body.id, opportunityId: converted.body.opportunity.id };
};

test('commission terms are optional, validated, and visible to the referrer without internals', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await refer(ctx, omar);
  assert.equal((await staffPost(ctx, `/${body.id}/convert`, { commission: { basis: 'percent', ratePercent: 150, payoutType: 'credit_note' } })).status, 400);
  assert.equal((await staffPost(ctx, `/${body.id}/convert`, { commission: { basis: 'fixed', payoutType: 'credit_note' } })).status, 400);
  assert.equal((await staffPost(ctx, `/${body.id}/convert`, { commission: { basis: 'percent', ratePercent: 5, payoutType: 'cash' } })).status, 400);
  assert.equal(ctx.store.listOpportunities(ctx.company.id).length, 0, 'a bad commission converts nothing');

  const ok = await staffPost(ctx, `/${body.id}/convert`, { expectedRevenue: 77777.31, commission: { basis: 'percent', ratePercent: 5, payoutType: 'credit_note' } });
  assert.equal(ok.status, 200);
  ctx.store.updateOpportunity(ok.body.opportunity.id, { notes: 'OPP-NOTE-POISON' });

  const mine = (await request(ctx.server).get('/portal-api/client/referrals').set(omar)).body;
  assert.deepEqual(mine[0].commission, { basis: 'percent', ratePercent: 5, fixedAmount: null, amount: null, currency: mine[0].currency, status: 'pending' });
  const json = JSON.stringify(mine);
  for (const secret of POISON) assert.equal(json.includes(secret), false, `leaked ${secret}`);
});

test('a commission is approved only once the deal is won, and then a draft vendor bill pays it', async () => {
  const ctx = build();
  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const { referralId, opportunityId } = await convertWon(ctx, lina, { basis: 'percent', ratePercent: 7.5, payoutType: 'vendor_bill' }, 10000, 'influencer');

  assert.equal((await staffPost(ctx, `/${referralId}/commission/approve`)).status, 409, 'the deal is not won yet');
  ctx.store.updateOpportunityStage(opportunityId, 'Won');
  const approved = await staffPost(ctx, `/${referralId}/commission/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.commission.amount, 750);
  assert.equal(approved.body.commission.status, 'approved');

  const bill = ctx.store.getVendorBillById(approved.body.commission.payoutRefId);
  assert.equal(bill.status, 'Draft', 'finance still approves the bill');
  assert.equal(bill.amount, 750);
  assert.equal(bill.vendorName, 'Lina Haddad');
  assert.equal((await staffPost(ctx, `/${referralId}/commission/approve`)).status, 409, 'approved once');

  const view = async () => (await request(ctx.server).get('/portal-api/influencer/referrals').set(lina)).body[0];
  assert.equal((await view()).status, 'won');
  assert.equal((await view()).commission.status, 'approved');
  ctx.store.updateVendorBillStatus(bill.id, 'Approved');
  ctx.store.createVendorBillPayment({ billId: bill.id, amount: 750, paidAt: new Date(), method: 'Bank Transfer' });
  assert.equal((await view()).commission.status, 'paid', 'paid is read from the bill');
});

test('a fixed commission paid by credit note is approved without a document, then linked to one an accountant issued', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { referralId, opportunityId } = await convertWon(ctx, omar, { basis: 'fixed', fixedAmount: 300, payoutType: 'credit_note' });
  ctx.store.updateOpportunityStage(opportunityId, 'Won');
  const notesBefore = ctx.store.listCreditNotes(ctx.company.id).length;
  const approved = await staffPost(ctx, `/${referralId}/commission/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.commission.amount, 300);
  assert.equal(ctx.store.listCreditNotes(ctx.company.id).length, notesBefore, 'no credit note is issued automatically');

  const wrongClient = ctx.store.createCreditNote({ companyId: ctx.company.id, clientId: ctx.rival.id, lineItems: [{ description: 'x', amount: 300 }] });
  const wrongAmount = ctx.store.createCreditNote({ companyId: ctx.company.id, clientId: ctx.client.id, lineItems: [{ description: 'x', amount: 299 }] });
  const right = ctx.store.createCreditNote({ companyId: ctx.company.id, clientId: ctx.client.id, lineItems: [{ description: 'Referral commission', amount: 300 }] });
  assert.equal((await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteId: wrongClient.id })).status, 400);
  assert.equal((await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteId: wrongAmount.id })).status, 400);
  assert.equal((await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteNumber: 'CN-DOES-NOT-EXIST' })).status, 400);
  const linked = await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteNumber: ` ${right.creditNoteNumber.toLowerCase()} ` });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.commission.status, 'paid');
  assert.equal((await request(ctx.server).get('/portal-api/client/referrals').set(omar)).body[0].commission.status, 'paid');
});

test('pending terms can be changed or voided; approved ones cannot', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { referralId, opportunityId } = await convertWon(ctx, omar, undefined);
  const terms = (body) => request(ctx.server).put(staffPath(ctx, `/${referralId}/commission`)).set(ctx.ownerAuth).send(body);
  assert.equal((await terms({ basis: 'fixed', fixedAmount: 100, payoutType: 'credit_note' })).status, 200, 'terms can be added after conversion');
  assert.equal((await terms({ basis: 'fixed', fixedAmount: 200, payoutType: 'credit_note' })).body.commission.fixedAmount, 200);
  assert.equal((await staffPost(ctx, `/${referralId}/commission/void`)).body.commission.status, 'voided');
  assert.equal((await terms({ basis: 'fixed', fixedAmount: 250, payoutType: 'credit_note' })).body.commission.status, 'pending', 'new terms replace a voided commission');
  ctx.store.updateOpportunityStage(opportunityId, 'Won');
  await staffPost(ctx, `/${referralId}/commission/approve`);
  assert.equal((await terms({ basis: 'fixed', fixedAmount: 999, payoutType: 'credit_note' })).status, 409);
  assert.equal((await staffPost(ctx, `/${referralId}/commission/void`)).status, 409);
});

test('a declined referral cannot carry a commission, and another company cannot touch a referral', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await refer(ctx, omar);
  await staffPost(ctx, `/${body.id}/decline`);
  assert.equal((await request(ctx.server).put(staffPath(ctx, `/${body.id}/commission`)).set(ctx.ownerAuth).send({ basis: 'fixed', fixedAmount: 1, payoutType: 'credit_note' })).status, 409);

  const other = ctx.store.createCompany({ name: 'Other Co', website: '', address: '' });
  const outsider = ctx.store.createUser({ name: 'Out', email: 'out@other.test', password: 'x', role: 'Manager', companyIds: [other.id], companyRoles: [{ companyId: other.id, role: 'Manager' }] });
  const res = await request(ctx.server).post(`/companies/${other.id}/portal-referrals/${body.id}/convert`)
    .set({ Authorization: `Bearer ${ctx.store.issueToken(outsider.id)}` }).send({});
  assert.equal(res.status, 404);
});

test('if the payout document is removed, the commission can be paid again', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { referralId, opportunityId } = await convertWon(ctx, omar, { basis: 'fixed', fixedAmount: 300, payoutType: 'credit_note' });
  ctx.store.updateOpportunityStage(opportunityId, 'Won');
  await staffPost(ctx, `/${referralId}/commission/approve`);
  const first = ctx.store.createCreditNote({ companyId: ctx.company.id, clientId: ctx.client.id, lineItems: [{ description: 'Referral', amount: 300 }] });
  await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteId: first.id });
  ctx.store.deleteCreditNote(first.id);
  const second = ctx.store.createCreditNote({ companyId: ctx.company.id, clientId: ctx.client.id, lineItems: [{ description: 'Referral', amount: 300 }] });
  const relinked = await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteId: second.id });
  assert.equal(relinked.status, 200, JSON.stringify(relinked.body));
  assert.equal(relinked.body.commission.status, 'paid');
  assert.equal((await staffPost(ctx, `/${referralId}/commission/credit-note`, { creditNoteId: second.id })).status, 409, 'not while it is paid');

  const lina = await ctx.session('influencer', ctx.lina, 'lina@creator.test');
  const bill = await convertWon(ctx, lina, { basis: 'fixed', fixedAmount: 100, payoutType: 'vendor_bill' }, 1000, 'influencer');
  ctx.store.updateOpportunityStage(bill.opportunityId, 'Won');
  const approved = await staffPost(ctx, `/${bill.referralId}/commission/approve`);
  ctx.store.deleteVendorBill(approved.body.commission.payoutRefId);
  const reissued = await staffPost(ctx, `/${bill.referralId}/commission/approve`);
  assert.equal(reissued.status, 200, 'a removed draft bill is created again');
  assert.notEqual(reissued.body.commission.payoutRefId, approved.body.commission.payoutRefId);
  assert.equal(ctx.store.getVendorBillById(reissued.body.commission.payoutRefId).amount, 100);
});

test('the owner of a converted referral must belong to the company', async () => {
  const ctx = build();
  const omar = await ctx.session('client', ctx.client, 'omar@alnoor.test');
  const { body } = await refer(ctx, omar);
  const other = ctx.store.createCompany({ name: 'Other', website: '', address: '' });
  const outsider = ctx.store.createUser({ name: 'Out', email: 'out@o.test', password: 'x', role: 'Manager', companyIds: [other.id], companyRoles: [{ companyId: other.id, role: 'Manager' }] });
  assert.equal((await staffPost(ctx, `/${body.id}/convert`, { ownerUserId: outsider.id })).status, 400);
});
