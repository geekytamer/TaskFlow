const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { parseCsv, parseAmount, parseDate } = require('../dist/finance/bank-reconciliation');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Bank reconciliation: a statement is imported, its lines matched to ledger
 * lines on the bank account (automatically when unambiguous), the rest posted
 * or ignored, and it reconciles only when its closing balance agrees.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-bank-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  const account = (code) => store.listLedgerAccounts('1').find((a) => a.code === code);
  return { app, store, as, bank: account('1010'), revenue: account('4000'), expense: account('5000') };
}

/** A posted entry moving `amount` in (+) or out (-) of the bank on `date`. */
function post(store, bank, other, date, amount, memo) {
  return store.createJournalEntry({
    companyId: '1', sourceType: 'manual', memo, entryDate: new Date(`${date}T12:00:00Z`),
    lines: amount > 0
      ? [{ accountId: bank.id, debit: amount, credit: 0 }, { accountId: other.id, debit: 0, credit: amount }]
      : [{ accountId: other.id, debit: -amount, credit: 0 }, { accountId: bank.id, debit: 0, credit: -amount }],
  });
}

test('reading statements: quoted CSV, amounts with separators or brackets, three date formats', () => {
  assert.deepEqual(parseCsv('Date,Desc,Amount\r\n2026-09-01,"Al Noor, Hotel ""Iftar""",1200\n\n'), [['Date', 'Desc', 'Amount'], ['2026-09-01', 'Al Noor, Hotel "Iftar"', '1200']]);
  assert.equal(parseAmount('1,234.50'), 1234.5);
  assert.equal(parseAmount('(85.00)'), -85);
  assert.equal(parseAmount('-12'), -12);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.equal(parseDate('2026-09-03', 'YYYY-MM-DD'), '2026-09-03');
  assert.equal(parseDate('03/09/2026', 'DD/MM/YYYY'), '2026-09-03');
  assert.equal(parseDate('09/03/2026', 'MM/DD/YYYY'), '2026-09-03');
  assert.equal(parseDate('31/02/2026', 'DD/MM/YYYY'), null, 'no 31 February');
});

