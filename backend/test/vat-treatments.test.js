const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { invoiceVat } = require('../dist/finance/vat');
const { makeTmpDir } = require('./helpers/tmp');

/**
 * VAT per invoice line: standard lines carry the rate, zero-rated, exempt and
 * out-of-scope lines carry none. The document, the ledger and the return
 * agree, credit notes reverse VAT in the invoice's own proportion, and the
 * return breaks sales and purchases down by treatment.
 */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-vat-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const manager = store.listUsers().find((u) => u.email === 'samantha.b@innovatecorp.com');
  const as = (req) => req.set('Authorization', `Bearer ${store.issueToken(manager.id)}`);
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: '1' });
  const account = (code) => store.listLedgerAccounts('1').find((a) => a.code === code);
  const movement = (code, sign = 1) => store.listJournalEntries('1', 10000).flatMap((e) => e.lines).filter((l) => l.accountId === account(code).id)
    .reduce((s, l) => s + sign * (l.credit - l.debit), 0);
  return { app, store, as, client, movement };
}

const line = (description, amount, vatTreatment) => ({ itemType: 'Manual', description, quantity: 1, unitPrice: amount, amount, ...(vatTreatment ? { vatTreatment } : {}) });

test('only standard-rated lines carry VAT; a line without a treatment is standard', () => {
  const v = invoiceVat([{ amount: 1000 }, { amount: 200, vatTreatment: 'zero' }, { amount: 100, vatTreatment: 'exempt' }, { amount: 50, vatTreatment: 'out_of_scope' }], 5);
  assert.deepEqual(v, { net: 1350, tax: 50, gross: 1400, byTreatment: { standard: 1000, zero: 200, exempt: 100, out_of_scope: 50 } });
});

test('a mixed invoice totals, posts and credits its VAT correctly; the return breaks it down', async () => {
  const { app, store, as, client, movement } = setup();
  const vatBefore = movement('2200');
  const revenueBefore = movement('4000');
  const res = await as(request(app).post('/invoices')).send({
    companyId: '1', clientId: client.id, issueDate: '2026-02-10', dueDate: '2026-03-10', status: 'Sent', taxRate: 5,
    lineItems: [line('Event catering', 1000), line('Fresh dates (basic food)', 200, 'zero'), line('Delivery abroad', 100, 'out_of_scope')],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.total, 1350, '1300 net + 5% of the 1000 standard line');
  assert.equal(res.body.lineItems[1].vatTreatment, 'zero', 'kept on the line');
  assert.equal(Math.round((movement('2200') - vatBefore) * 100) / 100, 50, 'output VAT posted: 50');
  assert.equal(Math.round((movement('4000') - revenueBefore) * 100) / 100, 1300);

  // Crediting a tenth of the invoice reverses a tenth of its VAT, not 5% of the credit.
  const credit = await as(request(app).post('/companies/1/credit-notes')).send({ invoiceId: res.body.id, issueDate: '2026-02-20', lineItems: [{ description: 'Discount', amount: 135 }] });
  assert.ok([200, 201].includes(credit.status), JSON.stringify(credit.body));
  assert.equal(Math.round((movement('2200') - vatBefore) * 100) / 100, 45);

  const supplier = store.createSupplier({ companyId: '1', name: 'Nakheel Farms', email: 'n@x.example' });
  const bill = await as(request(app).post('/companies/1/finance/vendor-bills')).send({ vendorName: 'Nakheel Farms', supplierId: supplier.id, issueDate: '2026-02-12', dueDate: '2026-03-12', amount: 525, taxRate: 5, status: 'Approved' });
  assert.ok([200, 201].includes(bill.status), JSON.stringify(bill.body));
  const exemptBill = await as(request(app).post('/companies/1/finance/vendor-bills')).send({ vendorName: 'Nakheel Farms', supplierId: supplier.id, referenceInvoiceNumber: 'NF-2', issueDate: '2026-02-13', dueDate: '2026-03-13', amount: 80, taxRate: 0, vatTreatment: 'exempt', status: 'Approved' });
  assert.ok([200, 201].includes(exemptBill.status), JSON.stringify(exemptBill.body));

  const preview = store.computeVatFigures('1', new Date('2026-02-01T00:00:00Z'), new Date('2026-02-28T23:59:59Z'));
  const b = preview.breakdown;
  assert.deepEqual(b.sales, { standard: 900, zero: 180, exempt: 0, out_of_scope: 90 }, 'net of the credit, in the invoice’s proportions');
  assert.equal(b.salesVat, 45);
  assert.deepEqual(b.purchases, { standard: 500, zero: 0, exempt: 80, out_of_scope: 0, unstated: 0 });
  assert.equal(b.purchasesVat, 25);
  assert.equal(b.outputVatGap, 0, 'the ledger agrees with the documents');
  assert.equal(b.inputVatGap, 0);
  assert.equal(preview.taxableSales, 1080, 'standard + zero-rated supplies');
  assert.equal(preview.taxablePurchases, 500);
  assert.equal(preview.netVat, 20);

  const filed = store.fileVatReturn('1', new Date('2026-02-01T00:00:00Z'), new Date('2026-02-28T23:59:59Z'));
  assert.deepEqual(filed.breakdown.sales, b.sales, 'the breakdown is kept with the return');
});

test('an invalid VAT treatment is refused', async () => {
  const { app, as, client } = setup();
  const res = await as(request(app).post('/invoices')).send({
    companyId: '1', clientId: client.id, issueDate: '2026-02-10', dueDate: '2026-03-10', status: 'Draft', taxRate: 5,
    lineItems: [line('Catering', 100, 'half')],
  });
  assert.equal(res.status, 400);
});
