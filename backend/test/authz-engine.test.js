const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { ROUTES, routeDecl } = require('../dist/authz/route-registry');
const { isPermissionKey, areaOf } = require('../dist/authz/catalogue');
const { effectiveLegacy } = require('../dist/authz/evaluate');
const { parseEngine, ruleAllowsV2, askSentence, NOTIFY_KEYS } = require('../dist/authz/engine');
const { RECORD_RULES } = require('../dist/permissions/record-rules');
const { makeTmpDir } = require('./helpers/tmp');

const ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'];
const quiet = { info() {}, warn() {}, error() {} };

const build = (engine, { routeLookup, logger = quiet } = {}) => {
  const dbPath = path.join(makeTmpDir(`taskflow-engine-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Acme', website: '', address: '' });
  const users = {};
  for (const role of ROLES) {
    users[role] = store.createUser({
      name: role, email: `${role.toLowerCase()}@engine.test`, role,
      companyIds: [company.id], companyRoles: [{ companyId: company.id, role }], password: 'x',
    });
  }
  // The portal company, so the games, Discover and portal staff routers are mounted.
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger,
    portalCompanyId: company.id,
    permissionsEngine: engine,
    ...(routeLookup ? { routeLookup } : {}),
  });
  const server = app.listen(0);
  server.unref();
  const token = (user) => store.issueToken(user.id);
  return { store, company, users, token, agent: request.agent(server) };
};

const addOn = (store, companyId, userId, name, grants, fields = []) => {
  const role = store.authz.saveRole(companyId, { name, grants, fields }, null);
  const main = store.authz.assignments(userId, companyId).find((a) => a.isMain).roleId;
  store.authz.setAssignments(userId, companyId, { mainRoleId: main, addOnRoleIds: [role.id] }, null);
  return role;
};

// 40 company-level GET routes across as many areas as possible: one per area
// first, then the rest in registry order.
const SAMPLE = (() => {
  const candidates = ROUTES.filter((r) => r.method === 'GET'
    && /^\/companies\/:companyId\/[a-z-]+$/.test(r.path)
    && isPermissionKey(r.permission) && r.legacyRoles);
  const picked = [];
  const areas = new Set();
  for (const r of candidates) if (!areas.has(areaOf(r.permission))) { areas.add(areaOf(r.permission)); picked.push(r); }
  for (const r of candidates) if (picked.length < 40 && !picked.includes(r)) picked.push(r);
  return picked.slice(0, 40);
})();

test('PERMISSIONS_ENGINE parses legacy, shadow and v2, defaults to legacy and rejects anything else', () => {
  assert.equal(parseEngine(undefined), 'legacy');
  assert.equal(parseEngine(''), 'legacy');
  assert.equal(parseEngine('shadow'), 'shadow');
  assert.equal(parseEngine('v2'), 'v2');
  assert.throws(() => parseEngine('openfga'), /PERMISSIONS_ENGINE/);
  assert.throws(() => parseEngine('wide-open'), /PERMISSIONS_ENGINE/);
});

test('the three engines answer 40 routes identically for the four roles', async () => {
  assert.equal(SAMPLE.length, 40);
  assert.ok(new Set(SAMPLE.map((r) => areaOf(r.permission))).size >= 15, 'sample spans the areas');
  const outcomes = {};
  for (const engine of ['legacy', 'shadow', 'v2']) {
    const world = build(engine);
    for (const route of SAMPLE) {
      for (const role of ROLES) {
        const url = route.path.replace(':companyId', world.company.id);
        const res = await world.agent.get(url).set('Authorization', `Bearer ${world.token(world.users[role])}`);
        (outcomes[engine] ??= {})[`${route.path} | ${role}`] = res.status === 403 ? 'denied' : 'allowed';
      }
    }
    if (engine === 'shadow') assert.deepEqual(world.store.listAuthzDivergences(), [], 'system roles never diverge');
  }
  const expected = {};
  for (const route of SAMPLE) for (const role of ROLES) {
    expected[`${route.path} | ${role}`] = route.legacyRoles.includes(role) ? 'allowed' : 'denied';
  }
  assert.deepEqual(outcomes.legacy, expected);
  assert.deepEqual(outcomes.shadow, expected);
  assert.deepEqual(outcomes.v2, expected);
});

test('shadow: legacy decides and an add-on the roles do not give is written to authz_divergence', async () => {
  const { store, company, users, token, agent } = build('shadow');
  addOn(store, company.id, users.Employee.id, 'Sales viewer', [{ key: 'sales.view' }]);
  const res = await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Employee)}`);
  assert.equal(res.status, 403);
  const rows = store.listAuthzDivergences();
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { userId: rows[0].userId, companyId: rows[0].companyId, route: rows[0].route, module: rows[0].module, action: rows[0].action, legacy: rows[0].legacyAllowed, v2: rows[0].openfgaAllowed },
    { userId: users.Employee.id, companyId: company.id, route: 'GET /companies/:companyId/sales-orders', module: 'sales', action: 'view', legacy: 0, v2: 1 },
  );
  // The same disagreement again within the hour is not written twice.
  await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Employee)}`);
  assert.equal(store.listAuthzDivergences().length, 1);
});

test('v2 honours an add-on, and an inactive (unreviewed) one grants nothing', async () => {
  const { store, company, users, token, agent } = build('v2');
  const url = `/companies/${company.id}/sales-orders`;
  const auth = () => ['Authorization', `Bearer ${token(users.Employee)}`];
  assert.equal((await agent.get(url).set(...auth())).status, 403);
  const role = addOn(store, company.id, users.Employee.id, 'Sales viewer', [{ key: 'sales.view' }]);
  assert.equal((await agent.get(url).set(...auth())).status, 200);
  store.db.prepare('UPDATE permission_groups SET needsReview = 1 WHERE id = ?').run(role.id);
  store.bumpAuthzVersion();
  assert.equal((await agent.get(url).set(...auth())).status, 403);
});

test('v2 record rules: an add-on with company scope widens what the rule allows', async () => {
  const { store, company, users } = build('v2');
  const { effective } = require('../dist/authz/evaluate');
  assert.equal(ruleAllowsV2(effective(store, users.Employee.id), 'CRM_ALL_READ', company.id).allowed, false);
  addOn(store, company.id, users.Employee.id, 'All CRM', [{ key: 'crm.view', scope: 'company' }]);
  assert.equal(ruleAllowsV2(effective(store, users.Employee.id), 'CRM_ALL_READ', company.id).allowed, true);
});

test('every record rule answers under v2 exactly as its role list does, for each template', () => {
  const { store, company, users } = build('legacy');
  const { effective } = require('../dist/authz/evaluate');
  for (const [name, rule] of Object.entries(RECORD_RULES)) {
    for (const role of ROLES) {
      // effectiveLegacy (shadow/legacy read paths) and effective (v2: the
      // system role assignments written for each user) must both agree.
      for (const [label, eff] of [['legacy', effectiveLegacy(store, users[role].id)], ['v2', effective(store, users[role].id)]]) {
        const keys = 'keys' in rule.v2 ? rule.v2.keys : [undefined];
        for (const routeKey of keys) {
          assert.equal(ruleAllowsV2(eff, name, company.id, routeKey).allowed, rule.roles.includes(role), `${label} ${name} ${role} ${routeKey ?? ''}`);
        }
      }
    }
  }
});

test('an undeclared route is refused under v2 and logged as an error', async () => {
  const errors = [];
  const hidden = 'GET /companies/:companyId/sales-orders';
  const { company, users, token, agent } = build('v2', {
    routeLookup: (method, p) => (`${method} ${p}` === hidden ? undefined : routeDecl(method, p)),
    logger: { info() {}, warn() {}, error: (m) => errors.push(String(m)) },
  });
  const res = await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
  assert.ok(errors.some((e) => e.includes('undeclared') && e.includes('/companies/:companyId/sales-orders')), errors.join('\n'));
});

test('403 body: code, the declared permission and who can grant it', async () => {
  const v2 = build('v2');
  const res = await v2.agent.get(`/companies/${v2.company.id}/sales-orders`).set('Authorization', `Bearer ${v2.token(v2.users.Employee)}`);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { code: 'FORBIDDEN', permission: 'sales.view', roles: ['Admin', 'Manager', 'Accountant'], message: 'Ask an Admin, Manager or Accountant.' });

  const legacy = build('legacy');
  const old = await legacy.agent.get(`/companies/${legacy.company.id}/sales-orders`).set('Authorization', `Bearer ${legacy.token(legacy.users.Employee)}`);
  assert.equal(old.status, 403);
  assert.deepEqual(old.body, { code: 'FORBIDDEN', permission: 'sales.view', message: 'You do not have permission to perform this action.' });

  assert.equal(askSentence(['Admin', 'Manager']), 'Ask an Admin or Manager.');
  assert.equal(askSentence(['Manager']), 'Ask a Manager.');
});

test('notification recipients follow v2 grants, and every caller permission is mapped', () => {
  const { store, company, users } = build('v2');
  const before = store.listUserIdsWithPermission(company.id, 'invoices:read', ['Admin', 'Manager', 'Accountant']);
  assert.deepEqual(before.sort(), [users.Admin.id, users.Manager.id, users.Accountant.id].sort());
  addOn(store, company.id, users.Employee.id, 'Invoice reader', [{ key: 'invoices.view' }]);
  assert.ok(store.listUserIdsWithPermission(company.id, 'invoices:read', ['Admin', 'Manager', 'Accountant']).includes(users.Employee.id));

  const fs = require('node:fs');
  const src = path.join(__dirname, '..', 'src');
  const used = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/listUserIdsWithPermission\([^,]+,\s*'([^']+)'/g)) used.add(m[1]);
        if (/listUserIdsWithPermission\([^,]+,\s*`\$\{PRIVATE_READ/.test(fs.readFileSync(p, 'utf8'))) used.add('contacts:private.read');
      }
    }
  };
  walk(src);
  assert.ok(used.size >= 5);
  for (const permission of used) assert.ok(NOTIFY_KEYS[permission], `${permission} has no v2 key`);
});

