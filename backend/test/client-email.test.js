const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { setEmailTransport } = require('../dist/email');
const { sweepClientReminders } = require('../dist/finance/client-email');
const { makeTmpDir } = require('./helpers/tmp');

/** Invoices emailed to clients on request, and overdue reminders once per stage when a company turns them on. */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-mail-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  const outbox = [];
  setEmailTransport(async (m) => { outbox.push(m); return { sent: true }; });
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'accounts@alnoor.example', address: 'Muscat', companyId: '1' });
  const invoice = (status, daysOverdue) => store.createInvoice({
    companyId: '1', clientId: client.id, issueDate: new Date(Date.now() - (daysOverdue + 30) * 86400_000), dueDate: new Date(Date.now() - daysOverdue * 86400_000),
    status, total: 0, lineItems: [{ itemType: 'Manual', description: 'Dates', quantity: 1, unitPrice: 100, amount: 100 }],
  });
  return { app, store, as, outbox, client, invoice };
}

test.after(() => setEmailTransport(null));

test('an issued invoice is emailed to its client with a link; drafts and practice companies are not', async () => {
  const { app, store, as, outbox, invoice } = setup();
  const sent = invoice('Sent', -10);
  const res = await as(request(app).post(`/invoices/${sent.id}/email`)).send({ message: 'Thank you for the Ramadan order.' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'accounts@alnoor.example');
  assert.match(outbox[0].subject, new RegExp(sent.invoiceNumber));
  assert.match(outbox[0].html, new RegExp(`/invoice/${sent.id}`));
  assert.match(outbox[0].html, /Ramadan order/);
  assert.equal((await as(request(app).post(`/invoices/${invoice('Draft', -10).id}/email`)).send({})).status, 409, 'a draft is not emailed');
  assert.equal((await as(request(app).post(`/invoices/${sent.id}/email`)).send({ to: 'not-an-email' })).status, 400);

  setEmailTransport(async () => ({ sent: false, error: 'provider down' }));
  const down = await as(request(app).post(`/invoices/${sent.id}/email`)).send({});
  assert.equal(down.status, 409);
  assert.equal(typeof down.body.emailConfigured, 'boolean', 'a provider failure says whether email is set up');
  setEmailTransport(async (m) => { outbox.push(m); return { sent: true }; });

  store.academy.markTraining('1', 'nobody');
  const practice = await as(request(app).post(`/invoices/${sent.id}/email`)).send({});
  assert.equal(practice.status, 409, 'a practice company never emails');
  assert.match(practice.body.message, /practice company/);
  assert.equal(practice.body.emailConfigured, undefined, 'a refusal does not blame the email setup');

});

test('overdue reminders go once per stage, only the latest stage reached, and only when turned on', async () => {
  const { app, store, as, outbox, invoice } = setup();
  const eightDays = invoice('Sent', 8);
  const fortyDays = invoice('Overdue', 40);
  invoice('Sent', -5);
  await sweepClientReminders(store);
  assert.equal(outbox.length, 0, 'off by default');

  const set = await as(request(app).put('/companies/1/client-reminders')).send({ enabled: true });
  assert.deepEqual(set.body.days, [1, 7, 14, 30]);
  assert.equal(await sweepClientReminders(store), 2);
  assert.deepEqual(store.clientEmail.sent(eightDays.id).map((s) => s.stage), [7], 'the 7-day reminder, not the 1-day one late');
  assert.deepEqual(store.clientEmail.sent(fortyDays.id).map((s) => s.stage), [30]);
  assert.equal(await sweepClientReminders(store), 0, 'once');
  // Changing the schedule never sends an earlier reminder after a later one.
  await as(request(app).put('/companies/1/client-reminders')).send({ enabled: true, days: [1, 7, 14] });
  assert.equal(await sweepClientReminders(store), 0, 'the 40-day invoice already had its 30-day reminder');
  await as(request(app).put('/companies/1/client-reminders')).send({ enabled: true });

  // A failed send is retried next time.
  const late = invoice('Sent', 15);
  setEmailTransport(async () => ({ sent: false, error: 'provider down' }));
  assert.equal(await sweepClientReminders(store), 0);
  assert.deepEqual(store.clientEmail.sent(late.id), []);
  setEmailTransport(async (m) => { outbox.push(m); return { sent: true }; });
  assert.equal(await sweepClientReminders(store), 1);

  // Paid invoices stop.
  store.createPayment({ invoiceId: eightDays.id, amount: 100, method: 'Bank Transfer', paidAt: new Date() });
  assert.equal(await sweepClientReminders(store, new Date(Date.now() + 10 * 86400_000)), 1, 'the paid one stops; the one that was not yet due is now 5 days late');
});
