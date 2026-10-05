const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { receiptHtml } = require('../dist/portal/billing-docs');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Invoices, receipts and campaign statements in the client portal. A client
 * sees only their own non-draft invoices, through an allowlist; documents are
 * rendered only after ownership is checked.
 */

const quiet = { info() {}, warn() {}, error() {} };
const PASSWORD = 'correct horse battery';
const DAY = 24 * 60 * 60 * 1000;
const POISON = ['PAYMENT-NOTE-POISON', 'SKU-POISON', 'RIVAL-INVOICE', 'DRAFT-INVOICE', '"taskId"', '"sku"', '"note"', 'templateSnapshot', 'exchangeRate'];

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-portal-billing-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: 'Muscat' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor <Dates> & Co', roles: ['Client'] });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'] });
  const campaign = store.createCrmCampaign({ companyId: company.id, contactId: client.id, name: 'Ramadan launch', status: 'Active', visibility: 'Public' });
  const rivalCampaign = store.createCrmCampaign({ companyId: company.id, contactId: rival.id, name: 'Honey week', status: 'Active', visibility: 'Public' });

  const invoice = (contact, extra = {}) => store.createInvoice({
    companyId: company.id, clientId: contact.id, contactId: contact.id,
    issueDate: new Date(Date.now() - 10 * DAY), dueDate: new Date(Date.now() + 20 * DAY),
    status: 'Sent', total: 1000,
    lineItems: [{ description: 'Influencer reel', quantity: 2, unitPrice: 500, amount: 1000, itemType: 'Manual', sku: 'SKU-POISON' }],
    ...extra,
  });
  const main = invoice(client, { campaignId: campaign.id });
  const overdue = invoice(client, { dueDate: new Date(Date.now() - 5 * DAY), notes: 'Thank you' });
  const draft = invoice(client, { status: 'Draft', notes: 'DRAFT-INVOICE' });
  const rivalInvoice = invoice(rival, { notes: 'RIVAL-INVOICE', campaignId: rivalCampaign.id });

  const first = store.createPayment({ invoiceId: main.id, amount: 300, method: 'Bank transfer', note: 'PAYMENT-NOTE-POISON', paidAt: new Date(Date.now() - 3 * DAY) });
  const second = store.createPayment({ invoiceId: main.id, amount: 200, method: 'Card', note: null, paidAt: new Date(Date.now() - DAY) });
  const rivalPayment = store.createPayment({ invoiceId: rivalInvoice.id, amount: 100, method: 'Cash', note: null, paidAt: new Date() });

  const rendered = [];
  const portalPdf = {
    invoice: async (url) => { rendered.push({ kind: 'invoice', url }); return Buffer.from('%PDF-invoice'); },
    html: async (html) => { rendered.push({ kind: 'html', html }); return Buffer.from('%PDF-html'); },
  };

  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), portalPdf,
  }).listen(0);
  server.unref();
  const session = async (contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: contact.id, email, name: email, role: 'client_admin' });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post('/portal-api/client/auth/login').send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { server, store, company, client, rival, campaign, rivalCampaign, main, overdue, draft, rivalInvoice, first, second, rivalPayment, rendered, session };
};

const get = (ctx, session, p) => request(ctx.server).get(`/portal-api/client${p}`).set(session);

test('a client lists only their own sent invoices, with status and balances derived', async () => {
  const ctx = build();
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const { status, body } = await get(ctx, omar, '/invoices');
  assert.equal(status, 200);
  assert.equal(body.length, 2, 'no draft, no other client');
  const main = body.find((i) => i.id === ctx.main.id);
  assert.deepEqual([main.status, main.total, main.paid, main.outstanding], ['partly_paid', 1000, 500, 500]);
  assert.deepEqual(main.campaign, { id: ctx.campaign.id, name: 'Ramadan launch' });
  assert.equal(body.find((i) => i.id === ctx.overdue.id).status, 'overdue');

  ctx.store.createPayment({ invoiceId: ctx.overdue.id, amount: 1000, method: 'Cash', note: null, paidAt: new Date() });
  assert.equal((await get(ctx, omar, '/invoices')).body.find((i) => i.id === ctx.overdue.id).status, 'paid');
});

