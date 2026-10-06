const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

/** The dashboard leads with what needs attention, for the people whose work it is. */

function setup() {
  const dbPath = path.join(makeTmpDir('taskflow-attention-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
  }).listen(0);
  app.unref();
  const mk = (role, email) => store.createUser({ name: `${role} ${email}`, email, password: 'Password1!', role, companyIds: ['1'], companyRoles: [{ companyId: '1', role }] });
  const manager = mk('Manager', 'mgr@x.example');
  const accountant = mk('Accountant', 'acc@x.example');
  const employee = mk('Employee', 'emp@x.example');
  const ids = async (u) => (await request(app).get('/companies/1/dashboard').set('Authorization', `Bearer ${store.issueToken(u.id)}`)).body.alerts.map((a) => a.id);
  return { app, store, manager, accountant, employee, ids };
}

test('approvals, late shipments, QC, excursions, failed recurring runs and open statements surface for the right people', async () => {
  const { store, manager, accountant, employee, ids } = setup();
  for (const u of [manager, accountant, employee]) assert.ok(!(await ids(u)).some((id) => id.startsWith('attention-')), 'nothing yet');

  store.approvals.setRules('1', 'expense', [{ minAmount: 100, approverRole: 'Manager' }]);
  store.createExpense({ companyId: '1', category: 'Generator repair', amount: 300 });
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const shipment = store.shipments.insert({ companyId: '1', direction: 'import', mode: 'sea', carrier: null, containers: [], origin: null, destination: null, etd: null, eta: yesterday, purchaseOrderId: null, salesOrderId: null, documents: [], notes: null });
  const item = store.createInventoryItem({ companyId: '1', name: 'Frozen fries', category: 'Frozen', unit: 'bag', unitCost: 1, requiresQc: true });
  const freezer = store.createWarehouse({ companyId: '1', name: 'Freezer 1' });
  store.createInventoryLot({ companyId: '1', inventoryItemId: item.id, lotNumber: 'Q-1', quantity: 5, location: 'Freezer 1' });
  store.coldChain.setConditions({ warehouseId: freezer.id, companyId: '1', tempMin: -25, tempMax: -18, humidityMax: null, readingIntervalHours: 12 });
  store.coldChain.insertReading({ companyId: '1', warehouseId: freezer.id, recordedAt: new Date().toISOString(), temperature: -5, humidity: null, excursion: true, note: null, recordedByName: null });
  const bank = store.listLedgerAccounts('1').find((a) => a.code === '1010');
  store.bank.insert({ companyId: '1', accountId: bank.id, name: 'Sept', periodStart: '2026-09-01', periodEnd: '2026-09-30', openingBalance: null, closingBalance: null }, [{ date: '2026-09-02', description: 'X', reference: null, amount: 5 }]);
  const supplier = store.createSupplier({ companyId: '1', name: 'Landlord', email: 'l@x.example' });
  const rent = store.recurring.create({ companyId: '1', kind: 'bill', name: 'Rent', partyId: supplier.id, content: { amount: 600 }, frequency: 'monthly', startDate: yesterday, endDate: null, mode: 'draft', paymentTermsDays: 30, createdByUserId: manager.id });
  store.recurring.claim(rent.id, yesterday);
  store.recurring.finish(rent.id, yesterday, 'failed', null, 'Locked period');

  const forManager = await ids(manager);
  for (const id of ['attention-approvals', 'attention-shipments', 'attention-qc', 'attention-cold']) assert.ok(forManager.includes(id), `${id} for the manager`);
  assert.ok(!forManager.includes('attention-bank') && !forManager.includes('attention-recurring'), 'finance items are for finance');
  assert.equal(forManager[0].startsWith('attention-'), true, 'they come first');

  const forAccountant = await ids(accountant);
  for (const id of ['attention-recurring', 'attention-bank']) assert.ok(forAccountant.includes(id), `${id} for the accountant`);
  assert.ok(!forAccountant.includes('attention-approvals'), 'the expense needs a manager');
  assert.ok(!forAccountant.includes('attention-shipments'));

  assert.ok(!(await ids(employee)).some((id) => id.startsWith('attention-')), 'an employee sees none of it');
  void shipment;
});
