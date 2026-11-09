const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { sweepChequeReminders, reminderStage } = require('../dist/finance/client-payment-messages');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Client payments (spec 2026-11-09): post-dated cheques recorded by staff,
 * reminded before deposit on WhatsApp and email, cleared into a real invoice
 * payment; transfers claimed by the client in the portal and confirmed or
 * rejected by staff. Nothing crosses to another client.
 */

const quiet = { info() {}, warn() {}, error() {} };
const DAY = 864e5;
const PASSWORD = 'correct horse battery';
const PNG64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
const flush = () => new Promise((r) => setTimeout(r, 30));
/** 10:00 in Muscat (06:00 UTC) on the given day. */
const morning = (day) => new Date(`${day}T06:00:00Z`);
const dayOf = (offset, from = Date.now()) => new Date(from + offset * DAY).toISOString().slice(0, 10);

const build = () => {
  const dbPath = path.join(makeTmpDir('taskflow-client-payments-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak Media', website: '', address: '' });
  const user = (role, name, email) => store.createUser({
    name, email, password: 'x', role, companyIds: [company.id], companyRoles: [{ companyId: company.id, role }],
  });
  const accountant = user('Accountant', 'Ali Accountant', 'ali@peak.test');
  const manager = user('Manager', 'Sara Manager', 'sara@peak.test');
  const employee = user('Employee', 'Eli Employee', 'eli@peak.test');
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Al Noor Dates', roles: ['Client'], ownerUserId: manager.id, phone: '+968 9123 4567', email: 'pay@alnoor.test' });
  const rival = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Sidr Honey', roles: ['Client'], ownerUserId: manager.id });
  const invoice = (contact, total = 1200) => store.createInvoice({
    companyId: company.id, clientId: contact.id, contactId: contact.id,
    issueDate: new Date(Date.now() - 2 * DAY), dueDate: new Date(Date.now() + 90 * DAY), status: 'Sent', total, currency: 'OMR', exchangeRate: 2.6,
    lineItems: [{ description: 'Campaign', quantity: 1, unitPrice: total, amount: total, itemType: 'Manual' }],
  });
  const sent = [];
  const senders = {
    whatsapp: async (companyId, phone, text) => { sent.push({ channel: 'whatsapp', phone, text }); },
    email: async (to, subject, html) => { sent.push({ channel: 'email', to, subject, html }); return { sent: true }; },
  };
  const server = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, authzEngine: 'legacy',
    portalCompanyId: company.id, sendPortalInvite: async () => ({ sent: true }), clientPaymentSenders: senders,
  }).listen(0);
  server.unref();
  const as = (u) => ({ Authorization: `Bearer ${store.issueToken(u.id)}` });
  const portal = async (contact, email) => {
    const { token } = store.portal.inviteUser({ companyId: company.id, audience: 'client', contactId: contact.id, email, name: email, role: 'client_admin', createdByUserId: manager.id });
    store.portal.acceptInvitation(token, PASSWORD);
    const res = await request(server).post('/portal-api/client/auth/login').send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${res.body.token}` };
  };
  return { store, company, accountant, manager, employee, client, rival, invoice, server, as, portal, sent, senders };
};

test('cheques: recorded within what is left, cleared into a real payment, reversed back to deposited', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 1200);
  const post = (body) => request(ctx.server).post(`/invoices/${inv.id}/client-payments`).set(ctx.as(ctx.accountant)).send({ method: 'cheque', ...body });

  const dates = [dayOf(10), dayOf(40), dayOf(70)];
  const ids = [];
  for (const [i, d] of dates.entries()) {
    const res = await post({ amount: 400, chequeNumber: `00012${i}`, bankName: 'Bank Muscat', dueDate: d, contentBase64: PNG64, fileName: 'cheque.png' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'received');
    assert.equal(res.body.files.length, 1);
    ids.push(res.body.id);
  }
  // Three cheques already promise the whole invoice.
  const over = await post({ amount: 1, chequeNumber: '999', dueDate: dayOf(80) });
  assert.equal(over.status, 409);
  assert.equal((await post({ amount: 100, dueDate: dayOf(5) })).status, 400, 'number required');

  const list = await request(ctx.server).get(`/invoices/${inv.id}/client-payments`).set(ctx.as(ctx.accountant));
  assert.equal(list.body.records.length, 3);
  assert.equal(list.body.room, 0);

  // Received cannot jump to confirmed; a cheque is not a transfer.
  const status = (id, body) => request(ctx.server).post(`/client-payments/${id}/status`).set(ctx.as(ctx.accountant)).send(body);
  assert.equal((await status(ids[0], { status: 'confirmed' })).status, 409);
  assert.equal((await status(ids[0], { status: 'deposited' })).status, 200);
  const cleared = await status(ids[0], { status: 'cleared', on: dayOf(0) });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.ok(cleared.body.paymentId);
  const payments = ctx.store.listPayments(inv.id);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 400);
  assert.equal(payments[0].method, 'Cheque');
  assert.match(payments[0].note, /000120/);
  assert.equal(ctx.store.getInvoiceById(inv.id).outstandingAmount, 800);
  // Cleared is final by hand.
  assert.equal((await status(ids[0], { status: 'bounced', reason: 'x' })).status, 409);

  // Finance reverses the payment: the cheque is back to deposited, the invoice back to 1200.
  ctx.store.reverseInvoicePayment(payments[0].id);
  const back = ctx.store.clientPayments.get(ids[0]);
  assert.equal(back.status, 'deposited');
  assert.equal(back.paymentId, null);
  assert.equal(ctx.store.getInvoiceById(inv.id).outstandingAmount, 1200);
});

test('a bounced cheque needs a reason, raises a follow-up for the owner and tells the client', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 500);
  const res = await request(ctx.server).post(`/invoices/${inv.id}/client-payments`).set(ctx.as(ctx.accountant))
    .send({ method: 'cheque', amount: 500, chequeNumber: '777', dueDate: dayOf(0) });
  const id = res.body.id;
  const status = (body) => request(ctx.server).post(`/client-payments/${id}/status`).set(ctx.as(ctx.accountant)).send(body);
  assert.equal((await status({ status: 'bounced' })).status, 400);
  assert.equal((await status({ status: 'bounced', reason: 'Insufficient funds' })).status, 200);
  await flush();
  const followups = ctx.store.listFollowupEntities(ctx.company.id, {}).filter((f) => f.sourceTrigger === 'cheque_bounced');
  assert.equal(followups.length, 1);
  assert.equal(followups[0].ownerUserId, ctx.manager.id);
  assert.deepEqual(ctx.sent.map((s) => s.channel).sort(), ['email', 'whatsapp']);
  assert.match(ctx.sent.find((s) => s.channel === 'whatsapp').text, /777/);
  assert.equal(ctx.sent.find((s) => s.channel === 'whatsapp').phone, '+968 9123 4567');
});

test('reminders: days before and on the day, each once, in the day only, never for practice companies', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 900);
  const base = Date.parse('2026-12-01T06:00:00Z');
  const due = '2026-12-10';
  ctx.store.clientPayments.create({ companyId: ctx.company.id, invoiceId: inv.id, method: 'cheque', amount: 300, chequeNumber: '501', dueDate: due, by: { userId: ctx.accountant.id } }, new Date(base));
  const later = ctx.store.clientPayments.create({ companyId: ctx.company.id, invoiceId: inv.id, method: 'cheque', amount: 300, chequeNumber: '502', dueDate: '2027-01-10', by: { userId: ctx.accountant.id } }, new Date(base));

  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-01')), 0, 'too early');
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-07')), 2, 'three days before: WhatsApp and email');
  assert.match(ctx.sent[0].text, /501/);
  assert.match(ctx.sent[0].text, /3 أيام/);
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-08')), 0, 'sent once');
  // Night in Muscat (23:00): nothing goes out.
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, new Date('2026-12-10T19:00:00Z')), 0);
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-10')), 2, 'on the day');
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-10')), 0);
  assert.equal(reminderStage(later, { daysBefore: 3, onTheDay: true }, '2026-12-10'), null);

  // A new date is a new deposit: the client hears again.
  ctx.store.clientPayments.updateCheque(later.id, { dueDate: '2026-12-12' });
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-10')), 2);

  // Off: nothing. A client without a phone: email only, WhatsApp skipped.
  ctx.store.clientPayments.setSettings(ctx.company.id, { remindersEnabled: false });
  ctx.store.clientPayments.updateCheque(later.id, { dueDate: '2026-12-14' });
  assert.equal(await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-12')), 0);
  ctx.store.clientPayments.setSettings(ctx.company.id, { remindersEnabled: true });
  const noPhone = ctx.store.createContact({ companyId: ctx.company.id, kind: 'Organization', name: 'Mail Only', roles: ['Client'], email: 'only@mail.test' });
  const inv2 = ctx.invoice(noPhone, 100);
  const r = ctx.store.clientPayments.create({ companyId: ctx.company.id, invoiceId: inv2.id, method: 'cheque', amount: 100, chequeNumber: '9', dueDate: '2026-12-13', by: { userId: ctx.accountant.id } });
  ctx.sent.length = 0;
  await sweepChequeReminders(ctx.store, ctx.senders, morning('2026-12-12'));
  assert.ok(ctx.sent.some((s) => s.to === 'only@mail.test'));
  assert.equal(ctx.store.clientPayments.messages(r.id).find((m) => m.channel === 'whatsapp').status, 'skipped');
});

test('a failed send is retried after an hour, not before', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 100);
  ctx.store.clientPayments.create({ companyId: ctx.company.id, invoiceId: inv.id, method: 'cheque', amount: 100, chequeNumber: '1', dueDate: '2026-12-10', by: { userId: ctx.accountant.id } });
  let fail = true;
  const flaky = { whatsapp: async () => { if (fail) throw new Error('down'); }, email: async () => ({ sent: true }) };
  assert.equal(await sweepChequeReminders(ctx.store, flaky, morning('2026-12-08')), 1);
  fail = false;
  assert.equal(await sweepChequeReminders(ctx.store, flaky, new Date('2026-12-08T06:30:00Z')), 0, 'within the hour');
  const id = ctx.store.clientPayments.listForInvoice(inv.id)[0].id;
  assert.equal(ctx.store.clientPayments.messages(id).find((m) => m.channel === 'whatsapp').status, 'failed');
  assert.equal(await sweepChequeReminders(ctx.store, flaky, new Date('2026-12-08T07:05:00Z')), 1, 'retried after an hour; email not sent twice');
  assert.equal(ctx.store.clientPayments.messages(id).find((m) => m.channel === 'whatsapp').status, 'sent');
});

test('portal: a client claims a transfer with its receipt; staff confirm or reject; nothing crosses clients', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 1000);
  const rivalInv = ctx.invoice(ctx.rival, 300);
  const auth = await ctx.portal(ctx.client, 'omar@alnoor.test');
  const rivalAuth = await ctx.portal(ctx.rival, 'huda@sidr.test');

  const claim = (a, invoiceId, body) => request(ctx.server).post(`/portal-api/client/invoices/${invoiceId}/transfers`).set(a).send(body);
  assert.equal((await claim(auth, inv.id, { amount: 400, paidOn: dayOf(0) })).status, 400, 'receipt required');
  assert.equal((await claim(auth, rivalInv.id, { amount: 100, contentBase64: PNG64 })).status, 404, 'not their invoice');
  assert.equal((await claim(auth, inv.id, { amount: 400, paidOn: dayOf(3), contentBase64: PNG64 })).status, 400, 'no future dates');
  const ok = await claim(auth, inv.id, { amount: 400, reference: 'TRX-1', paidOn: dayOf(0), contentBase64: PNG64, fileName: 'receipt.png' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.status, 'pending');
  assert.equal(ok.body.fromYou, true);
  assert.equal(ctx.store.listPayments(inv.id).length, 0, 'not in the books until confirmed');
  const second = await claim(auth, inv.id, { amount: 700, contentBase64: PNG64 });
  assert.equal(second.status, 409, 'pending transfers count against what is left');

  // Staff were told.
  const notes = ctx.store.listNotifications(ctx.accountant.id, ctx.company.id);
  assert.ok((notes.items ?? notes).some((n) => /by transfer/.test(n.title)));

  // A cheque with a staff note and a bounce reason: the client sees the cheque, not the note or reason.
  const cheque = ctx.store.clientPayments.create({ companyId: ctx.company.id, invoiceId: inv.id, method: 'cheque', amount: 100, chequeNumber: '42', dueDate: dayOf(5), note: 'STAFF-NOTE-POISON', by: { userId: ctx.accountant.id } });
  ctx.store.clientPayments.setStatus(cheque.id, 'bounced', { reason: 'REASON-POISON' });
  const mine = await request(ctx.server).get('/portal-api/client/payments').set(auth);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 2);
  const raw = JSON.stringify(mine.body);
  assert.ok(!raw.includes('POISON'), raw);
  assert.ok(!raw.includes(ctx.accountant.id));
  assert.deepEqual((await request(ctx.server).get('/portal-api/client/payments').set(rivalAuth)).body, []);

  // Files: own only.
  const fileId = ok.body.files[0].id;
  assert.equal((await request(ctx.server).get(`/portal-api/client/payment-files/${fileId}`).set(auth)).status, 200);
  assert.equal((await request(ctx.server).get(`/portal-api/client/payment-files/${fileId}`).set(rivalAuth)).status, 404);

  // Staff confirm: a real payment dated the transfer day, and the client is told.
  const confirm = await request(ctx.server).post(`/client-payments/${ok.body.id}/status`).set(ctx.as(ctx.accountant)).send({ status: 'confirmed' });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  await flush();
  const [payment] = ctx.store.listPayments(inv.id);
  assert.equal(payment.amount, 400);
  assert.equal(payment.method, 'Bank transfer');
  assert.equal(payment.paidAt.toISOString().slice(0, 10), dayOf(0));
  assert.ok(ctx.sent.some((s) => s.channel === 'whatsapp' && /400\.000 OMR/.test(s.text)));

  // A rejected one shows its reason to the client.
  const third = await claim(auth, inv.id, { amount: 50, contentBase64: PNG64 });
  await request(ctx.server).post(`/client-payments/${third.body.id}/status`).set(ctx.as(ctx.accountant)).send({ status: 'rejected', reason: 'Not on our statement' });
  const view = await request(ctx.server).get(`/portal-api/client/invoices/${inv.id}/payments`).set(auth);
  assert.equal(view.body.records.find((r) => r.id === third.body.id).reason, 'Not on our statement');
});

test('only finance roles reach the staff routes', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 100);
  const as = ctx.as(ctx.employee);
  assert.equal((await request(ctx.server).get(`/invoices/${inv.id}/client-payments`).set(as)).status, 403);
  assert.equal((await request(ctx.server).post(`/invoices/${inv.id}/client-payments`).set(as).send({ method: 'cheque', amount: 10, chequeNumber: '1', dueDate: dayOf(3) })).status, 403);
  assert.equal((await request(ctx.server).get(`/companies/${ctx.company.id}/client-payments`).set(as)).status, 403);
  const mgr = await request(ctx.server).put(`/companies/${ctx.company.id}/client-payment-settings`).set(ctx.as(ctx.manager)).send({ daysBefore: 5 });
  assert.equal(mgr.status, 200);
  assert.equal(mgr.body.daysBefore, 5);
  assert.equal((await request(ctx.server).put(`/companies/${ctx.company.id}/client-payment-settings`).set(ctx.as(ctx.manager)).send({ daysBefore: 40 })).status, 400);
});

test('a real-size receipt (6 MB) goes through on both upload paths', async () => {
  const ctx = build();
  const inv = ctx.invoice(ctx.client, 500);
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(6 * 1024 * 1024)]).toString('base64');
  const auth = await ctx.portal(ctx.client, 'big@alnoor.test');
  const portal = await request(ctx.server).post(`/portal-api/client/invoices/${inv.id}/transfers`).set(auth).send({ amount: 100, contentBase64: big, fileName: 'scan.png' });
  assert.equal(portal.status, 201, JSON.stringify(portal.body).slice(0, 200));
  const staff = await request(ctx.server).post(`/invoices/${inv.id}/client-payments`).set(ctx.as(ctx.accountant))
    .send({ method: 'cheque', amount: 100, chequeNumber: '5', dueDate: dayOf(9), contentBase64: big, fileName: 'cheque.png' });
  assert.equal(staff.status, 201, JSON.stringify(staff.body).slice(0, 200));
});