test('invoice detail is allowlisted: no payment notes, task ids or SKUs', async () => {
  const ctx = build();
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const detail = await get(ctx, omar, `/invoices/${ctx.main.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.lineItems[0], { description: 'Influencer reel', quantity: 2, unitPrice: 500, discount: null, discountType: null, amount: 1000 });
  assert.deepEqual(detail.body.payments.map((p) => [p.amount, p.method]), [[300, 'Bank transfer'], [200, 'Card']]);
  assert.match(detail.body.payments[0].receiptNumber, new RegExp(`^R-${ctx.main.invoiceNumber}-[0-9a-f]{6}$`));
  const bodies = [detail.body, (await get(ctx, omar, '/invoices')).body, (await get(ctx, omar, `/campaigns/${ctx.campaign.id}/statement`)).body];
  bodies.forEach((b, i) => { for (const secret of POISON) assert.equal(JSON.stringify(b).includes(secret), false, `response ${i} leaked ${secret}`); });
});

test('other clients, drafts and foreign payments are 404, and nothing is rendered for them', async () => {
  const ctx = build();
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  for (const p of [
    `/invoices/${ctx.rivalInvoice.id}`, `/invoices/${ctx.draft.id}`,
    `/invoices/${ctx.rivalInvoice.id}/pdf`, `/invoices/${ctx.draft.id}/pdf`,
    `/payments/${ctx.rivalPayment.id}/receipt.pdf`,
    `/campaigns/${ctx.rivalCampaign.id}/statement`, `/campaigns/${ctx.rivalCampaign.id}/statement.pdf`,
  ]) {
    assert.equal((await get(ctx, omar, p)).status, 404, p);
  }
  assert.equal(ctx.rendered.length, 0, 'the renderer never ran for something not theirs');
  const lina = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Person', name: 'Lina', roles: ['Influencer'] });
  const { token } = ctx.store.portal.inviteUser({ companyId: ctx.company.id, audience: 'influencer', contactId: lina.id, email: 'l@x.test', name: 'L', role: 'influencer' });
  ctx.store.portal.acceptInvitation(token, PASSWORD);
  const login = await request(ctx.server).post('/portal-api/influencer/auth/login').send({ email: 'l@x.test', password: PASSWORD });
  assert.equal((await get(ctx, { Authorization: `Bearer ${login.body.token}` }, '/invoices')).status, 401);
});

test('the invoice PDF reuses the existing renderer, in the requested language', async () => {
  const ctx = build();
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const res = await get(ctx, omar, `/invoices/${ctx.main.id}/pdf?lang=ar`);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], new RegExp(`attachment; filename="Invoice-${ctx.main.invoiceNumber}.pdf"`));
  assert.equal(ctx.rendered[0].kind, 'invoice');
  assert.match(ctx.rendered[0].url, new RegExp(`/invoice/${ctx.main.id}\\?lang=ar$`));
  await get(ctx, omar, `/invoices/${ctx.main.id}/pdf?lang=<script>`);
  assert.doesNotMatch(ctx.rendered[1].url, /script/, 'an unknown language is dropped');
});

test('a receipt is one payment with the balance left after it, and escapes what it prints', async () => {
  const ctx = build();
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const res = await get(ctx, omar, `/payments/${ctx.second.id}/receipt.pdf`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-disposition'], /attachment; filename="Receipt-R-/);
  const html = ctx.rendered[0].html;
  assert.match(html, /Al Noor &lt;Dates&gt; &amp; Co/, 'the client name is escaped');
  assert.doesNotMatch(html, /<Dates>/);
  assert.match(html, /200\.00/);
  assert.match(html, /500\.00/, 'balance after the second payment: 1000 - 300 - 200');
  assert.doesNotMatch(html, /PAYMENT-NOTE-POISON/);
  assert.doesNotMatch(html, /<script/i);
});

test('the campaign statement totals the campaign’s invoices', async () => {
  const ctx = build();
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const { body } = await get(ctx, omar, `/campaigns/${ctx.campaign.id}/statement`);
  assert.equal(body.campaign.name, 'Ramadan launch');
  assert.deepEqual(body.invoices.map((i) => i.id), [ctx.main.id]);
  assert.deepEqual(body.totals, [{ currency: 'USD', invoiced: 1000, paid: 500, credited: 0, outstanding: 500 }]);
  const pdf = await get(ctx, omar, `/campaigns/${ctx.campaign.id}/statement.pdf?lang=ar`);
  assert.equal(pdf.status, 200);
  assert.match(ctx.rendered[0].html, /dir="rtl"/);
});

test('receipt HTML is self-contained: no scripts, no external resources', () => {
  const html = receiptHtml({
    lang: 'en', company: { name: 'Peak', address: 'Muscat' }, clientName: '<img src=x onerror=alert(1)>',
    receiptNumber: 'R-1', paidAt: new Date('2026-10-01'), amount: 10, method: 'Cash', currency: 'OMR',
    invoiceNumber: 'INV-1', invoiceTotal: 10, balanceAfter: 0,
  });
  assert.doesNotMatch(html, /<img|<script|<link|src="|href="|url\(/i, "no tags or attributes that load anything");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a statement keeps a total per currency rather than adding currencies together', async () => {
  const ctx = build();
  ctx.store.createInvoice({
    companyId: ctx.company.id, clientId: ctx.client.id, contactId: ctx.client.id, campaignId: ctx.campaign.id, currency: 'OMR', exchangeRate: 2.6,
    issueDate: new Date(), dueDate: new Date(Date.now() + 864e5), status: 'Sent', total: 400,
    lineItems: [{ description: 'Extra', quantity: 1, unitPrice: 400, amount: 400, itemType: 'Manual' }],
  });
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const { body } = await get(ctx, omar, `/campaigns/${ctx.campaign.id}/statement`);
  assert.deepEqual(body.totals.map((t) => [t.currency, t.invoiced]).sort(), [['OMR', 400], ['USD', 1000]]);
});

test('an invoice shows how to pay from its own issued template, and nothing else from it', async () => {
  const ctx = build();
  const snapshot = {
    paymentInstructions: '  Quote the invoice number as the transfer reference.  ',
    bankAccounts: [{ id: 'b1', bankName: 'Bank Muscat', accountHolder: 'Peak Media LLC', accountNumber: '0123456789', iban: 'OM810180000001299123456', swift: 'BMUSOMRX', currency: 'OMR', internalCode: 'ACC-EXTRA-POISON' }],
    terms: 'TERMS-POISON', footerNote: 'FOOTER-POISON', signatureUrl: 'SIG-POISON', stampUrl: 'STAMP-POISON', watermarkText: 'WATERMARK-POISON',
  };
  ctx.store.db.prepare('UPDATE invoices SET templateSnapshot = ? WHERE id = ?').run(JSON.stringify(snapshot), ctx.main.id);
  ctx.store.db.prepare('UPDATE invoices SET templateSnapshot = NULL WHERE id = ?').run(ctx.overdue.id);
  const omar = await ctx.session(ctx.client, 'omar@alnoor.test');
  const { body } = await get(ctx, omar, `/invoices/${ctx.main.id}`);
  assert.deepEqual(body.payment, {
    instructions: 'Quote the invoice number as the transfer reference.',
    accounts: [{ bankName: 'Bank Muscat', accountHolder: 'Peak Media LLC', accountNumber: '0123456789', iban: 'OM810180000001299123456', swift: 'BMUSOMRX', currency: 'OMR' }],
  });
  const json = JSON.stringify(body);
  for (const secret of ['ACC-EXTRA-POISON', 'TERMS-POISON', 'FOOTER-POISON', 'SIG-POISON', 'STAMP-POISON', 'WATERMARK-POISON', 'templateSnapshot', 'internalCode']) {
    assert.equal(json.includes(secret), false, `invoice leaked ${secret}`);
  }
  const bare = await get(ctx, omar, `/invoices/${ctx.overdue.id}`);
  assert.deepEqual(bare.body.payment, { instructions: null, accounts: [] });
});
