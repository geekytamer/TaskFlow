const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

// A payment's method and note are optional in its type; leaving them out must not crash.
test('a payment can be recorded without a method or a note', () => {
  const store = new DataStore({ dbPath: path.join(makeTmpDir('taskflow-payments-'), 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Co', website: '', address: '' });
  const client = store.createContact({ companyId: company.id, kind: 'Organization', name: 'Client', roles: ['Client'] });
  const invoice = store.createInvoice({
    companyId: company.id, clientId: client.id, contactId: client.id, status: 'Sent', total: 100,
    issueDate: new Date(), dueDate: new Date(Date.now() + 864e5),
    lineItems: [{ description: 'Work', quantity: 1, unitPrice: 100, amount: 100, itemType: 'Manual' }],
  });
  const payment = store.createPayment({ invoiceId: invoice.id, amount: 40, paidAt: new Date() });
  assert.equal(payment.amount, 40);
  const saved = store.listPayments(invoice.id)[0];
  assert.equal(saved.method, null);
  assert.equal(saved.note, null);
  assert.equal(store.getInvoiceById(invoice.id).paidAmount, 40);
});
