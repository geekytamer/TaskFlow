/**
 * Where we pay a contact (payout_details), and the records linked to a contact
 * on its detail page (GET /contacts/:id/summary): an influencer's payouts,
 * the campaigns a client owns or a contact works on, quotations.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };
const IBAN = 'OM810180000001299123456';

const build = (engine = 'legacy') => {
  const dbPath = path.join(makeTmpDir('taskflow-payout-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak', website: '', address: '' });
  const c = company.id;
  const mk = (name, role) => store.createUser({
    name, email: `${name.toLowerCase()}@payout.test`, role,
    companyIds: [c], companyRoles: [{ companyId: c, role }], password: 'x',
  });
  const u = { admin: mk('Admin', 'Admin'), manager: mk('Manager', 'Manager'), accountant: mk('Accountant', 'Accountant'), emp: mk('Emp', 'Employee') };
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c, permissionsEngine: engine });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const as = (user) => ({
    get: (url) => agent.get(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`),
    put: (url, body) => agent.put(url).set('Authorization', `Bearer ${store.issueToken(user.id)}`).send(body),
  });
  return { store, c, u, as };
};

test('payout accounts: management saves them, the API tidies and checks them', async () => {
  const w = build();
  const inf = w.store.createContact({ companyId: w.c, name: 'Sara', roles: ['Influencer'] });
  const res = await w.as(w.u.manager).put(`/contacts/${inf.id}/payout-accounts`, {
    payoutAccounts: [
      { method: 'Bank transfer', accountHolder: 'Sara A', bankName: 'Bank Muscat', iban: 'om81 0180 0000 0129 9123 456', currency: 'omr' },
      { method: 'Wallet', walletNumber: '+968 9123 4567', isDefault: true },
    ],
  });
  assert.equal(res.status, 200, res.text);
  const [bank, wallet] = res.body.payoutAccounts;
  assert.equal(bank.iban, IBAN);
  assert.equal(bank.currency, 'OMR');
  assert.equal(bank.isDefault, false);
  assert.equal(wallet.isDefault, true, 'the one marked default stays the only default');
  assert.ok(bank.id && wallet.id);

  // Saving again keeps the ids of accounts it already had.
  const again = await w.as(w.u.manager).put(`/contacts/${inf.id}/payout-accounts`, { payoutAccounts: [{ ...bank, bankName: 'Bank Dhofar' }] });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.payoutAccounts[0].id, bank.id);
  assert.equal(again.body.payoutAccounts[0].isDefault, true, 'a lone account is the default');

  for (const bad of [
    [{ method: 'Bank transfer', bankName: 'No number' }],
    [{ method: 'Bank transfer', iban: 'NOT-AN-IBAN' }],
    [{ method: 'Wallet' }],
    [{ method: 'Pigeon', accountNumber: '1' }],
    'nope',
  ]) {
    const r = await w.as(w.u.manager).put(`/contacts/${inf.id}/payout-accounts`, { payoutAccounts: bad });
    assert.equal(r.status, 400, `${JSON.stringify(bad)} → ${r.status}`);
  }

  // An empty list clears them.
  const cleared = await w.as(w.u.manager).put(`/contacts/${inf.id}/payout-accounts`, { payoutAccounts: [] });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.payoutAccounts, undefined);
});

test('payout accounts: hidden from employees on every read, and they cannot write them', async () => {
  const w = build();
  const inf = w.store.createContact({ companyId: w.c, name: 'Sara', roles: ['Influencer'] });
  w.store.setContactPayoutAccounts(inf.id, [{ id: 'a1', method: 'Bank transfer', iban: IBAN, isDefault: true }]);

  for (const user of [w.u.admin, w.u.manager, w.u.accountant]) {
    const list = await w.as(user).get(`/companies/${w.c}/contacts`);
    assert.ok(list.text.includes(IBAN), `${user.name} sees the IBAN in the list`);
  }
  const emp = w.as(w.u.emp);
  for (const url of [`/companies/${w.c}/contacts`, `/contacts/${inf.id}/summary`, `/companies/${w.c}/contacts/export`]) {
    const r = await emp.get(url);
    assert.equal(r.status, 200, `${url} ${r.status}`);
    assert.ok(!r.text.includes(IBAN), `employee does not see the IBAN on ${url}`);
  }
  const write = await emp.put(`/contacts/${inf.id}/payout-accounts`, { payoutAccounts: [] });
  assert.equal(write.status, 403);
  assert.equal(w.store.getContactById(inf.id).payoutAccounts.length, 1);
});

test('payout accounts: a change is recorded without the full number', async () => {
  const w = build();
  const inf = w.store.createContact({ companyId: w.c, name: 'Sara', roles: ['Influencer'] });
  await w.as(w.u.manager).put(`/contacts/${inf.id}/payout-accounts`, { payoutAccounts: [{ method: 'Bank transfer', bankName: 'Bank Muscat', iban: IBAN }] });
  const events = w.store.listActivityEvents(w.c, { entityType: 'contact', entityId: inf.id, limit: 10 })
    .filter((e) => e.action === 'payout_accounts_changed');
  assert.equal(events.length, 1);
  assert.equal(events[0].actorUserId, w.u.manager.id);
  assert.match(events[0].summary, /Bank Muscat …3456/);
  assert.ok(!events[0].summary.includes(IBAN));
});

test('payout accounts: another company cannot reach them', async () => {
  const w = build();
  const other = w.store.createCompany({ name: 'Other', website: '', address: '' });
  const theirs = w.store.createContact({ companyId: other.id, name: 'Theirs', roles: ['Influencer'] });
  const r = await w.as(w.u.admin).put(`/contacts/${theirs.id}/payout-accounts`, { payoutAccounts: [] });
  assert.equal(r.status, 403);
});

const campaignWithPaidReel = (w, owner = w.u.admin) => {
  const client = w.store.createContact({ companyId: w.c, name: 'Brand Co', roles: ['Client'] });
  const inf = w.store.createContact({ companyId: w.c, name: 'Sara', roles: ['Influencer'] });
  const camp = w.store.createCrmCampaign({ companyId: w.c, contactId: client.id, name: 'Ramadan', status: 'Planned', visibility: 'Public', ownerUserId: owner.id, ownerName: owner.name });
  const reel = w.store.createCampaignDeliverable({ companyId: w.c, campaignId: camp.id, contactId: inf.id, vendorContactId: inf.id, title: 'Reel', fulfillment: 'External', cost: 300, price: 500 });
  return { client, inf, camp, reel };
};

test('summary: an influencer\'s payout bills and work show on their page', async () => {
  const w = build();
  const { inf, camp } = campaignWithPaidReel(w);
  const [bill] = w.store.generateCampaignVendorBills(w.c, camp.id);
  assert.equal(bill.supplierId, inf.id, 'a new payout bill names the contact as its supplier');

  // A bill made before that fix names no supplier: it still counts, through the deliverable.
  w.store.db.prepare('UPDATE vendor_bills SET supplierId = NULL WHERE id = ?').run(bill.id);

  const res = await w.as(w.u.manager).get(`/contacts/${inf.id}/summary`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.totals.vendorBillCount, 1);
  assert.equal(res.body.totals.vendorBillOutstanding, 300);
  assert.equal(res.body.totals.deliverableCount, 1);
  assert.equal(res.body.deliverables[0].title, 'Reel');
  assert.equal(res.body.deliverables[0].campaignName, 'Ramadan');
  assert.equal(res.body.deliverables[0].cost, 300);
  assert.deepEqual(res.body.campaigns.map((x) => [x.name, x.relation]), [['Ramadan', 'work']]);
});

test('summary: what we pay an influencer is hidden without rate cards', async () => {
  const w = build();
  const { inf } = campaignWithPaidReel(w, w.u.emp);
  const res = await w.as(w.u.emp).get(`/contacts/${inf.id}/summary`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.totals.deliverableCount, 1);
  assert.equal(res.body.deliverables[0].cost, undefined);
});

test('summary: a client sees their campaigns and quotations', async () => {
  const w = build();
  const { client } = campaignWithPaidReel(w);
  w.store.createQuotation({
    companyId: w.c, clientId: client.id, contactId: client.id, issueDate: new Date(), validUntil: new Date(Date.now() + 864e5),
    items: [{ description: 'Campaign', quantity: 1, unitPrice: 500 }], taxRate: 0,
  });
  const res = await w.as(w.u.manager).get(`/contacts/${client.id}/summary`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.totals.campaignCount, 1);
  assert.equal(res.body.campaigns[0].relation, 'client');
  assert.equal(res.body.totals.quotationCount, 1);
  assert.equal(res.body.totals.vendorBillCount, 0, 'the client is not paid for the influencer\'s work');
});
