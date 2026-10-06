const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { schedule } = require('../dist/finance/fixed-assets');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * Fixed assets: straight-line monthly depreciation posted on request, once per
 * asset-month, and disposal with the gain or loss.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-assets-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  const account = (code) => store.listLedgerAccounts('1').find((a) => a.code === code);
  const balance = (code) => store.listJournalEntries('1', 10000).flatMap((e) => e.lines).filter((l) => l.accountId === account(code).id)
    .reduce((s, l) => s + l.debit - l.credit, 0);
  return { app, store, as, account, balance: (code) => Math.round(balance(code) * 1000) / 1000 };
}

test('the schedule spreads cost less salvage evenly; the last month takes the rounding', () => {
  const rows = schedule({ cost: 1000, salvageValue: 0, acquiredOn: '2026-01-15', usefulLifeMonths: 3 });
  assert.deepEqual(rows, [{ period: '2026-01', amount: 333.333 }, { period: '2026-02', amount: 333.333 }, { period: '2026-03', amount: 333.334 }]);
  assert.equal(schedule({ cost: 500, salvageValue: 500, acquiredOn: '2026-01-01', usefulLifeMonths: 12 }).length, 0, 'nothing to depreciate');
});

test('buying, depreciating month by month once, and selling at a gain', async () => {
  const { app, store, as, account, balance } = setup();
  const before = { equipment: balance('1500'), bank: balance('1010'), accumulated: balance('1590'), expense: balance('5600'), gain: balance('4200') };
  const res = await as(request(app).post('/companies/1/fixed-assets')).send({
    name: 'Delivery van', category: 'Vehicles', assetAccountId: account('1500').id, paidFromAccountId: account('1010').id,
    cost: 12000, salvageValue: 2400, acquiredOn: '2026-01-10', usefulLifeMonths: 48,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.monthly, 200, '(12000 − 2400) / 48');
  assert.equal(balance('1500') - before.equipment, 12000);
  assert.equal(balance('1010') - before.bank, -12000);

  const run = await as(request(app).post('/companies/1/fixed-assets/depreciation')).send({ through: '2026-03' });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.deepEqual(run.body.posted.map((p) => p.period), ['2026-01', '2026-02', '2026-03']);
  assert.equal(balance('5600') - before.expense, 600);
  assert.equal(balance('1590') - before.accumulated, -600);
  assert.deepEqual((await as(request(app).post('/companies/1/fixed-assets/depreciation')).send({ through: '2026-03' })).body.posted, [], 'once');
  assert.equal((await as(request(app).post('/companies/1/fixed-assets/depreciation')).send({ through: '2099-01' })).status, 400, 'not the future');

  const edit = await as(request(app).put(`/fixed-assets/${res.body.id}`)).send({ cost: 13000 });
  assert.equal(edit.status, 409, 'figures are fixed once posted');
  assert.equal((await as(request(app).put(`/fixed-assets/${res.body.id}`)).send({ name: 'Delivery van (white)' })).status, 200);
  assert.equal((await as(request(app).delete(`/fixed-assets/${res.body.id}`))).status, 409, 'dispose of it instead');

  // Sold in June for 12,000: April and May depreciate first, leaving a book value of 11,000, so a 1,000 gain.
  const sold = await as(request(app).post(`/fixed-assets/${res.body.id}/disposal`)).send({ disposedOn: '2026-06-05', proceeds: 12000, depositAccountId: account('1010').id });
  assert.equal(sold.status, 200, JSON.stringify(sold.body));
  assert.equal(sold.body.status, 'disposed');
  assert.equal(sold.body.depreciatedThrough, '2026-05');
  assert.equal(sold.body.bookValue, 11000);
  assert.equal(balance('1500'), before.equipment, 'cost removed');
  assert.equal(balance('1590'), before.accumulated, 'accumulated depreciation cleared');
  assert.equal(balance('4200') - before.gain, -1000, 'a gain is a credit to other revenue');
  assert.equal((await as(request(app).post(`/fixed-assets/${res.body.id}/disposal`)).send({ disposedOn: '2026-06-05' })).status, 409, 'once');
});

test('scrapping below book value is a loss; a locked month is skipped and reported', async () => {
  const { app, store, as, account, balance } = setup();
  const lossBefore = balance('5960');
  const asset = (await as(request(app).post('/companies/1/fixed-assets')).send({
    name: 'Office printer', assetAccountId: account('1510').id, cost: 600, acquiredOn: '2026-01-01', usefulLifeMonths: 12,
  })).body;
  assert.equal(balance('1510'), 0, 'already in the books: nothing posted for the purchase');
  store.updateCompanyFinanceSettings('1', { lockedThroughDate: new Date('2026-02-28T23:59:59Z') });
  const run = (await as(request(app).post('/companies/1/fixed-assets/depreciation')).send({ through: '2026-04' })).body;
  assert.deepEqual(run.posted.map((p) => p.period), ['2026-03', '2026-04']);
  assert.deepEqual(run.skipped.map((p) => p.period), ['2026-01', '2026-02']);
  assert.equal((await as(request(app).post(`/fixed-assets/${asset.id}/disposal`)).send({ disposedOn: '2026-05-10' })).status, 409, 'the locked months block disposal: book value would be wrong');

  store.updateCompanyFinanceSettings('1', { lockedThroughDate: null });
  const scrapped = await as(request(app).post(`/fixed-assets/${asset.id}/disposal`)).send({ disposedOn: '2026-05-10' });
  assert.equal(scrapped.status, 200, JSON.stringify(scrapped.body));
  assert.equal(scrapped.body.bookValue, 400, '600 − 4 months × 50');
  assert.equal(balance('5960') - lossBefore, 400, 'the book value is lost');

  const other = store.listUsers().find((u) => u.email === 'dana.s@synergysolutions.com');
  const foreign = await request(app).get('/companies/1/fixed-assets').set('Authorization', `Bearer ${store.issueToken(other.id)}`);
  assert.equal(foreign.status, 403);
});