test('/auth/permissions reports the engine', async () => {
  for (const engine of ['legacy', 'shadow', 'v2']) {
    const { company, users, token, agent } = build(engine);
    const res = await agent.get(`/auth/permissions?companyId=${company.id}`).set('Authorization', `Bearer ${token(users.Admin)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, engine);
  }
});

test('v2 handler checks: cancelling a sales order needs sales.cancel', async () => {
  const { store, company, users, token, agent } = build('v2');
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: company.id });
  const item = store.createInventoryItem({ companyId: company.id, name: 'Dates', category: 'Dates', sku: 'D1', unit: 'kg', unitPrice: 10, unitCost: 6, quantityOnHand: 50 });
  // A custom main role that edits sales but may not cancel them.
  const clerk = store.authz.saveRole(company.id, {
    name: 'Sales clerk', grants: [{ key: 'sales.view' }, { key: 'sales.create' }, { key: 'sales.edit' }], fields: [],
  }, null);
  store.authz.setAssignments(users.Employee.id, company.id, { mainRoleId: clerk.id, addOnRoleIds: [] }, null);
  const as = (req) => req.set('Authorization', `Bearer ${token(users.Employee)}`);
  const created = await as(agent.post(`/companies/${company.id}/sales-orders`)).send({
    clientId: client.id, orderDate: new Date().toISOString(), status: 'Draft',
    items: [{ inventoryItemId: item.id, description: 'Dates', quantity: 1, unitPrice: 10 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const cancel = await as(agent.patch(`/sales-orders/${created.body.id}/status`)).send({ status: 'Cancelled' });
  assert.equal(cancel.status, 403);
  assert.equal(cancel.body.permission, 'sales.cancel');
  assert.equal(cancel.body.message, 'Ask an Admin, Manager or Accountant.');
  const confirm = await as(agent.patch(`/sales-orders/${created.body.id}/status`)).send({ status: 'Confirmed' });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
});

test('v2 record rules at the gate: an add-on with crm.view at company scope opens someone else\'s CRM figures', async () => {
  for (const engine of ['legacy', 'v2']) {
    const { store, company, users, token, agent } = build(engine);
    const url = `/companies/${company.id}/crm-dashboard?ownerUserId=${users.Admin.id}`;
    const get = () => agent.get(url).set('Authorization', `Bearer ${token(users.Employee)}`);
    assert.equal((await get()).status, 403, `${engine}: an Employee sees only their own`);
    addOn(store, company.id, users.Employee.id, 'All CRM', [{ key: 'crm.view', scope: 'company' }]);
    assert.equal((await get()).status, engine === 'v2' ? 200 : 403, `${engine}: the add-on counts only under v2`);
  }
});

/**
 * One record of every resource a record route (`/<resource>/:id…`, company
 * not in the path) reads, created through the store in `company`, so those
 * routes find a record, learn its company and must decide their key there.
 * Keys are the path segment before the parameter; `sub:<segment>` is a
 * second parameter (a line, quote, payment, assignee… of the first record).
 */
const seedRecordPerResource = (store, company, userId) => {
  const at = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const user = store.getUserById(userId);
  const client = store.listClients(company)[0];
  const supplier = store.listSuppliers(company)[0];
  const item = store.listInventoryItems(company)[0];
  const warehouse = store.listWarehouses(company)[0];
  const account = store.listLedgerAccounts(company)[0];
  const contact = store.createContact({ companyId: company, name: 'Seed contact', roles: ['Client', 'Influencer'], ownerUserId: userId, ownerName: user.name, visibility: 'Public' });
  const opp = store.createOpportunity({ companyId: company, contactId: contact.id, ownerUserId: userId, ownerName: user.name, title: 'Seed opportunity', serviceType: 'General', stage: 'New', expectedRevenue: 100, probability: 50 });
  const proposal = store.createCrmProposal({ companyId: company, opportunityId: opp.id, title: 'Seed proposal', status: 'Draft', issueDate: new Date(), items: [] });
  const campaign = store.createCrmCampaign({ companyId: company, contactId: contact.id, opportunityId: opp.id, name: 'Seed campaign', status: 'Planned', visibility: 'Public', ownerUserId: userId, ownerName: user.name });
  const deliverable = store.createCampaignDeliverable({ companyId: company, campaignId: campaign.id, title: 'Seed reel', status: 'Planned', fulfillment: 'Internal', cost: 1 });
  const campaignAssignment = store.createCampaignAssignment({ companyId: company, campaignId: campaign.id, contactId: contact.id, role: 'Influencer', agreedRate: null, status: 'Confirmed', notes: null });
  const campaignExpense = store.createCampaignExpense({ companyId: company, campaignId: campaign.id, description: 'Seed expense', amount: 1, status: 'Approved', billable: false });
  const vendorRequest = store.createVendorRequest({ companyId: company, name: 'Seed vendor', role: 'Influencer', status: 'New', requestedByUserId: userId, requestedByName: user.name });
  const contribution = store.db.prepare('SELECT id FROM contributions WHERE sourceId = ?').get(opp.id); // the owner's, made with the opportunity
  const commissionRule = store.createCommissionRule({ companyId: company, serviceType: '', role: 'Contributor', basis: 'Revenue', rateType: 'Percent', rate: 10 });
  const commissionId = 'seed-commission';
  store.db.prepare(`INSERT INTO commissions (id, companyId, opportunityId, contactId, userId, userName, serviceType, basis, basisAmount, amount, status, calculatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 'General', 'revenue', 100, 7, 'Draft', ?)`).run(commissionId, company, opp.id, contact.id, userId, user.name, new Date().toISOString());
  const followup = store.createFollowup({ companyId: company, entityType: 'contact', entityId: contact.id, title: 'Seed follow-up', ownerUserId: userId, ownerName: user.name, dueAt: new Date() });
  store.addFollowupAssignee(followup.id, userId);

  const lines = [{ description: 'Seed line', quantity: 1, unitPrice: 10, inventoryItemId: item.id }];
  const order = store.createSalesOrder({ companyId: company, clientId: client.id, orderDate: new Date(), status: 'Confirmed', items: lines });
  const quotation = store.createQuotation({ companyId: company, clientId: client.id, issueDate: at(2026, 10, 1), validUntil: at(2026, 12, 1), items: lines });
  const invoice = store.createInvoice({ companyId: company, clientId: client.id, issueDate: new Date(), dueDate: new Date(), status: 'Sent', lineItems: [{ description: 'Seed', quantity: 1, unitPrice: 10, amount: 10, itemType: 'Manual' }] });
  const payment = store.createPayment({ invoiceId: invoice.id, amount: 1, method: 'Cash', paidAt: new Date() });
  const creditNote = store.createCreditNote({ companyId: company, invoiceId: invoice.id, lineItems: [{ description: 'Seed credit', amount: 1 }] });
  const bill = store.createVendorBill({ companyId: company, vendorName: supplier.name, amount: 50, issueDate: new Date(), dueDate: new Date(), status: 'Approved' });
  const billPayment = store.createVendorBillPayment({ billId: bill.id, amount: 1, paidAt: new Date(), method: 'Bank Transfer' });
  const delivery = store.createDelivery({ salesOrderId: order.id, items: [{ salesOrderLineIndex: 0, quantity: 1 }] });
  store.markDeliveryShipped(delivery.id);
  const customerReturn = store.createCustomerReturn({ companyId: company, deliveryId: delivery.id, items: [{ deliveryLineIndex: 0, quantity: 1 }] });
  const shipment = store.shipments.insert({ companyId: company, direction: 'import', mode: 'sea', carrier: null, containers: [], origin: null, destination: null, etd: null, eta: null, purchaseOrderId: null, salesOrderId: null, documents: [], notes: null });

  const rfq = store.addRfqQuote(store.createRfq(company, { title: 'Seed RFQ', items: [{ description: 'Dates', quantity: 1, unit: 'kg' }] }).id, { supplierName: supplier.name, totalAmount: 10 });
  const requisition = store.createPurchaseRequisition({ companyId: company, items: [{ description: 'Seed', quantity: 1, estimatedUnitCost: 1 }] });
  const stockCount = store.createStockCount(company);
  const output = store.createInventoryItem({ companyId: company, name: 'Seed box', category: 'Seed', unit: 'pc', unitCost: 1 });
  const recipe = store.createRecipe(company, { name: 'Seed recipe', outputItemId: output.id, outputQuantity: 1, components: [{ componentItemId: item.id, quantity: 1 }] });
  const workOrder = store.createWorkOrder(company, { recipeId: recipe.id, batches: 1 });
  const lot = store.createInventoryLot({ companyId: company, inventoryItemId: item.id, lotNumber: 'SEED-1', quantity: 1, location: warehouse.name });

  const docTemplate = store.createDocumentTemplate(company, { name: 'Seed template', type: 'letter', dataSource: 'none' });
  const invoiceTemplate = store.listInvoiceTemplates(company).find((t) => ['letter', 'memo', 'custom', 'quote', 'certificate', 'statement'].includes(t.docType));
  const document = store.createDocument(company, { templateId: (invoiceTemplate ?? docTemplate).id, title: 'Seed document', status: 'draft' });
  const attachment = store.createRecordAttachment({ companyId: company, entityType: 'contact', entityId: contact.id, fileName: 'a.txt', url: '', mimeType: 'text/plain', sizeBytes: 1 });

  const budget = store.createBudget({ companyId: company, name: 'Seed budget', fiscalYear: 2026, lines: [] });
  const vatReturn = store.fileVatReturn(company, at(2025, 1, 1), at(2025, 3, 31));
  const expense = store.createExpense({ companyId: company, category: 'Seed', amount: 1 });
  const recurring = store.recurring.create({ companyId: company, kind: 'invoice', name: 'Seed recurring', partyId: client.id, content: { lineItems: [] }, frequency: 'monthly', startDate: '2026-11-01', endDate: null, mode: 'draft', paymentTermsDays: 30, createdByUserId: userId });
  const asset = store.assets.insert({ companyId: company, name: 'Seed van', category: null, assetAccountId: account.id, cost: 100, salvageValue: 0, acquiredOn: '2026-01-01', usefulLifeMonths: 12, acquisitionEntryId: null, notes: null });
  const statement = store.bank.insert({ companyId: company, accountId: account.id, name: 'Seed statement', periodStart: '2026-01-01', periodEnd: '2026-01-31', openingBalance: 0, closingBalance: 0 }, [{ date: '2026-01-02', description: 'Seed', reference: '', amount: 1 }]);
  const statementLine = store.bank.lines(statement.id)[0];
  const journal = store.createJournalEntry({ companyId: company, sourceType: 'manual', sourceId: 'seed', memo: 'Seed', entryDate: new Date(), lines: [
    { id: 'seed-dr', accountId: account.id, description: 'Seed', debit: 1, credit: 0 },
    { id: 'seed-cr', accountId: store.listLedgerAccounts(company)[1].id, description: 'Seed', debit: 0, credit: 1 },
  ] });

  const department = store.createDepartment({ companyId: company, name: 'Seed department' });
  const employee = store.createEmployee({ companyId: company, userId: null, name: 'Seed employee' });
  const attendance = store.upsertAttendance({ companyId: company, employeeId: employee.id, date: '2026-10-01', status: 'Present', hours: 8 });
  const leaveType = store.createLeaveType({ companyId: company, name: 'Seed leave' });
  const leaveRequest = store.createLeaveRequest({ companyId: company, employeeId: employee.id, leaveTypeId: leaveType.id, startDate: '2026-11-01', endDate: '2026-11-02' });
  const payrollRun = store.createPayrollRun(company, '2026-09');

  const customField = store.createCustomFieldDefinition({ companyId: company, entityType: 'contact', label: 'Seed field', fieldType: 'text' });
  const [discoverProfile] = store.discover.addHandles(company, ['seed.handle']);
  const wsContact = store.workspace.addContact({ companyId: company, ownerContactId: contact.id }, { name: 'Seed brand', kind: 'brand' });

  return {
    'sales-orders': order.id, quotations: quotation.id, invoices: invoice.id, 'sub:payments': payment.id,
    'credit-notes': creditNote.id, 'vendor-bills': bill.id, deliveries: delivery.id, 'customer-returns': customerReturn.id,
    shipments: shipment.id, rfqs: rfq.id, 'sub:quotes': rfq.quotes[0].id, 'purchase-requisitions': requisition.id,
    'stock-counts': stockCount.id, recipes: recipe.id, 'work-orders': workOrder.id, 'inventory-lots': lot.id,
    'document-templates': docTemplate.id, documents: document.id, 'record-attachments': attachment.id,
    budgets: budget.id, 'vat-returns': vatReturn.id, expenses: expense.id, 'recurring-documents': recurring.id,
    'fixed-assets': asset.id, 'bank-statements': statement.id, 'sub:lines': statementLine.id, accounts: account.id,
    'journal-entries': journal.id, 'commission-rules': commissionRule.id, commissions: commissionId,
    departments: department.id, employees: employee.id, attendance: attendance.id, 'leave-types': leaveType.id,
    'leave-requests': leaveRequest.id, 'payroll-runs': payrollRun.id, followups: followup.id, 'sub:assignees': userId,
    opportunities: opp.id, proposals: proposal.id, 'vendor-requests': vendorRequest.id, contributions: contribution.id,
    contacts: contact.id, 'sub:roles': 'Client', 'sub:contacts': wsContact.id, campaigns: campaign.id,
    'campaign-deliverables': deliverable.id, 'campaign-assignments': campaignAssignment.id, 'campaign-expenses': campaignExpense.id,
    'discover-profiles': discoverProfile.id, 'custom-fields': customField.id, 'sub:members': userId,
    approvals: 'purchase_order', 'sub:approvals': 'po-1',
  };
};

/**
 * Routes that reject the test's body ({ companyId }) as invalid before they
 * decide the key. Nothing is read or written: each validates the body first.
 */
const EXPECTED_400 = new Map([
  ['POST /projects', 'name and visibility required; the company comes from the body'],
  ['POST /tasks', 'title and priority required; the company comes from the body'],
  ['POST /invoices', 'client, dates and lines required; the company comes from the body'],
  ['POST /users', 'name, email and companyRoles required; the companies come from the body'],
  ['POST /followups/:id/reschedule', 'nextActionDueDate is checked before the follow-up is loaded'],
]);

/**
 * Every route declared with a catalogue key is decided by that key under v2.
 *
 * A person whose only role grants nothing any route declares (a custom main
 * role holding dashboard.view_finance, a handler-checked key) calls every such
 * route against the demo data plus one seeded record of every resource a
 * record route reads (seedRecordPerResource), with that record's id in the
 * path. Three guarantees are asserted:
 *   1. Routes whose company is in the path are refused with 403 before the
 *      handler runs (the auth middleware asks can(declaredKey)).
 *   2. No route answers 2xx, and none trips the fail-closed guard ("answered
 *      without deciding"), which would mean the handler never asked the key.
 *   3. Record routes are really exercised: none answers 404 (which would
 *      mean it found no record and so never reached its permission check).
 */
test('v2: every catalogue-key route refuses a role that lacks its key', async () => {
  const errors = [];
  const dbPath = path.join(makeTmpDir('taskflow-engine-all-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const company = '1';
  const user = store.createUser({
    name: 'Nobody', email: 'nobody@engine.test', role: 'Employee', password: 'x',
    companyIds: [company], companyRoles: [{ companyId: company, role: 'Employee' }],
  });
  const ids = seedRecordPerResource(store, company, user.id);
  const role = store.authz.saveRole(company, { name: 'Nothing routed', grants: [{ key: 'dashboard.view_finance' }], fields: [] }, null);
  store.authz.setAssignments(user.id, company, { mainRoleId: role.id, addOnRoleIds: [] }, null);
  const app = createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, permissionsEngine: 'v2', portalCompanyId: company,
    logger: { info() {}, warn() {}, error: (m) => errors.push(String(m)) },
  });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const auth = `Bearer ${store.issueToken(user.id)}`;

  const tables = new Set(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const idFromTable = (segment) => {
    const table = segment.replace(/-/g, '_');
    if (!tables.has(table)) return undefined;
    for (const sql of [`SELECT id FROM ${table} WHERE companyId = ? LIMIT 1`, `SELECT id FROM ${table} LIMIT 1`]) {
      try {
        const row = sql.includes('?') ? store.db.prepare(sql).get(company) : store.db.prepare(sql).get();
        if (row) return String(row.id);
      } catch { /* no companyId column */ }
    }
    return undefined;
  };
  const urlFor = (p) => {
    const parts = p.split('/');
    let params = 0;
    return parts.map((part, i) => {
      if (part === ':companyId') return company;
      if (!part.startsWith(':')) return part;
      params += 1;
      const segment = parts.slice(0, i).reverse().find((x) => !x.startsWith(':')) ?? '';
      const id = params === 1 ? (ids[segment] ?? idFromTable(segment)) : ids[`sub:${segment}`];
      return encodeURIComponent(id ?? 'missing');
    }).join('/');
  };

  const routes = ROUTES.filter((r) => isPermissionKey(r.permission));
  const served = [];
  const notRefused = [];
  const vacuous = [];
  const invalid = [];
  let refused = 0;
  for (const r of routes) {
    const res = await agent[r.method.toLowerCase()](urlFor(r.path)).set('Authorization', auth).send({ companyId: company });
    if (res.status >= 200 && res.status < 300) served.push(`${r.method} ${r.path} → ${res.status}`);
    if (res.status === 400) invalid.push(`${r.method} ${r.path}`);
    if (res.status === 403) refused += 1;
    else if (![400, 404].includes(res.status)) notRefused.push(`${r.method} ${r.path} → ${res.status} (only 403, or 400/404 before the company is known)`);
    if (res.status === 404) vacuous.push(`${r.method} ${r.path}`);
    const companyInPath = /^\/companies\/:companyId(\/[a-z0-9-]+)*$/.test(r.path) || r.path === '/companies/:companyId';
    if (companyInPath && res.status !== 403) notRefused.push(`${r.method} ${r.path} → ${res.status}`);
  }
  assert.deepEqual(served, [], 'served to a role without the key');
  assert.deepEqual(notRefused, [], 'company in the path but not refused up front');
  assert.deepEqual(errors.filter((e) => e.includes('without deciding')), [], 'a route answered without asking its key');
  assert.deepEqual(vacuous, [], 'record routes that found no record: seed one in seedRecordPerResource');
  assert.deepEqual(invalid.sort(), [...EXPECTED_400.keys()].sort(), 'routes that answer 400 before deciding: send a valid body, or list it with the reason');
  assert.ok(routes.length > 400, `${routes.length} catalogue-key routes`);
  assert.equal(refused, routes.length - EXPECTED_400.size, `${refused}/${routes.length} refused`);
});

test('v2 fail-closed: a declared route that answers without deciding its key is refused and logged', async () => {
  const errors = [];
  // GET /auth/me never asks a company permission; pretend it were declared sales.view.
  const { company, users, token, agent } = build('v2', {
    routeLookup: (method, p) => (`${method} ${p}` === 'GET /auth/me' ? { method: 'GET', path: '/auth/me', permission: 'sales.view' } : routeDecl(method, p)),
    logger: { info() {}, warn() {}, error: (m) => errors.push(String(m)) },
  });
  void company;
  const res = await agent.get('/auth/me').set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(res.status, 403);
  assert.deepEqual({ code: res.body.code, permission: res.body.permission }, { code: 'FORBIDDEN', permission: 'sales.view' });
  assert.equal(errors.filter((e) => e.includes('without deciding')).length, 1);
  await agent.get('/auth/me').set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(errors.filter((e) => e.includes('without deciding')).length, 1, 'logged once per route');
});

test('v2: a credit override is limited by the add-on\'s amount (the overage it allows)', async () => {
  const { store, company, users, token, agent } = build('v2');
  const client = store.createClient({ name: 'Al Noor Hotel', email: 'h@x.example', address: 'Muscat', companyId: company.id });
  store.updateClient(client.id, { creditLimit: 100 });
  const item = store.createInventoryItem({ companyId: company.id, name: 'Dates', category: 'Dates', sku: 'D1', unit: 'kg', unitPrice: 10, unitCost: 6, quantityOnHand: 500 });
  addOn(store, company.id, users.Manager.id, 'Small overrides', [{ key: 'invoices.override_credit', limit: 50 }]);
  const order = (qty) => agent.post(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Manager)}`).send({
    clientId: client.id, orderDate: new Date().toISOString(), status: 'Confirmed', overrideCreditLimit: true,
    items: [{ inventoryItemId: item.id, description: 'Dates', quantity: qty, unitPrice: 10 }],
  });
  const within = await order(14); // owes 140: 40 over the limit, within 50
  assert.equal(within.status, 201, JSON.stringify(within.body));
  const beyond = await order(2); // owes 160: 60 over
  assert.equal(beyond.status, 409);
  assert.equal(beyond.body.canOverride, false);
  const { ruleAllowsV2: rule } = require('../dist/authz/engine');
  const { effective } = require('../dist/authz/evaluate');
  const eff = effective(store, users.Manager.id);
  assert.equal(rule(eff, 'INVOICES_CREDIT_OVERRIDE', company.id, undefined, { amount: 50 }).allowed, true);
  assert.equal(rule(eff, 'INVOICES_CREDIT_OVERRIDE', company.id, undefined, { amount: 51 }).allowed, false);
});

test('shadow never changes an answer: a failing v2 computation leaves the legacy result', async () => {
  const errors = [];
  const { store, company, users, token, agent } = build('shadow', { logger: { info() {}, error() {}, warn: (m) => errors.push(String(m)) } });
  const { clearEffectiveCache } = require('../dist/authz/evaluate');
  clearEffectiveCache();
  store.authz.directAssignmentsFor = () => { throw new Error('evaluator down'); };
  const res = await agent.get(`/companies/${company.id}/sales-orders`).set('Authorization', `Bearer ${token(users.Admin)}`);
  assert.equal(res.status, 200);
  const recipients = store.listUserIdsWithPermission(company.id, 'invoices:read', ['Admin', 'Manager', 'Accountant']);
  assert.equal(recipients.length, 3);
  assert.ok(errors.some((e) => e.includes('evaluator down')), errors.join('\n'));
});