test('lines match the ledger automatically when unambiguous; the rest are matched, posted or ignored; then it reconciles', async () => {
  const { app, store, as, bank, revenue, expense } = setup();
  const opening = store.bank.ledgerBalance('1', bank.id, '2026-08-31');
  post(store, bank, revenue, '2026-09-02', 1200, 'Al Noor Hotel paid');
  post(store, bank, expense, '2026-09-05', -85, 'Electricity');
  post(store, bank, revenue, '2026-09-10', 300, 'Walk-in A');
  const walkInB = post(store, bank, revenue, '2026-09-12', 300, 'Walk-in B');

  const csv = [
    'Date,Details,Money in,Money out,Ref',
    '01/09/2026,AL NOOR HOTEL,"1,200.00",,TT001',
    '05/09/2026,ELECTRICITY DEBIT,,85.00,DD77',
    '11/09/2026,CASH DEPOSIT,300.00,,',
    '20/09/2026,BANK CHARGES,,2.500,',
    '21/09/2026,DUPLICATE ROW,,1.000,',
  ].join('\n');
  // What the bank really holds: walk-in B was recorded but never banked.
  const closing = Math.round((opening + 1200 - 85 + 300 - 2.5) * 1000) / 1000;
  const created = await as(request(app).post('/companies/1/bank-statements')).send({
    accountId: bank.id, csv, dateFormat: 'DD/MM/YYYY', columns: { date: 0, description: 1, moneyIn: 2, moneyOut: 3, reference: 4 }, closingBalance: closing,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const s = created.body;
  assert.equal(s.lines.length, 5);
  assert.equal(s.autoMatched, 2, 'the hotel and the electricity');
  const byDesc = (body, d) => body.lines.find((l) => l.description === d);
  // 300 on the 11th: the 10th is one day away, the 12th one day too. Ambiguous: offered, not chosen.
  const deposit = byDesc(s, 'CASH DEPOSIT');
  assert.equal(deposit.journalLineId, null);
  assert.equal(deposit.candidates.length, 2);

  const reconcileTooSoon = await as(request(app).post(`/bank-statements/${s.id}/reconcile`)).send({});
  assert.equal(reconcileTooSoon.status, 409);
  assert.match(reconcileTooSoon.body.message, /3 line/);

  let view = (await as(request(app).post(`/bank-statements/${s.id}/lines/${deposit.id}/match`)).send({ journalLineId: deposit.candidates[1].journalLineId })).body;
  assert.ok(byDesc(view, 'CASH DEPOSIT').journalLineId);
  const fees = byDesc(view, 'BANK CHARGES');
  const expenseBefore = store.bank.ledgerBalance('1', expense.id, '2026-12-31');
  view = (await as(request(app).post(`/bank-statements/${s.id}/lines/${fees.id}/entry`)).send({ accountId: expense.id, memo: 'Bank charges September' })).body;
  assert.ok(byDesc(view, 'BANK CHARGES').journalLineId, 'posted and matched');
  assert.equal(Math.round((store.bank.ledgerBalance('1', expense.id, '2026-12-31') - expenseBefore) * 1000) / 1000, 2.5);
  view = (await as(request(app).post(`/bank-statements/${s.id}/lines/${byDesc(view, 'DUPLICATE ROW').id}/ignore`)).send({})).body;

  // The other walk-in was never banked, so the ledger is 300 above the statement.
  assert.equal(view.check.openLines, 0);
  assert.equal(view.check.difference, -300);
  const off = await as(request(app).post(`/bank-statements/${s.id}/reconcile`)).send({});
  assert.equal(off.status, 409);
  assert.match(off.body.message, /closes at/);

  // Correct the ledger (walk-in B never happened) and it reconciles.
  store.reverseJournalEntry(walkInB.id, { entryDate: new Date('2026-09-12T13:00:00Z'), reason: 'Never banked' });
  const done = await as(request(app).post(`/bank-statements/${s.id}/reconcile`)).send({});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.status, 'reconciled');
  assert.equal((await as(request(app).delete(`/bank-statements/${s.id}/lines/${deposit.id}/match`))).status, 409, 'reconciled statements are fixed');
  assert.equal((await as(request(app).post(`/bank-statements/${s.id}/reconcile`)).send({ reopen: true })).body.status, 'open');
});

test('a ledger line is matched once; only lines on this account and amount; other companies are refused', async () => {
  const { app, store, as, bank, revenue } = setup();
  const entry = post(store, bank, revenue, '2026-09-02', 500, 'Payment');
  const bankLine = entry.lines.find((l) => l.accountId === bank.id);
  const revenueLine = entry.lines.find((l) => l.accountId === revenue.id);
  post(store, bank, revenue, '2026-08-01', 777, 'A month earlier');
  const csv = 'Date,Desc,Amount\n2026-09-02,PAYMENT A,500\n2026-09-02,PAYMENT B,500\n2026-09-02,SAME AMOUNT A MONTH LATER,777\n';
  const s = (await as(request(app).post('/companies/1/bank-statements')).send({ accountId: bank.id, csv, columns: { date: 0, description: 1, amount: 2 } })).body;
  const [a, b] = s.lines;
  assert.equal(s.autoMatched, 1, 'one ledger line, two statement lines: only the first takes it');
  assert.deepEqual(s.lines.find((l) => l.amount === 777).candidates, [], 'a month away is not offered');
  const second = s.lines.find((l) => !l.journalLineId);
  assert.equal((await as(request(app).post(`/bank-statements/${s.id}/lines/${second.id}/match`)).send({ journalLineId: bankLine.id })).status, 409, 'already matched');
  assert.equal((await as(request(app).post(`/bank-statements/${s.id}/lines/${second.id}/match`)).send({ journalLineId: revenueLine.id })).status, 400, 'not the bank account');
  assert.ok(a && b);

  const bad = await as(request(app).post('/companies/1/bank-statements')).send({ accountId: bank.id, csv: 'Date,Desc,Amount\nyesterday,X,5\n', columns: { date: 0, description: 1, amount: 2 } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /Row 2/);
  const other = store.listUsers().find((u) => u.email === 'dana.s@synergysolutions.com');
  const foreign = await request(app).get(`/bank-statements/${s.id}`).set('Authorization', `Bearer ${store.issueToken(other.id)}`);
  assert.equal(foreign.status, 403);
});
