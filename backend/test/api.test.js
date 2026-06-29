const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');

const makeApp = () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-api-'));
  const dbPath = path.join(tmpDir, 'taskflow.db');
  return createServer({
    dbPath,
    seedOnEmpty: true,
    allowSeedReset: false,
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
};

const login = async (app, email, password = 'password') => {
  const response = await request(app).post('/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return response.body.token;
};

test('deleting a company cascades into related data only when requested', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-store-'));
  const store = new DataStore({ dbPath: path.join(tmpDir, 'taskflow.db'), seedOnEmpty: false });

  // Cascade: company and its related rows are all removed.
  const cascadeCo = store.createCompany({ name: 'Cascade Co', website: '', address: '' });
  store.createContact({ companyId: cascadeCo.id, name: 'Acme' });
  assert.equal(store.listContacts(cascadeCo.id).length, 1);
  store.deleteCompany(cascadeCo.id, { cascade: true });
  assert.equal(store.getCompanyById(cascadeCo.id), undefined);
  assert.equal(store.listContacts(cascadeCo.id).length, 0);

  // Non-cascade: only the company record is removed; related rows remain.
  const keepCo = store.createCompany({ name: 'Keep Co', website: '', address: '' });
  store.createContact({ companyId: keepCo.id, name: 'Globex' });
  store.deleteCompany(keepCo.id);
  assert.equal(store.getCompanyById(keepCo.id), undefined);
  assert.equal(store.listContacts(keepCo.id).length, 1);

  // Deleting a company scrubs it from user membership (companyIds / companyRoles).
  const memberCo = store.createCompany({ name: 'Member Co', website: '', address: '' });
  const otherCo = store.createCompany({ name: 'Other Co', website: '', address: '' });
  const member = store.createUser({
    name: 'Member', email: 'member@test.com', role: 'Employee',
    companyIds: [memberCo.id, otherCo.id],
    companyRoles: [
      { companyId: memberCo.id, role: 'Employee' },
      { companyId: otherCo.id, role: 'Employee' },
    ],
    password: 'password',
  });
  store.deleteCompany(memberCo.id, { cascade: true });
  const after = store.getUserById(member.id);
  assert.deepEqual(after.companyIds, [otherCo.id]);
  assert.equal(after.companyRoles.length, 1);
  assert.equal(after.companyRoles[0].companyId, otherCo.id);
});

test('a super-admin (role Employee) can edit and delete users', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-su-'));
  const dbPath = path.join(tmpDir, 'taskflow.db');
  // Seed demo data, then add a super-admin whose company role is Employee —
  // the exact shape that previously got blocked by PUT /users/:id.
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  store.createUser({
    name: 'Root', email: 'root@taskflow.com', role: 'Employee',
    companyIds: [], companyRoles: [], password: 'password', isSuperAdmin: true,
  });
  const target = store.findUserByEmail('samantha.b@innovatecorp.com');
  assert.ok(target);

  const app = createServer({
    dbPath, seedOnEmpty: false, allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  });
  const token = await login(app, 'root@taskflow.com');

  const editResponse = await request(app)
    .put(`/users/${target.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Samantha Renamed' });
  assert.equal(editResponse.status, 200);
  assert.equal(editResponse.body.name, 'Samantha Renamed');

  const deleteResponse = await request(app)
    .delete(`/users/${target.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(deleteResponse.status, 200);

  // Deleting again proves the user is gone.
  const secondDelete = await request(app)
    .delete(`/users/${target.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(secondDelete.status, 404);
});

test('a public invoice view is available without authentication', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const created = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-PUB-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-05-18T00:00:00.000Z',
      status: 'Sent',
      lineItems: [{ description: 'Public item', quantity: 1, unitPrice: 100, amount: 100, itemType: 'Manual' }],
    });
  assert.equal(created.status, 201);

  // No Authorization header — the QR target is publicly readable.
  const pub = await request(app).get(`/public/invoices/${created.body.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.invoice.invoiceNumber, 'INV-PUB-1');
  assert.ok(pub.body.company && pub.body.company.name);

  const missing = await request(app).get('/public/invoices/does-not-exist');
  assert.equal(missing.status, 404);
});

test('an invoice payment can be recorded and reversed', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const now = new Date();
  const issueDate = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 15, 12);

  const invoiceResponse = await auth(request(app).post('/invoices')).send({
    invoiceNumber: 'INV-REV-1',
    companyId: '1',
    clientId: 'client-1',
    issueDate: issueDate.toISOString(),
    dueDate: dueDate.toISOString(),
    status: 'Sent',
    lineItems: [{ description: 'Service', quantity: 1, unitPrice: 200, amount: 200, itemType: 'Manual' }],
  });
  assert.equal(invoiceResponse.status, 201);
  const invoiceId = invoiceResponse.body.id;

  const overviewBeforePayment = await auth(request(app).get('/companies/1/finance/overview'));
  const agingBeforePayment = await auth(request(app).get('/companies/1/finance/aging'));
  const receivablesBeforePayment = agingBeforePayment.body.receivables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );

  const payResponse = await auth(request(app).post(`/invoices/${invoiceId}/payments`)).send({
    amount: 200,
    method: 'Cash',
    note: 'Mistaken receipt',
    paidAt: now.toISOString(),
  });
  assert.equal(payResponse.status, 201);
  const paymentId = payResponse.body.id;

  const paidList = await auth(request(app).get('/companies/1/invoices'));
  const paidInvoice = paidList.body.find((i) => i.id === invoiceId);
  assert.equal(paidInvoice.status, 'Paid');
  assert.equal(paidInvoice.paidAmount, 200);
  assert.equal(paidInvoice.outstandingAmount, 0);

  const journalAfterPayment = await auth(request(app).get('/companies/1/finance/journal?limit=500'));
  const paymentJournal = journalAfterPayment.body.find(
    (entry) => entry.sourceType === 'invoice_payment' && entry.sourceId === paymentId,
  );
  assert.ok(paymentJournal);
  assert.equal(paymentJournal.lines.reduce((sum, line) => sum + line.debit, 0), 200);
  assert.equal(paymentJournal.lines.reduce((sum, line) => sum + line.credit, 0), 200);

  const overviewAfterPayment = await auth(request(app).get('/companies/1/finance/overview'));
  assert.equal(
    overviewAfterPayment.body.paidThisMonth,
    overviewBeforePayment.body.paidThisMonth + 200,
  );
  assert.equal(
    overviewAfterPayment.body.openReceivables,
    overviewBeforePayment.body.openReceivables - 200,
  );

  const agingAfterPayment = await auth(request(app).get('/companies/1/finance/aging'));
  const receivablesAfterPayment = agingAfterPayment.body.receivables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );
  assert.equal(receivablesAfterPayment, receivablesBeforePayment - 200);

  const reverseResponse = await auth(request(app).delete(`/invoices/${invoiceId}/payments/${paymentId}`));
  assert.equal(reverseResponse.status, 200);
  assert.equal(reverseResponse.body.id, invoiceId);
  assert.equal(reverseResponse.body.status, 'Sent');
  assert.equal(reverseResponse.body.paidAmount, 0);
  assert.equal(reverseResponse.body.outstandingAmount, 200);

  const payments = await auth(request(app).get(`/invoices/${invoiceId}/payments`));
  assert.equal(payments.body.length, 0);

  const revertedList = await auth(request(app).get('/companies/1/invoices'));
  const reverted = revertedList.body.find((i) => i.id === invoiceId);
  assert.equal(reverted.status, 'Sent');
  assert.equal(reverted.paidAmount, 0);
  assert.equal(reverted.outstandingAmount, 200);

  const journalAfterReversal = await auth(request(app).get('/companies/1/finance/journal?limit=500'));
  assert.equal(
    journalAfterReversal.body.some(
      (entry) => entry.sourceType === 'invoice_payment' && entry.sourceId === paymentId,
    ),
    false,
  );

  const overviewAfterReversal = await auth(request(app).get('/companies/1/finance/overview'));
  assert.deepEqual(overviewAfterReversal.body, overviewBeforePayment.body);

  const agingAfterReversal = await auth(request(app).get('/companies/1/finance/aging'));
  const receivablesAfterReversal = agingAfterReversal.body.receivables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );
  assert.equal(receivablesAfterReversal, receivablesBeforePayment);

  const activity = await auth(
    request(app).get(`/companies/1/activity-events?entityType=invoice&entityId=${invoiceId}&limit=50`),
  );
  const recordedEvent = activity.body.find((event) => event.action === 'payment_recorded');
  const reversedEvent = activity.body.find((event) => event.action === 'payment_reversed');
  assert.equal(recordedEvent.metadata.paymentId, paymentId);
  assert.equal(reversedEvent.metadata.paymentId, paymentId);
  assert.equal(reversedEvent.metadata.amount, 200);
  assert.equal(reversedEvent.metadata.method, 'Cash');
  assert.equal(reversedEvent.metadata.note, 'Mistaken receipt');

  // Reversing a payment that no longer exists is a 404.
  const reverseAgain = await auth(request(app).delete(`/invoices/${invoiceId}/payments/${paymentId}`));
  assert.equal(reverseAgain.status, 404);
});

test('reversing an invoice payment rolls back payment-based commissions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-commission-reversal-'));
  const store = new DataStore({ dbPath: path.join(tmpDir, 'taskflow.db'), seedOnEmpty: true });
  const admin = store.listUsers().find((user) => user.email === 'admin@taskflow.com');
  assert.ok(admin);
  store.updateUser(admin.id, {
    commissionEligible: true,
    defaultCommissionRate: 10,
    defaultCommissionBasis: 'Paid Amount',
  });
  const revenueUser = store.createUser({
    name: 'Revenue Commission User',
    email: 'revenue-commission@example.com',
    role: 'Employee',
    companyIds: ['1'],
    companyRoles: [{ companyId: '1', role: 'Employee' }],
    password: 'password',
    commissionEligible: true,
    defaultCommissionRate: 10,
    defaultCommissionBasis: 'Revenue',
  });

  const now = new Date();
  const invoice = store.createInvoice({
    companyId: '1',
    clientId: 'client-1',
    issueDate: new Date(now.getFullYear(), now.getMonth(), 1, 12),
    dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 15, 12),
    status: 'Sent',
    total: 200,
    lineItems: [
      {
        description: 'Commission reversal service',
        quantity: 1,
        unitPrice: 200,
        amount: 200,
        itemType: 'Manual',
      },
    ],
  });
  store.setContribution({
    companyId: '1',
    userId: admin.id,
    userName: admin.name,
    sourceType: 'invoice',
    sourceId: invoice.id,
    role: 'Sales',
    weightPercent: 50,
  });
  store.setContribution({
    companyId: '1',
    userId: revenueUser.id,
    userName: revenueUser.name,
    sourceType: 'invoice',
    sourceId: invoice.id,
    role: 'Sales',
    weightPercent: 50,
  });

  const payment = store.createPayment({
    invoiceId: invoice.id,
    amount: 200,
    method: 'Cash',
    note: 'Mistaken receipt',
    paidAt: now,
  });
  let commission = store
    .listCommissions('1')
    .find((item) => item.invoiceId === invoice.id && item.basis === 'Paid Amount');
  assert.ok(commission);
  assert.equal(commission.basisAmount, 100);
  assert.equal(commission.amount, 10);
  assert.equal(commission.status, 'Draft');
  let revenueCommission = store
    .listCommissions('1')
    .find((item) => item.invoiceId === invoice.id && item.basis === 'Revenue');
  assert.ok(revenueCommission);
  assert.equal(revenueCommission.amount, 10);

  store.approveCommission(commission.id);
  store.payCommission(commission.id);
  store.approveCommission(revenueCommission.id);
  store.payCommission(revenueCommission.id);
  commission = store.getCommissionById(commission.id);
  revenueCommission = store.getCommissionById(revenueCommission.id);
  assert.equal(commission.status, 'Paid');
  assert.equal(revenueCommission.status, 'Paid');
  assert.ok(
    store.listJournalEntries('1', 500).some(
      (entry) => entry.sourceType === 'commission_accrual' && entry.sourceId === commission.id,
    ),
  );
  assert.ok(
    store.listJournalEntries('1', 500).some(
      (entry) => entry.sourceType === 'commission_payment' && entry.sourceId === commission.id,
    ),
  );

  const reversedInvoice = store.reverseInvoicePayment(payment.id);
  assert.equal(reversedInvoice.status, 'Sent');
  commission = store.getCommissionById(commission.id);
  assert.equal(commission.status, 'Draft');
  assert.equal(commission.basisAmount, 0);
  assert.equal(commission.amount, 0);
  assert.equal(commission.approvedAt, undefined);
  assert.equal(commission.paidAt, undefined);
  assert.equal(commission.approvedByUserId, undefined);
  assert.equal(commission.paidByUserId, undefined);
  assert.equal(
    store.listJournalEntries('1', 500).some(
      (entry) =>
        (entry.sourceType === 'commission_accrual' || entry.sourceType === 'commission_payment')
        && entry.sourceId === commission.id,
    ),
    false,
  );
  revenueCommission = store.getCommissionById(revenueCommission.id);
  assert.equal(revenueCommission.status, 'Paid');
  assert.equal(revenueCommission.basisAmount, 100);
  assert.equal(revenueCommission.amount, 10);
  assert.ok(
    store.listJournalEntries('1', 500).some(
      (entry) =>
        entry.sourceType === 'commission_payment'
        && entry.sourceId === revenueCommission.id,
    ),
  );
});

test('invoice payments in locked periods cannot be reversed', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const invoiceResponse = await auth(request(app).post('/invoices')).send({
    invoiceNumber: 'INV-REV-LOCKED',
    companyId: '1',
    clientId: 'client-1',
    issueDate: '2026-05-01T12:00:00.000Z',
    dueDate: '2026-05-31T12:00:00.000Z',
    status: 'Sent',
    lineItems: [{ description: 'Locked receipt', quantity: 1, unitPrice: 125, amount: 125, itemType: 'Manual' }],
  });
  assert.equal(invoiceResponse.status, 201);

  const paymentResponse = await auth(
    request(app).post(`/invoices/${invoiceResponse.body.id}/payments`),
  ).send({
    amount: 125,
    method: 'Bank Transfer',
    paidAt: '2026-05-10T12:00:00.000Z',
  });
  assert.equal(paymentResponse.status, 201);

  const lockResponse = await auth(request(app).put('/companies/1/finance/settings')).send({
    lockedThroughDate: '2026-05-31T23:59:59.999Z',
  });
  assert.equal(lockResponse.status, 200);

  const reverseResponse = await auth(
    request(app).delete(
      `/invoices/${invoiceResponse.body.id}/payments/${paymentResponse.body.id}`,
    ),
  );
  assert.equal(reverseResponse.status, 400);
  assert.match(reverseResponse.body.message, /locked accounting period/i);

  const payments = await auth(
    request(app).get(`/invoices/${invoiceResponse.body.id}/payments`),
  );
  assert.equal(payments.body.length, 1);

  const journal = await auth(request(app).get('/companies/1/finance/journal?limit=500'));
  assert.equal(
    journal.body.some(
      (entry) =>
        entry.sourceType === 'invoice_payment'
        && entry.sourceId === paymentResponse.body.id,
    ),
    true,
  );
});

test('invoice document designs are validated and partial saves preserve template settings', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const templatesResponse = await auth(request(app).get('/companies/1/invoice-templates'));
  assert.equal(templatesResponse.status, 200);
  const template = templatesResponse.body[0];
  assert.ok(template);

  const doc = {
    version: 1,
    page: {
      size: 'A4',
      orientation: 'landscape',
      margin: { top: 10, right: 12, bottom: 10, left: 12 },
    },
    theme: {
      fontFamily: 'Arial, sans-serif',
      primaryColor: '#111827',
      accentColor: '#2563eb',
      textColor: '#0f172a',
    },
    body: [
      {
        id: 'group-1',
        type: 'container',
        layout: 'row',
        gap: 16,
        children: [
          { id: 'heading-1', type: 'heading', level: 1, content: 'INVOICE' },
          { id: 'number-1', type: 'text', content: '{{invoice.number}}' },
        ],
      },
      {
        id: 'totals-1',
        type: 'totals',
        showSubtotal: false,
        showTax: true,
        showTotal: true,
      },
    ],
  };

  const saved = await auth(request(app).put(`/invoice-templates/${template.id}`)).send({ doc });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.doc, doc);
  assert.equal(saved.body.name, template.name);
  assert.equal(saved.body.layout, template.layout);
  assert.equal(saved.body.primaryColor, template.primaryColor);
  assert.equal(saved.body.paymentInstructions, template.paymentInstructions);

  const invalid = await auth(request(app).put(`/invoice-templates/${template.id}`)).send({
    doc: {
      ...doc,
      body: [{ id: 'bad-1', type: 'script', content: 'unsupported' }],
    },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.message, /Invalid invoice document/);

  const after = await auth(request(app).get('/companies/1/invoice-templates'));
  assert.equal(after.status, 200);
  const persisted = after.body.find((item) => item.id === template.id);
  assert.deepEqual(persisted.doc, doc);
});

test('issued invoices freeze a template snapshot that survives later template edits', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const templatesResponse = await auth(request(app).get('/companies/1/invoice-templates'));
  const template = templatesResponse.body.find((t) => t.isDefault) || templatesResponse.body[0];
  assert.ok(template);

  const created = await auth(request(app).post('/invoices')).send({
    invoiceNumber: 'INV-SNAP-1',
    companyId: '1',
    clientId: 'client-1',
    templateId: template.id,
    issueDate: new Date('2026-01-15').toISOString(),
    dueDate: new Date('2026-02-15').toISOString(),
    status: 'Sent',
    lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, amount: 100, itemType: 'Manual' }],
  });
  assert.equal(created.status, 201);
  const invoiceId = created.body.id;
  // The snapshot is captured at creation, mirroring the template's appearance.
  assert.ok(created.body.templateSnapshot);
  assert.equal(created.body.templateSnapshot.primaryColor, template.primaryColor);

  // Edit the live template after the invoice was issued.
  const edited = await auth(request(app).put(`/invoice-templates/${template.id}`)).send({
    primaryColor: '#ff0000',
    name: 'Renamed Template',
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.primaryColor, '#ff0000');

  // The issued invoice keeps its original frozen appearance.
  const fetched = await auth(request(app).get(`/invoices/${invoiceId}`));
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.templateSnapshot.primaryColor, template.primaryColor);
  assert.notEqual(fetched.body.templateSnapshot.primaryColor, '#ff0000');

  // The public copy resolves the frozen snapshot too.
  const publicCopy = await request(app).get(`/public/invoices/${invoiceId}`);
  assert.equal(publicCopy.status, 200);
  assert.equal(publicCopy.body.template.primaryColor, template.primaryColor);
});

test('notifications: task assignment notifies the assignee, supports read + prefs', async () => {
  const app = makeApp();
  const adminToken = await login(app, 'admin@taskflow.com');
  const adminAuth = (r) => r.set('Authorization', `Bearer ${adminToken}`);

  const created = await adminAuth(request(app).post('/tasks')).send({
    title: 'Ship the notifications feature',
    priority: 'High',
    companyId: '1',
    assignedUserIds: ['user-3'],
  });
  assert.equal(created.status, 201);

  const userToken = await login(app, 'charlie.d@innovatecorp.com');
  const userAuth = (r) => r.set('Authorization', `Bearer ${userToken}`);

  const list = await userAuth(request(app).get('/notifications'));
  assert.equal(list.status, 200);
  const note = list.body.find((n) => n.type === 'task_assigned' && n.entityId === created.body.id);
  assert.ok(note, 'assignee should receive a task_assigned notification');
  assert.equal(note.readAt ?? null, null);

  const count = await userAuth(request(app).get('/notifications/unread-count'));
  assert.ok(count.body.count >= 1);

  // The acting admin should NOT be notified about their own action.
  const adminList = await adminAuth(request(app).get('/notifications'));
  assert.equal(adminList.body.some((n) => n.entityId === created.body.id), false);

  // Mark read drops the unread count.
  const read = await userAuth(request(app).post(`/notifications/${note.id}/read`));
  assert.equal(read.body.updated, true);
  const afterRead = await userAuth(request(app).get('/notifications/unread-count'));
  assert.equal(afterRead.body.count, count.body.count - 1);

  // Preferences round-trip, and muting a category hides it in-app.
  const prefs = await userAuth(request(app).get('/notifications/preferences'));
  assert.equal(prefs.body.tasks.inApp, true);
  const updated = await userAuth(request(app).put('/notifications/preferences')).send({
    tasks: { inApp: false, email: false },
    finance: { inApp: true, email: true },
    crm: { inApp: true, email: true },
  });
  assert.equal(updated.body.tasks.inApp, false);
  const mutedList = await userAuth(request(app).get('/notifications'));
  assert.equal(mutedList.body.some((n) => n.type === 'task_assigned'), false);
});

test('task status updates via a partial payload (Kanban drag) preserve project and notify', async () => {
  const app = makeApp();
  const adminToken = await login(app, 'admin@taskflow.com');
  const adminAuth = (r) => r.set('Authorization', `Bearer ${adminToken}`);
  const charlieToken = await login(app, 'charlie.d@innovatecorp.com');
  const charlieAuth = (r) => r.set('Authorization', `Bearer ${charlieToken}`);

  const created = await adminAuth(request(app).post('/tasks')).send({
    title: 'Drag me', priority: 'Medium', companyId: '1', projectId: 'proj-1', assignedUserIds: ['user-3'],
  });
  assert.equal(created.status, 201);
  const id = created.body.id;

  // Exactly what the Kanban board sends on drag: status only, no projectId.
  const moved = await adminAuth(request(app).put(`/tasks/${id}`)).send({ status: 'In Progress' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.status, 'In Progress');
  assert.equal(moved.body.projectId, 'proj-1'); // project must be preserved, not nulled

  const notes = await charlieAuth(request(app).get('/notifications'));
  assert.ok(notes.body.some((n) => n.type === 'task_status' && n.entityId === id));

  // A project-less task can also be updated with a partial payload.
  const noProj = await adminAuth(request(app).post('/tasks')).send({
    title: 'No project task', priority: 'Low', companyId: '1',
  });
  assert.equal(noProj.status, 201);
  const moved2 = await adminAuth(request(app).put(`/tasks/${noProj.body.id}`)).send({ status: 'Done' });
  assert.equal(moved2.status, 200);
  assert.equal(moved2.body.status, 'Done');

  // A task's project can be explicitly cleared and reassigned via the API.
  const cleared = await adminAuth(request(app).put(`/tasks/${id}`)).send({ projectId: '' });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.projectId, ''); // empty string clears the project
  const reassigned = await adminAuth(request(app).put(`/tasks/${id}`)).send({ projectId: 'proj-1' });
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.projectId, 'proj-1');
  // ...and a subsequent partial update still preserves it.
  const kept = await adminAuth(request(app).put(`/tasks/${id}`)).send({ status: 'To Do' });
  assert.equal(kept.body.projectId, 'proj-1');
});

test('contacts and inventory items support CSV export and import', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // Contacts: export returns CSV; import creates rows.
  const exp = await auth(request(app).get('/companies/1/contacts/export'));
  assert.equal(exp.status, 200);
  assert.match(String(exp.headers['content-type']), /text\/csv/i);
  assert.match(exp.text, /^name,kind,email/);

  const imp = await auth(request(app).post('/companies/1/contacts/import')).send({
    rows: [
      { name: 'Imported Org', kind: 'Organization', email: 'org@imp.co' },
      { name: '', email: 'bad@imp.co' }, // missing name -> failure
    ],
  });
  assert.equal(imp.status, 200);
  assert.equal(imp.body.created, 1);
  assert.equal(imp.body.failed, 1);

  // Inventory items: needs a warehouse for opening stock.
  await auth(request(app).post('/companies/1/warehouses')).send({ name: 'Import WH', isDefault: true });
  const itemImp = await auth(request(app).post('/companies/1/inventory-items/import')).send({
    rows: [{ name: 'Imported Widget', category: 'Parts', unit: 'pcs', onHand: 4, reorderPoint: 2, unitCost: 5, location: 'Import WH' }],
  });
  assert.equal(itemImp.status, 200);
  assert.equal(itemImp.body.created, 1);
  const itemExp = await auth(request(app).get('/companies/1/inventory-items/export'));
  assert.equal(itemExp.status, 200);
  assert.match(itemExp.text, /Imported Widget/);
});

test('time entries log, list, and delete on a task', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  const task = await auth(request(app).post('/tasks')).send({
    title: 'Timed task', priority: 'Medium', companyId: '1', assignedUserIds: ['user-3'],
  });
  assert.equal(task.status, 201);
  const taskId = task.body.id;

  const logged = await auth(request(app).post(`/tasks/${taskId}/time-entries`)).send({ hours: 1.5, note: 'Design work' });
  assert.equal(logged.status, 201);
  assert.equal(logged.body.minutes, 90);

  const list = await auth(request(app).get(`/tasks/${taskId}/time-entries`));
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].minutes, 90);

  const del = await auth(request(app).delete(`/time-entries/${logged.body.id}`));
  assert.equal(del.status, 200);
  const after = await auth(request(app).get(`/tasks/${taskId}/time-entries`));
  assert.equal(after.body.length, 0);
});

test('credit notes reduce an invoice outstanding balance and post a reversing journal', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  const inv = await auth(request(app).post('/invoices')).send({
    invoiceNumber: 'INV-CN-1', companyId: '1', clientId: 'client-1',
    issueDate: new Date('2026-03-01').toISOString(), dueDate: new Date('2026-04-01').toISOString(),
    status: 'Sent',
    lineItems: [{ description: 'Service', quantity: 1, unitPrice: 300, amount: 300, itemType: 'Manual' }],
  });
  assert.equal(inv.status, 201);
  const invoiceId = inv.body.id;
  assert.equal(inv.body.outstandingAmount, 300);

  // Credit part of it.
  const cn = await auth(request(app).post('/companies/1/credit-notes')).send({
    invoiceId, reason: 'Partial refund',
    lineItems: [{ description: 'Goodwill credit', amount: 100 }],
  });
  assert.equal(cn.status, 201);
  assert.match(cn.body.creditNoteNumber, /^CN-\d{4}$/);
  assert.equal(cn.body.total, 100);

  // Invoice outstanding drops by the credit.
  const after = await auth(request(app).get('/companies/1/invoices'));
  const updated = after.body.find((i) => i.id === invoiceId);
  assert.equal(updated.creditedAmount, 100);
  assert.equal(updated.outstandingAmount, 200);

  // Over-crediting is rejected.
  const tooMuch = await auth(request(app).post('/companies/1/credit-notes')).send({
    invoiceId, lineItems: [{ description: 'Too much', amount: 5000 }],
  });
  assert.equal(tooMuch.status, 400);

  // A reversing journal entry exists for the credit note.
  const tb = await auth(request(app).get('/companies/1/finance/trial-balance'));
  assert.equal(tb.status, 200);

  // It shows in the credit-notes list.
  const list = await auth(request(app).get('/companies/1/credit-notes'));
  assert.ok(list.body.some((c) => c.id === cn.body.id));
});

test('low-stock sweep notifies managers when an item is at/below reorder point', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-ls-'));
  const store = new DataStore({ dbPath: path.join(tmpDir, 'taskflow.db'), seedOnEmpty: false });
  const co = store.createCompany({ name: 'Stock Co', website: '', address: '' });
  const boss = store.createUser({ name: 'Boss', email: 'boss@stock.co', password: 'secret123', role: 'Admin', companyIds: [co.id] });
  store.createWarehouse({ companyId: co.id, name: 'Main', isDefault: true });
  store.createInventoryItem({
    companyId: co.id, name: 'Widget', category: 'Parts', unit: 'pcs',
    onHand: 1, reorderPoint: 5, unitCost: 1, tracksInventory: true, location: 'Main',
  });

  const created = store.sweepLowStockNotifications();
  assert.ok(created >= 1, 'should create at least one low-stock notification');
  const notes = store.listNotifications(boss.id);
  assert.ok(notes.some((n) => n.type === 'low_stock' && n.category === 'inventory'));

  // Deduped: a second sweep the same day adds nothing.
  assert.equal(store.sweepLowStockNotifications(), 0);
});

test('passwords are hashed at rest and login upgrades legacy plaintext', async () => {
  // Store-level: a created user's password is a bcrypt hash, never plaintext.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-pw-'));
  const store = new DataStore({ dbPath: path.join(tmpDir, 'taskflow.db'), seedOnEmpty: false });
  const co = store.createCompany({ name: 'PW Co', website: '', address: '' });
  store.createUser({ name: 'Pat', email: 'pat@pw.co', password: 'secret123', role: 'Employee', companyIds: [co.id] });
  const stored = store.findUserByEmail('pat@pw.co');
  assert.ok(stored.password.startsWith('$2'), 'stored password should be a bcrypt hash');
  assert.notEqual(stored.password, 'secret123');

  // API-level: a seeded plaintext password still logs in (and is rehashed),
  // a second login via the new hash also works, and a wrong password is rejected.
  const app = makeApp();
  const first = await request(app).post('/auth/login').send({ email: 'admin@taskflow.com', password: 'password' });
  assert.equal(first.status, 200);
  const second = await request(app).post('/auth/login').send({ email: 'admin@taskflow.com', password: 'password' });
  assert.equal(second.status, 200);
  const wrong = await request(app).post('/auth/login').send({ email: 'admin@taskflow.com', password: 'nope' });
  assert.equal(wrong.status, 401);
});

test('health endpoint reports status and applied migrations', async () => {
  const app = makeApp();
  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.deepEqual(response.body.migrations, [
    '001_core_schema',
    '002_legacy_columns',
    '003_operations_backbone',
    '004_purchase_receipts_and_supplier_payables',
    '005_vendor_bill_payments',
    '006_client_backbone_and_activity',
    '007_inventory_location_ledger',
    '008_activity_actor_metadata',
    '009_master_data_enhancements',
    '010_vendor_invoice_reference_number',
    '011_chart_of_accounts_enhancements',
    '012_record_support_and_numbering',
    '013_finance_period_controls',
    '014_invoice_templates',
    '015_invoice_template_watermark',
    '016_sales_orders',
    '017_company_currency_settings',
    '018_contacts_master_data',
    '019_contactid_on_transactions',
    '020_crm_fields',
    '021_crm_pipeline_requests_commissions',
    '022_vendor_request_scheduling_costs',
    '023_crm_proposals',
    '024_crm_campaigns',
    '025_campaigns_optional_contact',
    '026_contact_visibility',
    '027_campaign_execution',
    '028_campaign_invoice_columns',
    '029_deliverable_vendor_bill',
    '030_deliveries',
    '031_whatsapp_integration',
    '032_whatsapp_actor_and_privacy',
    '033_opportunity_closed_at',
    '034_commissions_v2_foundation',
    '035_commissions_v2_engine',
    '036_user_super_admin',
    '037_campaign_deliverable_fulfillment',
    '038_influencer_accounts',
    '039_company_logo_and_avatar_cleanup',
    '040_invoice_template_customization',
    '041_invoice_template_qr',
    '042_invoice_template_section_breaks',
    '043_invoice_template_doc',
    '044_commission_nullable_source_links',
    '045_invoice_template_snapshot',
    '046_notifications',
    '047_warehouses',
    '048_credit_notes',
    '049_time_entries',
    '050_po_approvals',
    '051_custom_fields',
    '052_hr_module',
    '053_company_details',
    '054_template_letterhead_image',
    '055_template_doc_type',
    '056_inventory_lots',
    '057_purchase_requisitions',
    '058_expenses',
    '059_followups',
    '060_followup_assignees',
  ]);
});

test('users can update their own profile without gaining company-management access', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (requestBuilder) => requestBuilder.set('Authorization', `Bearer ${token}`);

  const profile = await auth(request(app).put('/auth/me')).send({
    name: 'Admin Updated',
    avatar: 'data:image/png;base64,profile',
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.name, 'Admin Updated');
  assert.equal(profile.body.user.avatar, 'data:image/png;base64,profile');

  // A company Admin may now edit their own company's details/branding.
  const company = await auth(request(app).put('/companies/1')).send({
    name: 'Innovate Branded',
    logoUrl: 'data:image/png;base64,logo',
  });
  assert.equal(company.status, 200);
  assert.equal(company.body.name, 'Innovate Branded');
});

test('super-admins can update company branding', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-company-branding-'));
  const dbPath = path.join(tmpDir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  store.createUser({
    name: 'Root',
    email: 'branding.root@taskflow.com',
    role: 'Employee',
    companyIds: [],
    companyRoles: [],
    password: 'password',
    isSuperAdmin: true,
  });
  const app = createServer({
    dbPath,
    seedOnEmpty: false,
    allowSeedReset: false,
    logger: { info() {}, warn() {}, error() {} },
  });
  const token = await login(app, 'branding.root@taskflow.com');
  const company = await request(app)
    .put('/companies/1')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Innovate Branded',
      logoUrl: 'data:image/png;base64,logo',
    });
  assert.equal(company.status, 200);
  assert.equal(company.body.name, 'Innovate Branded');
  assert.equal(company.body.logoUrl, 'data:image/png;base64,logo');
});

test('profile uploads accept valid base64 payloads and reject oversized requests clearly', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (requestBuilder) => requestBuilder.set('Authorization', `Bearer ${token}`);

  const validImage = `data:image/png;base64,${'a'.repeat(600_000)}`;
  const accepted = await auth(request(app).put('/auth/me')).send({ avatar: validImage });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.user.avatar.length, validImage.length);

  const oversizedImage = `data:image/png;base64,${'a'.repeat(4_300_000)}`;
  const rejected = await auth(request(app).put('/auth/me')).send({ avatar: oversizedImage });
  assert.equal(rejected.status, 413);
  assert.equal(
    rejected.body.message,
    'Request is too large. Uploaded images must be 2 MB or smaller.',
  );
});

test('protected routes require authentication', async () => {
  const app = makeApp();
  const response = await request(app).get('/companies');

  assert.equal(response.status, 401);
  assert.equal(response.body.message, 'Unauthorized');
});

test('non-admin users only see accessible companies', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');
  const response = await request(app)
    .get('/companies')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].id, '1');
});

test('company admins see and edit only their assigned companies', async () => {
  const app = makeApp();
  const superAdminToken = await login(app, 'admin@taskflow.com');
  const created = await request(app)
    .post('/users')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send({
      name: 'Single Company Admin',
      email: 'single.company.admin@taskflow.com',
      password: 'password',
      role: 'Admin',
      companyRoles: [{ companyId: '2', role: 'Admin' }],
    });
  assert.equal(created.status, 201);

  const companyAdminToken = await login(app, 'single.company.admin@taskflow.com');
  const companies = await request(app)
    .get('/companies')
    .set('Authorization', `Bearer ${companyAdminToken}`);
  assert.equal(companies.status, 200);
  assert.deepEqual(companies.body.map((company) => company.id), ['2']);

  // They CAN edit their own assigned company...
  const editOwn = await request(app)
    .put('/companies/2')
    .set('Authorization', `Bearer ${companyAdminToken}`)
    .send({ name: 'Rebranded Co' });
  assert.equal(editOwn.status, 200);
  assert.equal(editOwn.body.name, 'Rebranded Co');

  // ...but not a company they are not a member of.
  const editOther = await request(app)
    .put('/companies/1')
    .set('Authorization', `Bearer ${companyAdminToken}`)
    .send({ name: 'Unauthorized Rename' });
  assert.equal(editOther.status, 403);
  assert.equal(editOther.body.message, 'You do not have access to this company.');
});

test('company scoping blocks access outside a manager company', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const allowed = await request(app)
    .get('/companies/1/clients')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(allowed.status, 200);

  const denied = await request(app)
    .get('/companies/2/clients')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(denied.status, 403);
});

test('employees see only tasks assigned to them; managers see all company tasks', async () => {
  const app = makeApp();
  // fox.m (user-5) is an Employee in company 1 but a Manager in company 2.
  const token = await login(app, 'fox.m@synergysolutions.com');

  // Project privacy is preserved (unchanged).
  const projects = await request(app)
    .get('/projects')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(projects.status, 200);
  assert.equal(projects.body.some((project) => project.id === 'proj-2'), false);

  const privateProject = await request(app)
    .get('/projects/proj-2')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(privateProject.status, 403);

  // As an Employee in company 1, fox.m CANNOT see a company-1 task they're not
  // assigned to (task-4 is assigned to user-3).
  const unassignedTask = await request(app)
    .get('/tasks/task-4')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(unassignedTask.status, 403);

  const unassignedComments = await request(app)
    .get('/tasks/task-4/comments')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(unassignedComments.status, 403);

  const taskList = await request(app)
    .get('/tasks')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(taskList.status, 200);
  // task-4 (company 1, not assigned to fox.m) is hidden...
  assert.equal(taskList.body.some((task) => task.id === 'task-4'), false);
  // ...but task-7 (assigned to fox.m, in company 2 where they manage) is visible.
  assert.equal(taskList.body.some((task) => task.id === 'task-7'), true);

  const assignedTask = await request(app)
    .get('/tasks/task-7')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(assignedTask.status, 200);

  // The client-360 tasks tab is a project-scoped view and still respects
  // project privacy, so a private project's tasks stay hidden there.
  const clientTasks = await request(app)
    .get('/companies/1/clients/client-1/tasks')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(clientTasks.status, 200);
  assert.equal(clientTasks.body.some((task) => task.projectId === 'proj-2'), false);
});

test('managers can see private projects and tasks in their company', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const privateProject = await request(app)
    .get('/projects/proj-2')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(privateProject.status, 200);

  const privateTask = await request(app)
    .get('/tasks/task-4')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(privateTask.status, 200);

  const privateTaskComments = await request(app)
    .get('/tasks/task-4/comments')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(privateTaskComments.status, 200);

  const clientTasks = await request(app)
    .get('/companies/1/clients/client-1/tasks')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(clientTasks.status, 200);
  assert.equal(clientTasks.body.some((task) => task.projectId === 'proj-2'), true);
});

test('finance endpoints block employees', async () => {
  const app = makeApp();
  const token = await login(app, 'charlie.d@innovatecorp.com');

  const response = await request(app)
    .get('/companies/1/finance/overview')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 403);
});

test('employees cannot access company-wide operations and finance routes', async () => {
  const app = makeApp();
  const token = await login(app, 'charlie.d@innovatecorp.com');
  const guardedRoutes = [
    '/companies/1/clients',
    '/companies/1/suppliers',
    '/companies/1/purchase-orders',
    '/companies/1/invoices',
    '/companies/1/finance/accounts',
    '/companies/1/finance/journal',
    '/companies/1/finance/vendor-bills',
    '/companies/1/finance/overview',
  ];

  for (const route of guardedRoutes) {
    const response = await request(app)
      .get(route)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(response.status, 403, `Expected ${route} to reject Employee access.`);
  }
});

test('managers can access finance endpoints for their company', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const overview = await request(app)
    .get('/companies/1/finance/overview')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(overview.status, 200);

  const invoices = await request(app)
    .get('/companies/1/invoices')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(invoices.status, 200);
});

test('company-scoped admins keep admin permissions within their company', async () => {
  const app = makeApp();
  const globalAdminToken = await login(app, 'admin@taskflow.com');

  const createScopedAdmin = await request(app)
    .post('/users')
    .set('Authorization', `Bearer ${globalAdminToken}`)
    .send({
      name: 'Scoped Company Admin',
      email: 'scoped.admin@synergysolutions.com',
      password: 'password',
      role: 'Employee',
      companyRoles: [{ companyId: '2', role: 'Admin' }],
    });
  assert.equal(createScopedAdmin.status, 201);

  const scopedAdminToken = await login(app, 'scoped.admin@synergysolutions.com');

  const companyUsers = await request(app)
    .get('/companies/2/users')
    .set('Authorization', `Bearer ${scopedAdminToken}`);
  assert.equal(companyUsers.status, 200);

  const createManager = await request(app)
    .post('/users')
    .set('Authorization', `Bearer ${scopedAdminToken}`)
    .send({
      name: 'Scoped Managed User',
      email: 'scoped.manager@synergysolutions.com',
      password: 'password',
      role: 'Employee',
      companyRoles: [{ companyId: '2', role: 'Manager' }],
    });
  assert.equal(createManager.status, 201);

  const globalUsers = await request(app)
    .get('/users')
    .set('Authorization', `Bearer ${scopedAdminToken}`);
  assert.equal(globalUsers.status, 403);
});

test('dashboard payload is role-based for an employee view', async () => {
  const app = makeApp();
  const token = await login(app, 'charlie.d@innovatecorp.com');

  const response = await request(app)
    .get('/companies/1/dashboard')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.role, 'Employee');
  assert.equal(response.body.scope, 'personal');
  assert.deepEqual(
    response.body.metrics.map((metric) => metric.id),
    ['open-tasks', 'overdue-tasks', 'due-soon', 'completion-rate'],
  );
  assert.deepEqual(
    response.body.charts.map((chart) => chart.id),
    ['task-status', 'priority-mix', 'deadline-pressure', 'task-load'],
  );
  assert.equal(
    response.body.quickActions.some((action) => action.route === '/projects'),
    true,
  );
});

test('dashboard payload uses company-specific role for multi-company users', async () => {
  const app = makeApp();
  const token = await login(app, 'fox.m@synergysolutions.com');

  const employeeView = await request(app)
    .get('/companies/1/dashboard')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(employeeView.status, 200);
  assert.equal(employeeView.body.role, 'Employee');
  assert.equal(employeeView.body.scope, 'personal');

  const managerView = await request(app)
    .get('/companies/2/dashboard')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(managerView.status, 200);
  assert.equal(managerView.body.role, 'Manager');
  assert.equal(managerView.body.scope, 'company');
  assert.equal(
    managerView.body.metrics.some((metric) => metric.id === 'low-stock-items'),
    true,
  );
});

test('dashboard payload is finance-focused for accountants', async () => {
  const app = makeApp();
  const adminToken = await login(app, 'admin@taskflow.com');

  const createUser = await request(app)
    .post('/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Avery Ledger',
      email: 'avery.ledger@innovatecorp.com',
      password: 'password',
      companyRoles: [{ companyId: '1', role: 'Accountant' }],
    });

  assert.equal(createUser.status, 201);

  const accountantToken = await login(app, 'avery.ledger@innovatecorp.com');
  const response = await request(app)
    .get('/companies/1/dashboard')
    .set('Authorization', `Bearer ${accountantToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.role, 'Accountant');
  assert.equal(response.body.scope, 'company');
  assert.deepEqual(
    response.body.metrics.map((metric) => metric.id),
    ['open-receivables', 'open-payables', 'billed-this-month', 'paid-this-month'],
  );
  assert.deepEqual(
    response.body.charts.map((chart) => chart.id),
    ['finance-exposure', 'cashflow-trend', 'aging'],
  );
});

test('inventory creation validates required fields', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .post('/companies/1/inventory-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      category: 'Testing',
      unit: 'pcs',
      onHand: 1,
      reorderPoint: 1,
      unitCost: 1,
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /name/i);
});

test('seed reset is disabled unless explicitly allowed', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .post('/seed')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 403);
  assert.match(response.body.message, /disabled/i);
});

test('manager cannot create manager accounts', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const response = await request(app)
    .post('/users')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Escalated User',
      email: 'escalated@innovatecorp.com',
      companyRoles: [{ companyId: '1', role: 'Manager' }],
    });

  assert.equal(response.status, 403);
  assert.match(response.body.message, /company admins|employee/i);
});

test('project creation rejects foreign-company client references', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Invalid Client Project',
      companyId: '1',
      visibility: 'Public',
      memberIds: ['user-2'],
      clientId: 'client-2',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /client/i);
});

test('task creation rejects projects from another company', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .post('/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Cross-company task',
      priority: 'High',
      companyId: '1',
      projectId: 'proj-3',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /project/i);
});

test('task creation allows an optional (empty) project', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const created = await auth(request(app).post('/tasks')).send({
    title: 'General company task',
    priority: 'Medium',
    companyId: '1',
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.projectId, '');
  const taskId = created.body.id;

  // It shows up in the company-wide task list (the list filter used to drop it).
  const list = await auth(request(app).get('/tasks'));
  assert.equal(list.status, 200);
  assert.ok(list.body.some((task) => task.id === taskId));

  // It is retrievable directly even though it has no project.
  const fetched = await auth(request(app).get(`/tasks/${taskId}`));
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.title, 'General company task');
});

test('purchase order creation rejects unknown inventory references', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .post('/companies/1/purchase-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      supplierId: 'supplier-1',
      orderDate: '2026-04-07T00:00:00.000Z',
      status: 'Draft',
      items: [
        {
          sku: 'MISSING-SKU',
          description: 'Missing item',
          quantity: 2,
          unitCost: 10,
          lineTotal: 20,
        },
      ],
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /sku/i);
});

test('invoice creation rejects clients from another company', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-BAD-1',
      companyId: '1',
      clientId: 'client-2',
      issueDate: '2026-04-07T00:00:00.000Z',
      dueDate: '2026-04-15T00:00:00.000Z',
      lineItems: [
        {
          description: 'Services',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          itemType: 'Manual',
        },
      ],
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /client/i);
});

test('vendor bill creation rejects foreign-company ledger accounts', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const accountResponse = await request(app)
    .get('/companies/2/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(accountResponse.status, 200);
  const foreignAccountId = accountResponse.body[0].id;

  const response = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vendorName: 'Foreign Account Vendor',
      billNumber: 'VB-BAD-1',
      issueDate: '2026-04-07T00:00:00.000Z',
      dueDate: '2026-04-21T00:00:00.000Z',
      amount: 150,
      expenseAccountId: foreignAccountId,
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /ledger account/i);
});

test('marking tasks invoiced requires invoice from the same company', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-2001',
      companyId: '2',
      clientId: 'client-2',
      issueDate: '2026-04-07T00:00:00.000Z',
      dueDate: '2026-04-15T00:00:00.000Z',
      lineItems: [
        {
          description: 'Services',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          itemType: 'Manual',
        },
      ],
    });
  assert.equal(invoiceResponse.status, 201);

  const response = await request(app)
    .post('/tasks/mark-invoiced')
    .set('Authorization', `Bearer ${token}`)
    .send({
      taskIds: ['task-1'],
      invoiceId: invoiceResponse.body.id,
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /same company/i);
});

test('happy path workflow works for project -> task -> invoice -> payment', async () => {
  const app = makeApp();
  const adminToken = await login(app, 'admin@taskflow.com');

  const projectResponse = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Workflow Project',
      companyId: '1',
      visibility: 'Public',
      memberIds: ['user-2'],
      clientId: 'client-1',
    });
  assert.equal(projectResponse.status, 201);
  const projectId = projectResponse.body.id;

  const taskResponse = await request(app)
    .post('/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Billable task',
      priority: 'High',
      companyId: '1',
      projectId,
      assignedUserIds: ['user-2'],
      tags: ['billable'],
    });
  assert.equal(taskResponse.status, 201);
  const taskId = taskResponse.body.id;

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      invoiceNumber: 'INV-HAPPY-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-07T00:00:00.000Z',
      dueDate: '2026-04-15T00:00:00.000Z',
      lineItems: [
        {
          taskId,
          description: 'Billable task',
          quantity: 1,
          unitPrice: 250,
          amount: 250,
          itemType: 'Task',
        },
      ],
      status: 'Draft',
    });
  assert.equal(invoiceResponse.status, 201);
  assert.equal(invoiceResponse.body.total, 250);
  const invoiceId = invoiceResponse.body.id;

  const markInvoicedResponse = await request(app)
    .post('/tasks/mark-invoiced')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      taskIds: [taskId],
      invoiceId,
    });
  assert.equal(markInvoicedResponse.status, 200);

  const taskAfterInvoiced = await request(app)
    .get(`/tasks/${taskId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(taskAfterInvoiced.status, 200);
  assert.equal(taskAfterInvoiced.body.generatedInvoiceId, invoiceId);

  const sendInvoiceResponse = await request(app)
    .patch(`/invoices/${invoiceId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'Sent' });
  assert.equal(sendInvoiceResponse.status, 200);

  const paymentResponse = await request(app)
    .post(`/invoices/${invoiceId}/payments`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      amount: 250,
      method: 'Bank Transfer',
      note: 'Paid in full',
    });
  assert.equal(paymentResponse.status, 201);
  assert.equal(paymentResponse.body.amount, 250);

  const invoicesResponse = await request(app)
    .get('/companies/1/invoices')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(invoicesResponse.status, 200);
  const createdInvoice = invoicesResponse.body.find((invoice) => invoice.id === invoiceId);
  assert.ok(createdInvoice);
  assert.equal(createdInvoice.status, 'Paid');
  assert.equal(createdInvoice.paidAmount, 250);
  assert.equal(createdInvoice.outstandingAmount, 0);
});

test('project update rejects changing company when existing relationships no longer belong', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .put('/projects/proj-1')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '2',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /client|memberIds/i);
});

test('task update rejects changing company when existing assignments no longer belong', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const response = await request(app)
    .put('/tasks/task-2')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '2',
      projectId: 'proj-3',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /assignedUserIds|Task task-1/i);
});

test('manager cannot move a task into a company they cannot access', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const response = await request(app)
    .put('/tasks/task-1')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '2',
      projectId: 'proj-3',
      assignedUserIds: ['user-4'],
    });

  assert.equal(response.status, 403);
});

test('invoice update rejects changing company when existing invoice relationships no longer belong', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-UPD-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-05-18T00:00:00.000Z',
      status: 'Sent',
      lineItems: [
        {
          taskId: 'task-1',
          itemType: 'Task',
          description: 'Seed task billing',
          quantity: 1,
          unitPrice: 150,
          amount: 150,
        },
      ],
    });
  assert.equal(invoiceResponse.status, 201);

  const response = await request(app)
    .put(`/invoices/${invoiceResponse.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '2',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /client|Task task-1/i);
});

test('partial payment keeps invoice sent and final payment marks it paid', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  // Use a future due date so the invoice is not auto-classified as Overdue.
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-PAY-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: issueDate.toISOString(),
      dueDate: dueDate.toISOString(),
      status: 'Sent',
      lineItems: [
        {
          description: 'Milestone billing',
          quantity: 1,
          unitPrice: 300,
          amount: 300,
          itemType: 'Manual',
        },
      ],
    });
  assert.equal(invoiceResponse.status, 201);
  const invoiceId = invoiceResponse.body.id;

  const partialPaymentResponse = await request(app)
    .post(`/invoices/${invoiceId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 125,
      method: 'Bank Transfer',
    });
  assert.equal(partialPaymentResponse.status, 201);

  let invoicesResponse = await request(app)
    .get('/companies/1/invoices')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(invoicesResponse.status, 200);
  let invoice = invoicesResponse.body.find((item) => item.id === invoiceId);
  assert.ok(invoice);
  assert.equal(invoice.status, 'Sent');
  assert.equal(invoice.paidAmount, 125);
  assert.equal(invoice.outstandingAmount, 175);

  const finalPaymentResponse = await request(app)
    .post(`/invoices/${invoiceId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 175,
      method: 'Bank Transfer',
    });
  assert.equal(finalPaymentResponse.status, 201);

  invoicesResponse = await request(app)
    .get('/companies/1/invoices')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(invoicesResponse.status, 200);
  invoice = invoicesResponse.body.find((item) => item.id === invoiceId);
  assert.ok(invoice);
  assert.equal(invoice.status, 'Paid');
  assert.equal(invoice.paidAmount, 300);
  assert.equal(invoice.outstandingAmount, 0);
});

test('payment creation rejects non-positive amounts', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-PAY-2',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-04-18T00:00:00.000Z',
      status: 'Sent',
      lineItems: [
        {
          description: 'Support retainer',
          quantity: 1,
          unitPrice: 200,
          amount: 200,
          itemType: 'Manual',
        },
      ],
    });
  assert.equal(invoiceResponse.status, 201);

  const response = await request(app)
    .post(`/invoices/${invoiceResponse.body.id}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 0,
      method: 'Cash',
    });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /greater than zero/i);
});

test('invoice payment workflow rejects invalid states and settling status creates a payment', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const draftInvoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-DRAFT-PAY-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-04-18T00:00:00.000Z',
      status: 'Draft',
      lineItems: [
        {
          description: 'Draft invoice',
          quantity: 1,
          unitPrice: 120,
          amount: 120,
          itemType: 'Manual',
        },
      ],
    });
  assert.equal(draftInvoiceResponse.status, 201);

  let response = await request(app)
    .post(`/invoices/${draftInvoiceResponse.body.id}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 10,
      method: 'Cash',
    });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /draft invoices/i);

  const sentInvoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-SETTLE-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-04-18T00:00:00.000Z',
      status: 'Sent',
      lineItems: [
        {
          description: 'Settlement invoice',
          quantity: 1,
          unitPrice: 220,
          amount: 220,
          itemType: 'Manual',
        },
      ],
    });
  assert.equal(sentInvoiceResponse.status, 201);
  const invoiceId = sentInvoiceResponse.body.id;

  response = await request(app)
    .post(`/invoices/${invoiceId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 300,
      method: 'Cash',
    });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /outstanding amount/i);

  const settleResponse = await request(app)
    .patch(`/invoices/${invoiceId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'Paid' });
  assert.equal(settleResponse.status, 200);
  assert.equal(settleResponse.body.status, 'Paid');
  assert.equal(settleResponse.body.paidAmount, 220);
  assert.equal(settleResponse.body.outstandingAmount, 0);

  const paymentsResponse = await request(app)
    .get(`/invoices/${invoiceId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(paymentsResponse.status, 200);
  assert.equal(paymentsResponse.body.length, 1);
  assert.equal(paymentsResponse.body[0].amount, 220);
});

test('finance overview and aging use outstanding receivables instead of full invoice totals', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-AGING-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-01T00:00:00.000Z',
      dueDate: '2026-04-05T00:00:00.000Z',
      status: 'Overdue',
      lineItems: [
        {
          description: 'Outstanding milestone',
          quantity: 1,
          unitPrice: 500,
          amount: 500,
          itemType: 'Manual',
        },
      ],
    });
  assert.equal(invoiceResponse.status, 201);

  const paymentResponse = await request(app)
    .post(`/invoices/${invoiceResponse.body.id}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 125,
      method: 'Wire',
    });
  assert.equal(paymentResponse.status, 201);

  const overviewResponse = await request(app)
    .get('/companies/1/finance/overview')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(overviewResponse.status, 200);
  assert.equal(overviewResponse.body.openReceivables, 375);

  const agingResponse = await request(app)
    .get('/companies/1/finance/aging')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(agingResponse.status, 200);
  const totalReceivables = agingResponse.body.receivables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );
  assert.equal(totalReceivables, 375);
});

test('vendor bill approval and payment post journal entries without duplicates', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const accountsResponse = await request(app)
    .get('/companies/1/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(accountsResponse.status, 200);
  const expenseAccount = accountsResponse.body.find((account) => account.code === '5000');
  assert.ok(expenseAccount);

  const createResponse = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vendorName: 'Phase One Supplies',
      referenceInvoiceNumber: 'SUP-2001',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-04-22T00:00:00.000Z',
      amount: 180,
      status: 'Draft',
      expenseAccountId: expenseAccount.id,
    });
  assert.equal(createResponse.status, 201);
  assert.match(createResponse.body.billNumber, /^VI-\d{4}$/);
  assert.equal(createResponse.body.referenceInvoiceNumber, 'SUP-2001');
  const billId = createResponse.body.id;

  let journalResponse = await request(app)
    .get('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(journalResponse.status, 200);
  assert.equal(
    journalResponse.body.filter((entry) => entry.sourceType === 'vendor_bill' && entry.sourceId === billId).length,
    0,
  );

  const approveResponse = await request(app)
    .patch(`/vendor-bills/${billId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'Approved' });
  assert.equal(approveResponse.status, 200);

  journalResponse = await request(app)
    .get('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(journalResponse.status, 200);
  const vendorBillEntries = journalResponse.body.filter(
    (entry) => entry.sourceType === 'vendor_bill' && entry.sourceId === billId,
  );
  assert.equal(vendorBillEntries.length, 1);
  assert.equal(
    vendorBillEntries[0].lines.reduce((sum, line) => sum + line.debit, 0),
    180,
  );

  const payResponse = await request(app)
    .patch(`/vendor-bills/${billId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'Paid' });
  assert.equal(payResponse.status, 200);

  journalResponse = await request(app)
    .get('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(journalResponse.status, 200);
  assert.equal(
    journalResponse.body.filter((entry) => entry.sourceType === 'vendor_bill' && entry.sourceId === billId).length,
    1,
  );
  const paymentEntries = journalResponse.body.filter((entry) => entry.sourceType === 'vendor_bill_payment');
  assert.equal(paymentEntries.length, 1);
  assert.equal(
    paymentEntries[0].lines.reduce((sum, line) => sum + line.credit, 0),
    180,
  );
});

test('vendor bill payments support partial settlement and update balances', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const now = new Date();
  const issueDate = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 15, 12);

  const billResponse = await auth(request(app)
    .post('/companies/1/finance/vendor-bills')
  )
    .send({
      vendorName: 'Partial Pay Vendor',
      issueDate: issueDate.toISOString(),
      dueDate: dueDate.toISOString(),
      amount: 180,
      status: 'Approved',
    });
  assert.equal(billResponse.status, 201);
  assert.match(billResponse.body.billNumber, /^VI-\d{4}$/);
  const billId = billResponse.body.id;
  const overviewBeforePayment = await auth(request(app).get('/companies/1/finance/overview'));
  const agingBeforePayment = await auth(request(app).get('/companies/1/finance/aging'));
  const payablesBeforePayment = agingBeforePayment.body.payables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );

  const firstPaymentResponse = await auth(request(app)
    .post(`/vendor-bills/${billId}/payments`)
  )
    .send({
      amount: 70,
      method: 'Bank Transfer',
      note: 'First settlement',
      paidAt: now.toISOString(),
    });
  assert.equal(firstPaymentResponse.status, 201);
  assert.equal(firstPaymentResponse.body.bill.status, 'Approved');
  assert.equal(firstPaymentResponse.body.bill.paidAmount, 70);
  assert.equal(firstPaymentResponse.body.bill.outstandingAmount, 110);

  const firstPaymentId = firstPaymentResponse.body.payment.id;
  let paymentsResponse = await auth(request(app).get(`/vendor-bills/${billId}/payments`));
  assert.equal(paymentsResponse.status, 200);
  assert.equal(paymentsResponse.body.length, 1);

  let billsResponse = await auth(request(app).get('/companies/1/finance/vendor-bills'));
  assert.equal(billsResponse.status, 200);
  let bill = billsResponse.body.find((entry) => entry.id === billId);
  assert.ok(bill);
  assert.equal(bill.paidAmount, 70);
  assert.equal(bill.outstandingAmount, 110);

  const overPaymentResponse = await auth(request(app)
    .post(`/vendor-bills/${billId}/payments`)
  )
    .send({ amount: 120 });
  assert.equal(overPaymentResponse.status, 400);
  assert.match(overPaymentResponse.body.message, /outstanding amount/i);

  const finalPaymentResponse = await auth(request(app)
    .post(`/vendor-bills/${billId}/payments`)
  )
    .send({
      amount: 110,
      method: 'Bank Transfer',
      note: 'Final settlement',
      paidAt: now.toISOString(),
    });
  assert.equal(finalPaymentResponse.status, 201);
  assert.equal(finalPaymentResponse.body.bill.status, 'Paid');
  assert.equal(finalPaymentResponse.body.bill.outstandingAmount, 0);
  const finalPaymentId = finalPaymentResponse.body.payment.id;

  paymentsResponse = await auth(request(app).get(`/vendor-bills/${billId}/payments`));
  assert.equal(paymentsResponse.status, 200);
  assert.equal(paymentsResponse.body.length, 2);

  const journalResponse = await auth(request(app).get('/companies/1/finance/journal'));
  assert.equal(journalResponse.status, 200);
  const paymentEntries = journalResponse.body.filter((entry) => entry.sourceType === 'vendor_bill_payment');
  assert.equal(paymentEntries.length, 2);
  assert.equal(
    paymentEntries.reduce(
      (sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.credit, 0),
      0,
    ),
    180,
  );

  const overviewResponse = await auth(request(app).get('/companies/1/finance/overview'));
  assert.equal(overviewResponse.status, 200);
  assert.equal(
    overviewResponse.body.paidPayablesThisMonth,
    overviewBeforePayment.body.paidPayablesThisMonth + 180,
  );
  assert.equal(
    overviewResponse.body.openPayables,
    overviewBeforePayment.body.openPayables - 180,
  );

  const agingAfterPayment = await auth(request(app).get('/companies/1/finance/aging'));
  const payablesAfterPayment = agingAfterPayment.body.payables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );
  assert.equal(payablesAfterPayment, payablesBeforePayment - 180);

  const reverseFinal = await auth(
    request(app).delete(`/vendor-bills/${billId}/payments/${finalPaymentId}`),
  );
  assert.equal(reverseFinal.status, 200);
  assert.equal(reverseFinal.body.status, 'Approved');
  assert.equal(reverseFinal.body.paidAmount, 70);
  assert.equal(reverseFinal.body.outstandingAmount, 110);

  paymentsResponse = await auth(request(app).get(`/vendor-bills/${billId}/payments`));
  assert.equal(paymentsResponse.body.length, 1);
  assert.equal(paymentsResponse.body[0].id, firstPaymentId);

  const journalAfterFinalReversal = await auth(
    request(app).get('/companies/1/finance/journal?limit=500'),
  );
  assert.equal(
    journalAfterFinalReversal.body.some(
      (entry) => entry.sourceType === 'vendor_bill_payment' && entry.sourceId === finalPaymentId,
    ),
    false,
  );
  assert.equal(
    journalAfterFinalReversal.body.some(
      (entry) => entry.sourceType === 'vendor_bill_payment' && entry.sourceId === firstPaymentId,
    ),
    true,
  );

  const reverseFirst = await auth(
    request(app).delete(`/vendor-bills/${billId}/payments/${firstPaymentId}`),
  );
  assert.equal(reverseFirst.status, 200);
  assert.equal(reverseFirst.body.status, 'Approved');
  assert.equal(reverseFirst.body.paidAmount, 0);
  assert.equal(reverseFirst.body.outstandingAmount, 180);

  const overviewAfterReversal = await auth(request(app).get('/companies/1/finance/overview'));
  assert.equal(
    overviewAfterReversal.body.paidPayablesThisMonth,
    overviewBeforePayment.body.paidPayablesThisMonth,
  );
  assert.equal(
    overviewAfterReversal.body.openPayables,
    overviewBeforePayment.body.openPayables,
  );
  const agingAfterReversal = await auth(request(app).get('/companies/1/finance/aging'));
  const payablesAfterReversal = agingAfterReversal.body.payables.reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  );
  assert.equal(payablesAfterReversal, payablesBeforePayment);

  const activity = await auth(
    request(app).get(`/companies/1/activity-events?entityType=vendor_bill&entityId=${billId}&limit=50`),
  );
  const recordedEvents = activity.body.filter((event) => event.action === 'payment_recorded');
  const reversedEvents = activity.body.filter((event) => event.action === 'payment_reversed');
  assert.equal(recordedEvents.length, 2);
  assert.equal(reversedEvents.length, 2);
  assert.ok(recordedEvents.some((event) => event.metadata.paymentId === firstPaymentId));
  assert.ok(reversedEvents.some((event) => event.metadata.paymentId === finalPaymentId));

  const reverseAgain = await auth(
    request(app).delete(`/vendor-bills/${billId}/payments/${firstPaymentId}`),
  );
  assert.equal(reverseAgain.status, 404);
});

test('vendor bill payments in locked periods cannot be reversed', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const billResponse = await auth(request(app).post('/companies/1/finance/vendor-bills')).send({
    vendorName: 'Locked Payable Vendor',
    issueDate: '2026-05-01T12:00:00.000Z',
    dueDate: '2026-06-15T12:00:00.000Z',
    amount: 90,
    status: 'Approved',
  });
  assert.equal(billResponse.status, 201);
  const billId = billResponse.body.id;

  const paymentResponse = await auth(request(app).post(`/vendor-bills/${billId}/payments`)).send({
    amount: 40,
    method: 'Cash',
    note: 'Locked period payment',
    paidAt: '2026-05-10T12:00:00.000Z',
  });
  assert.equal(paymentResponse.status, 201);
  const paymentId = paymentResponse.body.payment.id;

  const lockResponse = await auth(request(app).put('/companies/1/finance/settings')).send({
    lockedThroughDate: '2026-05-31T23:59:59.999Z',
  });
  assert.equal(lockResponse.status, 200);

  const reverseResponse = await auth(
    request(app).delete(`/vendor-bills/${billId}/payments/${paymentId}`),
  );
  assert.equal(reverseResponse.status, 400);
  assert.match(reverseResponse.body.message, /locked accounting period/i);

  const payments = await auth(request(app).get(`/vendor-bills/${billId}/payments`));
  assert.equal(payments.body.length, 1);
  assert.equal(payments.body[0].id, paymentId);

  const journal = await auth(request(app).get('/companies/1/finance/journal?limit=500'));
  assert.equal(
    journal.body.some(
      (entry) => entry.sourceType === 'vendor_bill_payment' && entry.sourceId === paymentId,
    ),
    true,
  );
});

test('chart of accounts supports rich custom account CRUD while protecting system accounts', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const listResponse = await request(app)
    .get('/companies/1/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(listResponse.status, 200);
  assert.ok(listResponse.body.some((account) => account.code === '1200'));
  assert.ok(listResponse.body.some((account) => account.code === '5500'));

  const createResponse = await request(app)
    .post('/companies/1/finance/accounts')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Training Expense',
      type: 'Expense',
      detailType: 'Staff development',
      description: 'Courses, certifications, and workshops.',
      isActive: true,
    });
  assert.equal(createResponse.status, 201);
  // Next available Expense code after the seeded defaults (…, 5700 Marketing,
  // 5900 Commission Expense) is 5910.
  assert.equal(createResponse.body.code, '5910');
  assert.equal(createResponse.body.detailType, 'Staff development');
  const accountId = createResponse.body.id;

  const updateResponse = await request(app)
    .put(`/finance/accounts/${accountId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: '9999',
      name: 'Learning and Training Expense',
      description: 'Updated description',
      isActive: false,
    });
  assert.equal(updateResponse.status, 200);
  // Code is immutable — the attempted change to 9999 is ignored.
  assert.equal(updateResponse.body.code, '5910');
  assert.equal(updateResponse.body.name, 'Learning and Training Expense');
  assert.equal(updateResponse.body.isActive, false);

  const systemAccount = listResponse.body.find((account) => account.code === '1000');
  assert.ok(systemAccount);
  const systemDeleteResponse = await request(app)
    .delete(`/finance/accounts/${systemAccount.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(systemDeleteResponse.status, 400);
  assert.match(systemDeleteResponse.body.message, /system accounts cannot be deleted/i);

  const deleteResponse = await request(app)
    .delete(`/finance/accounts/${accountId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(deleteResponse.status, 204);
});

test('bulk vendor bill status update moves only matching records', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const firstBill = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vendorName: 'Vendor A',
      billNumber: 'VB-BULK-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-04-22T00:00:00.000Z',
      amount: 75,
      status: 'Draft',
    });
  assert.equal(firstBill.status, 201);

  const secondBill = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vendorName: 'Vendor B',
      billNumber: 'VB-BULK-2',
      issueDate: '2026-04-08T00:00:00.000Z',
      dueDate: '2026-04-22T00:00:00.000Z',
      amount: 95,
      status: 'Approved',
    });
  assert.equal(secondBill.status, 201);

  const bulkResponse = await request(app)
    .post('/companies/1/finance/vendor-bills/bulk-status')
    .set('Authorization', `Bearer ${token}`)
    .send({
      currentStatus: 'Draft',
      targetStatus: 'Approved',
    });
  assert.equal(bulkResponse.status, 200);
  assert.equal(bulkResponse.body.updatedCount, 1);

  const billsResponse = await request(app)
    .get('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(billsResponse.status, 200);
  const updatedFirst = billsResponse.body.find((bill) => bill.id === firstBill.body.id);
  const untouchedSecond = billsResponse.body.find((bill) => bill.id === secondBill.body.id);
  assert.ok(updatedFirst);
  assert.ok(untouchedSecond);
  assert.equal(updatedFirst.status, 'Approved');
  assert.equal(untouchedSecond.status, 'Approved');
});

test('manager can update an employee in their company but not a user with unmanaged assignments', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const allowedResponse = await request(app)
    .put('/users/user-3')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Charlie Updated',
      companyRoles: [{ companyId: '1', role: 'Employee', positionId: 'pos-3' }],
    });
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedResponse.body.name, 'Charlie Updated');

  const deniedResponse = await request(app)
    .put('/users/user-5')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Fox Updated',
      companyRoles: [
        { companyId: '1', role: 'Employee', positionId: 'pos-3' },
        { companyId: '2', role: 'Employee', positionId: 'pos-5' },
      ],
    });
  assert.equal(deniedResponse.status, 403);
});

test('manager cannot delete a user with assignments outside managed companies', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const response = await request(app)
    .delete('/users/user-5')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 403);
});

test('manual journal entry rejects unbalanced lines and foreign-company accounts', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const companyOneAccounts = await request(app)
    .get('/companies/1/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(companyOneAccounts.status, 200);
  const cashAccount = companyOneAccounts.body.find((account) => account.code === '1000');
  const revenueAccount = companyOneAccounts.body.find((account) => account.code === '4000');
  assert.ok(cashAccount);
  assert.ok(revenueAccount);

  const unbalancedResponse = await request(app)
    .post('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`)
    .send({
      entryDate: '2026-04-08T00:00:00.000Z',
      lines: [
        { accountId: cashAccount.id, debit: 100, credit: 0 },
        { accountId: revenueAccount.id, debit: 0, credit: 50 },
      ],
    });
  assert.equal(unbalancedResponse.status, 400);
  assert.match(unbalancedResponse.body.message, /unbalanced/i);

  const companyTwoAccounts = await request(app)
    .get('/companies/2/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(companyTwoAccounts.status, 200);
  const foreignAccount = companyTwoAccounts.body.find((account) => account.code === '1000');
  assert.ok(foreignAccount);

  const foreignAccountResponse = await request(app)
    .post('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`)
    .send({
      entryDate: '2026-04-08T00:00:00.000Z',
      lines: [
        { accountId: cashAccount.id, debit: 100, credit: 0 },
        { accountId: foreignAccount.id, debit: 0, credit: 100 },
      ],
    });
  assert.equal(foreignAccountResponse.status, 400);
  assert.match(foreignAccountResponse.body.message, /ledger account/i);
});

test('finance reports expose account activity, trial balance, and profit and loss', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const accountsResponse = await request(app)
    .get('/companies/1/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(accountsResponse.status, 200);
  const cashAccount = accountsResponse.body.find((account) => account.code === '1000');
  const revenueAccount = accountsResponse.body.find((account) => account.code === '4000');
  const expenseAccount = accountsResponse.body.find((account) => account.code === '5000');
  assert.ok(cashAccount);
  assert.ok(revenueAccount);
  assert.ok(expenseAccount);

  const revenueEntry = await request(app)
    .post('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`)
    .send({
      memo: 'Recognize service revenue',
      entryDate: '2026-04-10T00:00:00.000Z',
      lines: [
        { accountId: cashAccount.id, description: 'Cash received', debit: 600, credit: 0 },
        { accountId: revenueAccount.id, description: 'Service revenue', debit: 0, credit: 600 },
      ],
    });
  assert.equal(revenueEntry.status, 201);

  const expenseEntry = await request(app)
    .post('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`)
    .send({
      memo: 'Pay operating expense',
      entryDate: '2026-04-11T00:00:00.000Z',
      lines: [
        { accountId: expenseAccount.id, description: 'Office supplies', debit: 150, credit: 0 },
        { accountId: cashAccount.id, description: 'Cash paid', debit: 0, credit: 150 },
      ],
    });
  assert.equal(expenseEntry.status, 201);

  const activityResponse = await request(app)
    .get(`/companies/1/finance/accounts/${cashAccount.id}/activity?from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.999Z`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(activityResponse.status, 200);
  assert.equal(activityResponse.body.openingBalance, 0);
  assert.equal(activityResponse.body.closingBalance, 450);
  assert.deepEqual(
    activityResponse.body.lines.map((line) => line.runningBalance),
    [600, 450],
  );

  const trialBalanceResponse = await request(app)
    .get('/companies/1/finance/trial-balance?asOf=2026-04-30T23:59:59.999Z')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(trialBalanceResponse.status, 200);
  assert.equal(trialBalanceResponse.body.isBalanced, true);
  assert.equal(trialBalanceResponse.body.totalDebit, 600);
  assert.equal(trialBalanceResponse.body.totalCredit, 600);

  const profitAndLossResponse = await request(app)
    .get('/companies/1/finance/profit-and-loss?from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.999Z')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(profitAndLossResponse.status, 200);
  assert.equal(profitAndLossResponse.body.totalRevenue, 600);
  assert.equal(profitAndLossResponse.body.totalExpenses, 150);
  assert.equal(profitAndLossResponse.body.netIncome, 450);
});

test('company numbering settings drive generated references and invoices', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const listResponse = await request(app)
    .get('/companies/1/numbering-settings')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.some((setting) => setting.entityType === 'client'), true);

  const updateClientNumbering = await request(app)
    .put('/companies/1/numbering-settings/client')
    .set('Authorization', `Bearer ${token}`)
    .send({
      prefix: 'CUST-',
      padLength: 3,
      nextNumber: 7,
    });
  assert.equal(updateClientNumbering.status, 200);
  assert.equal(updateClientNumbering.body.sample, 'CUST-007');

  const createClientResponse = await request(app)
    .post('/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '1',
      name: 'Numbered Client',
      email: 'numbered@example.com',
      address: '123 Number Street',
    });
  assert.equal(createClientResponse.status, 201);
  assert.equal(createClientResponse.body.reference, 'CUST-007');

  const updateInvoiceNumbering = await request(app)
    .put('/companies/1/numbering-settings/sales_invoice')
    .set('Authorization', `Bearer ${token}`)
    .send({
      prefix: 'SI-',
      padLength: 4,
      nextNumber: 12,
    });
  assert.equal(updateInvoiceNumbering.status, 200);
  assert.equal(updateInvoiceNumbering.body.sample, 'SI-0012');

  const invoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '1',
      clientId: createClientResponse.body.id,
      issueDate: '2026-04-12T00:00:00.000Z',
      dueDate: '2026-04-30T00:00:00.000Z',
      lineItems: [
        {
          itemType: 'Manual',
          description: 'Generated invoice number service',
          quantity: 1,
          unitPrice: 75,
        },
      ],
    });
  assert.equal(invoiceResponse.status, 201);
  assert.equal(invoiceResponse.body.invoiceNumber, 'SI-0012');

  const employeeToken = await login(app, 'charlie.d@innovatecorp.com');
  const deniedResponse = await request(app)
    .put('/companies/1/numbering-settings/client')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ prefix: 'NO-' });
  assert.equal(deniedResponse.status, 403);
});

test('record attachments are listed in a combined audit timeline', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const createInvoiceResponse = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-12T00:00:00.000Z',
      dueDate: '2026-04-30T00:00:00.000Z',
      lineItems: [
        {
          itemType: 'Manual',
          description: 'Attachment test service',
          quantity: 1,
          unitPrice: 125,
        },
      ],
    });
  assert.equal(createInvoiceResponse.status, 201);
  const invoiceId = createInvoiceResponse.body.id;

  const attachmentResponse = await request(app)
    .post(`/companies/1/records/invoice/${invoiceId}/attachments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'signed-contract.pdf',
      url: 'https://example.com/signed-contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      note: 'Signed customer approval',
    });
  assert.equal(attachmentResponse.status, 201);
  assert.equal(attachmentResponse.body.uploadedByName, 'Admin User');

  const listResponse = await request(app)
    .get(`/companies/1/records/invoice/${invoiceId}/attachments`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.length, 1);
  assert.equal(listResponse.body[0].fileName, 'signed-contract.pdf');

  const timelineResponse = await request(app)
    .get(`/companies/1/records/invoice/${invoiceId}/timeline`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(timelineResponse.status, 200);
  assert.equal(timelineResponse.body.some((item) => item.type === 'attachment'), true);
  assert.equal(
    timelineResponse.body.some((item) => item.activity?.action === 'attachment_added'),
    true,
  );

  const employeeToken = await login(app, 'charlie.d@innovatecorp.com');
  const deniedResponse = await request(app)
    .get(`/companies/1/records/invoice/${invoiceId}/attachments`)
    .set('Authorization', `Bearer ${employeeToken}`);
  assert.equal(deniedResponse.status, 403);

  const deleteResponse = await request(app)
    .delete(`/record-attachments/${attachmentResponse.body.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(deleteResponse.status, 204);

  const emptyListResponse = await request(app)
    .get(`/companies/1/records/invoice/${invoiceId}/attachments`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(emptyListResponse.status, 200);
  assert.equal(emptyListResponse.body.length, 0);
});

test('finance controls block locked-period postings and duplicate external references', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const lockResponse = await request(app)
    .put('/companies/1/finance/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fiscalYearStartMonth: 4,
      lockedThroughDate: '2026-04-15T00:00:00.000Z',
      currencyCode: 'OMR',
    });
  assert.equal(lockResponse.status, 200);
  assert.equal(lockResponse.body.fiscalYearStartMonth, 4);
  assert.equal(lockResponse.body.currencyCode, 'OMR');

  const accountsResponse = await request(app)
    .get('/companies/1/finance/accounts')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(accountsResponse.status, 200);
  const cashAccount = accountsResponse.body.find((account) => account.code === '1000');
  const revenueAccount = accountsResponse.body.find((account) => account.code === '4000');
  assert.ok(cashAccount);
  assert.ok(revenueAccount);

  const lockedJournal = await request(app)
    .post('/companies/1/finance/journal')
    .set('Authorization', `Bearer ${token}`)
    .send({
      entryDate: '2026-04-10T00:00:00.000Z',
      lines: [
        { accountId: cashAccount.id, debit: 100, credit: 0 },
        { accountId: revenueAccount.id, debit: 0, credit: 100 },
      ],
    });
  assert.equal(lockedJournal.status, 400);
  assert.match(lockedJournal.body.message, /locked accounting period/i);

  const firstInvoice = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-DUP-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-20T00:00:00.000Z',
      dueDate: '2026-04-30T00:00:00.000Z',
      lineItems: [{ itemType: 'Manual', description: 'Duplicate check', quantity: 1, unitPrice: 50 }],
    });
  assert.equal(firstInvoice.status, 201);

  const duplicateInvoice = await request(app)
    .post('/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      invoiceNumber: 'INV-DUP-1',
      companyId: '1',
      clientId: 'client-1',
      issueDate: '2026-04-20T00:00:00.000Z',
      dueDate: '2026-04-30T00:00:00.000Z',
      lineItems: [{ itemType: 'Manual', description: 'Duplicate check', quantity: 1, unitPrice: 50 }],
    });
  assert.equal(duplicateInvoice.status, 400);
  assert.match(duplicateInvoice.body.message, /already exists/i);

  const firstVendorInvoice = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vendorName: 'Reference Vendor',
      referenceInvoiceNumber: 'SUP-INV-7',
      issueDate: '2026-04-20T00:00:00.000Z',
      dueDate: '2026-04-30T00:00:00.000Z',
      amount: 80,
      status: 'Draft',
    });
  assert.equal(firstVendorInvoice.status, 201);

  const duplicateVendorInvoice = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vendorName: 'Reference Vendor',
      referenceInvoiceNumber: 'SUP-INV-7',
      issueDate: '2026-04-20T00:00:00.000Z',
      dueDate: '2026-04-30T00:00:00.000Z',
      amount: 80,
      status: 'Draft',
    });
  assert.equal(duplicateVendorInvoice.status, 400);
  assert.match(duplicateVendorInvoice.body.message, /already exists/i);
});

test('supplier management is company-scoped and inventory can link preferred suppliers', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  await request(app).post('/companies/1/warehouses').set('Authorization', `Bearer ${token}`).send({ name: 'Main' });

  const createSupplierResponse = await request(app)
    .post('/companies/1/suppliers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Warehouse Partner',
      contactName: 'Aisha Noor',
      email: 'ops@warehousepartner.com',
      paymentTermsDays: 21,
    });
  assert.equal(createSupplierResponse.status, 201);
  const supplierId = createSupplierResponse.body.id;
  assert.match(createSupplierResponse.body.reference, /^TP-\d{2}$/);

  const listSuppliersResponse = await request(app)
    .get('/companies/1/suppliers')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(listSuppliersResponse.status, 200);
  assert.ok(listSuppliersResponse.body.some((supplier) => supplier.id === supplierId));

  const createItemResponse = await request(app)
    .post('/companies/1/inventory-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      sku: 'SUP-LINK-1',
      name: 'Supplier Linked Item',
      category: 'Testing',
      unit: 'pcs',
      onHand: 12,
      reorderPoint: 3,
      unitCost: 4.5,
      location: 'Main',
      preferredSupplierId: supplierId,
    });
  assert.equal(createItemResponse.status, 201);
  assert.equal(createItemResponse.body.preferredSupplierId, supplierId);
  assert.match(createItemResponse.body.sku, /^SKU-\d{4}$/);

  const invalidLinkResponse = await request(app)
    .post('/companies/1/inventory-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      sku: 'SUP-BAD-1',
      name: 'Bad Supplier Link',
      category: 'Testing',
      unit: 'pcs',
      onHand: 1,
      reorderPoint: 1,
      unitCost: 2,
      preferredSupplierId: 'supplier-4',
    });
  assert.equal(invalidLinkResponse.status, 400);
  assert.match(invalidLinkResponse.body.message, /supplier/i);
});

test('clients support richer profile fields and activity events', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const createClientResponse = await request(app)
    .post('/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '1',
      name: 'Backbone Client',
      email: 'team@backboneclient.com',
      address: '200 Backbone Ave, Austin, TX',
      contactName: 'Rami Noor',
      phone: '+1 512 555 0188',
      status: 'Lead',
      notes: 'Requested proposal follow-up.',
    });
  assert.equal(createClientResponse.status, 201);
  assert.match(createClientResponse.body.reference, /^AR-\d{2}$/);
  assert.equal(createClientResponse.body.status, 'Lead');
  const clientId = createClientResponse.body.id;

  const updateClientResponse = await request(app)
    .put(`/clients/${clientId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      status: 'Active',
      notes: 'Converted to active account.',
    });
  assert.equal(updateClientResponse.status, 200);
  assert.equal(updateClientResponse.body.status, 'Active');
  assert.match(updateClientResponse.body.notes, /active account/i);

  const listClientsResponse = await request(app)
    .get('/companies/1/clients')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(listClientsResponse.status, 200);
  const client = listClientsResponse.body.find((entry) => entry.id === clientId);
  assert.ok(client);
  assert.equal(client.contactName, 'Rami Noor');
  assert.equal(client.status, 'Active');

  const activityResponse = await request(app)
    .get(`/companies/1/activity-events?entityType=client&entityId=${clientId}&limit=10`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(activityResponse.status, 200);
  assert.ok(activityResponse.body.length >= 2);
  assert.ok(activityResponse.body.some((event) => event.action === 'created'));
  assert.ok(activityResponse.body.some((event) => event.action === 'updated'));
});

test('activity events capture actor metadata and can be filtered by user', async () => {
  const app = makeApp();
  const token = await login(app, 'samantha.b@innovatecorp.com');

  const response = await request(app)
    .post('/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyId: '1',
      name: 'Actor Filter Client',
      email: 'ops@actorclient.com',
      address: '55 Actor Way, Austin, TX',
    });
  assert.equal(response.status, 201);

  const activityResponse = await request(app)
    .get('/companies/1/activity-events?actorUserId=user-2&limit=10')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(activityResponse.status, 200);
  assert.ok(activityResponse.body.length >= 1);
  assert.ok(activityResponse.body.some((event) => event.actorUserId === 'user-2'));
  assert.ok(activityResponse.body.some((event) => /Samantha Bee/i.test(event.actorName || '')));
});

test('crm pipeline supports influencer profiles, opportunities, requests, and commissions', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const contactResponse = await request(app)
    .post('/companies/1/contacts')
    .set('Authorization', `Bearer ${token}`)
    .send({
      kind: 'Person',
      name: 'Noor Creator',
      email: 'noor.creator@example.com',
      roles: ['Lead', 'Influencer'],
      influencerPlatform: 'Instagram',
      influencerHandle: '@noorcreates',
      influencerNiche: 'Lifestyle',
      followerCount: 125000,
      engagementRate: 4.2,
      rateCardAmount: 900,
      location: 'Muscat',
      languages: ['Arabic', 'English'],
      availabilityStatus: 'Available',
    });
  assert.equal(contactResponse.status, 201);
  assert.equal(contactResponse.body.influencerHandle, '@noorcreates');
  assert.equal(contactResponse.body.followerCount, 125000);
  assert.deepEqual(contactResponse.body.languages, ['Arabic', 'English']);
  const contactId = contactResponse.body.id;

  const ruleResponse = await request(app)
    .post('/companies/1/commission-rules')
    .set('Authorization', `Bearer ${token}`)
    .send({
      serviceType: 'Influencer Campaign',
      basis: 'Revenue',
      rateType: 'Percent',
      rate: 10,
    });
  assert.equal(ruleResponse.status, 201);

  const opportunityResponse = await request(app)
    .post('/companies/1/opportunities')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contactId,
      title: 'Noor Ramadan Campaign',
      serviceType: 'Influencer Campaign',
      expectedRevenue: 5000,
      probability: 70,
      expectedCloseDate: '2026-06-01T00:00:00.000Z',
    });
  assert.equal(opportunityResponse.status, 201);
  assert.equal(opportunityResponse.body.stage, 'New');
  const opportunityId = opportunityResponse.body.id;

  const updatedOpportunityResponse = await request(app)
    .put(`/opportunities/${opportunityId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Noor Ramadan Campaign Updated',
      expectedRevenue: 5500,
      probability: 80,
      notes: 'Updated during qualification.',
    });
  assert.equal(updatedOpportunityResponse.status, 200);
  assert.equal(updatedOpportunityResponse.body.title, 'Noor Ramadan Campaign Updated');
  assert.equal(updatedOpportunityResponse.body.expectedRevenue, 5500);

	  const proposalResponse = await request(app)
	    .post('/companies/1/proposals')
	    .set('Authorization', `Bearer ${token}`)
	    .send({
	      opportunityId,
	      title: 'Noor Ramadan Campaign Proposal',
	      validUntil: '2026-05-20T00:00:00.000Z',
	      items: [
	        {
	          description: 'Influencer campaign package',
	          quantity: 1,
	          unitPrice: 5000,
	        },
	      ],
	    });
	  assert.equal(proposalResponse.status, 201);
	  assert.equal(proposalResponse.body.totalAmount, 5000);
	  assert.equal(proposalResponse.body.status, 'Draft');

	  const updatedProposalResponse = await request(app)
	    .put(`/proposals/${proposalResponse.body.id}`)
	    .set('Authorization', `Bearer ${token}`)
	    .send({
	      title: 'Noor Ramadan Campaign Proposal v2',
	      items: [
	        {
	          description: 'Influencer campaign package v2',
	          quantity: 1,
	          unitPrice: 5500,
	        },
	      ],
	    });
	  assert.equal(updatedProposalResponse.status, 200);
	  assert.equal(updatedProposalResponse.body.title, 'Noor Ramadan Campaign Proposal v2');
	  assert.equal(updatedProposalResponse.body.totalAmount, 5500);

	  const sentProposalResponse = await request(app)
	    .patch(`/proposals/${proposalResponse.body.id}/status`)
	    .set('Authorization', `Bearer ${token}`)
	    .send({ status: 'Sent' });
	  assert.equal(sentProposalResponse.status, 200);
	  assert.equal(sentProposalResponse.body.status, 'Sent');

	  const acceptedProposalResponse = await request(app)
	    .patch(`/proposals/${proposalResponse.body.id}/status`)
	    .set('Authorization', `Bearer ${token}`)
	    .send({ status: 'Accepted' });
	  assert.equal(acceptedProposalResponse.status, 200);
	  assert.equal(acceptedProposalResponse.body.status, 'Accepted');

	  const commissionsResponse = await request(app)
    .get('/companies/1/commissions')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(commissionsResponse.status, 200);
  const commission = commissionsResponse.body.find((item) => item.opportunityId === opportunityId);
  assert.ok(commission);
  assert.equal(commission.amount, 550);
  assert.equal(commission.status, 'Draft');

  const requestResponse = await request(app)
    .post('/companies/1/vendor-requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
	      name: 'Creator Studio',
	      role: 'Vendor',
	      requestType: 'Quote',
	      platform: 'Production',
	      dueDate: '2026-06-05T00:00:00.000Z',
	      cost: 750,
	      details: 'Suggested studio for short-form campaigns.',
	    });
	  assert.equal(requestResponse.status, 201);
	  assert.equal(requestResponse.body.requestType, 'Quote');
	  assert.equal(requestResponse.body.cost, 750);

	  const updatedRequestResponse = await request(app)
	    .put(`/vendor-requests/${requestResponse.body.id}`)
	    .set('Authorization', `Bearer ${token}`)
	    .send({
	      requestType: 'Booking',
	      cost: 900,
	      details: 'Updated studio quote.',
	    });
	  assert.equal(updatedRequestResponse.status, 200);
	  assert.equal(updatedRequestResponse.body.requestType, 'Booking');
	  assert.equal(updatedRequestResponse.body.cost, 900);

  const approveResponse = await request(app)
    .patch(`/vendor-requests/${requestResponse.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'Approved', notes: 'Approved for vendor onboarding.' });
  assert.equal(approveResponse.status, 200);
  assert.equal(approveResponse.body.status, 'Approved');
  assert.ok(approveResponse.body.contactId);

	  const contactsResponse = await request(app)
	    .get('/companies/1/contacts?role=Vendor')
	    .set('Authorization', `Bearer ${token}`);
		  assert.equal(contactsResponse.status, 200);
		  assert.ok(contactsResponse.body.some((contact) => contact.id === approveResponse.body.contactId));

		  const campaignResponse = await request(app)
		    .post('/companies/1/campaigns')
		    .set('Authorization', `Bearer ${token}`)
		    .send({
		      proposalId: proposalResponse.body.id,
		      opportunityId,
		      contactId,
		      name: 'Noor Ramadan Campaign Execution',
		      status: 'Planned',
		      startDate: '2026-06-02T00:00:00.000Z',
		      endDate: '2026-06-20T00:00:00.000Z',
		      budget: 2500,
		      visibility: 'Public',
		    });
		  assert.equal(campaignResponse.status, 201);
		  assert.equal(campaignResponse.body.status, 'Planned');
		  assert.equal(campaignResponse.body.budget, 2500);
		  const campaignId = campaignResponse.body.id;

		  const deliverableResponse = await request(app)
		    .post(`/campaigns/${campaignId}/deliverables`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({
		      contactId,
		      vendorContactId: approveResponse.body.contactId,
		      title: 'Instagram Reel',
		      platform: 'Instagram',
		      dueDate: '2026-06-10T00:00:00.000Z',
		      status: 'Planned',
		      price: 5500,
		      cost: 900,
		    });
		  assert.equal(deliverableResponse.status, 201);
		  assert.equal(deliverableResponse.body.title, 'Instagram Reel');
		  assert.equal(deliverableResponse.body.vendorContactId, approveResponse.body.contactId);
		  assert.equal(deliverableResponse.body.price, 5500);
		  assert.equal(deliverableResponse.body.cost, 900);
		  // A vendor contact implies an external deliverable.
		  assert.equal(deliverableResponse.body.fulfillment, 'External');

		  // An internal deliverable carries a cost for margin but no vendor,
		  // and must never generate a vendor bill.
		  const internalDeliverableResponse = await request(app)
		    .post(`/campaigns/${campaignId}/deliverables`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({ title: 'In-house edit', fulfillment: 'Internal', price: 0, cost: 400 });
		  assert.equal(internalDeliverableResponse.status, 201);
		  assert.equal(internalDeliverableResponse.body.fulfillment, 'Internal');
		  assert.ok(!internalDeliverableResponse.body.vendorContactId);

		  // An external deliverable with no vendor is rejected.
		  const badExternalResponse = await request(app)
		    .post(`/campaigns/${campaignId}/deliverables`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({ title: 'No vendor', fulfillment: 'External', cost: 100 });
		  assert.equal(badExternalResponse.status, 400);

		  const updatedDeliverableResponse = await request(app)
		    .put(`/campaign-deliverables/${deliverableResponse.body.id}`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({ status: 'Published', contentUrl: 'https://example.com/reel' });
		  assert.equal(updatedDeliverableResponse.status, 200);
		  assert.equal(updatedDeliverableResponse.body.status, 'Published');

		  const plRange = 'from=2026-06-01T00:00:00.000Z&to=2026-06-30T23:59:59.999Z';
		  const plBefore = await request(app)
		    .get(`/companies/1/finance/profit-and-loss?${plRange}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(plBefore.status, 200);

		  const campaignInvoiceResponse = await request(app)
		    .post(`/companies/1/campaigns/${campaignId}/generate-invoice`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(campaignInvoiceResponse.status, 201);
		  assert.equal(campaignInvoiceResponse.body.campaignId, campaignId);
		  assert.equal(campaignInvoiceResponse.body.contactId, contactId);
		  assert.equal(campaignInvoiceResponse.body.clientId, contactId);
		  assert.equal(campaignInvoiceResponse.body.total, 5500);
		  assert.equal(campaignInvoiceResponse.body.status, 'Draft');

		  // #1: a generated campaign invoice is a Draft and must NOT recognise
		  // revenue until it is issued.
		  const plDraft = await request(app)
		    .get(`/companies/1/finance/profit-and-loss?${plRange}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(plDraft.body.totalRevenue - plBefore.body.totalRevenue, 0);

		  // Issuing the invoice recognises the revenue.
		  const sendInvoiceResponse = await request(app)
		    .patch(`/invoices/${campaignInvoiceResponse.body.id}/status`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({ status: 'Sent' });
		  assert.equal(sendInvoiceResponse.status, 200);
		  const plSent = await request(app)
		    .get(`/companies/1/finance/profit-and-loss?${plRange}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(plSent.body.totalRevenue - plBefore.body.totalRevenue, 5500);

		  const campaignVendorBillsResponse = await request(app)
		    .post(`/companies/1/campaigns/${campaignId}/generate-vendor-bills`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(campaignVendorBillsResponse.status, 201);
		  assert.equal(campaignVendorBillsResponse.body.length, 1);
		  assert.equal(campaignVendorBillsResponse.body[0].campaignId, campaignId);
		  assert.equal(campaignVendorBillsResponse.body[0].amount, 900);

		  const assignmentResponse = await request(app)
		    .post(`/campaigns/${campaignId}/assignments`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({
		      contactId,
		      role: 'Influencer',
		      agreedRate: 900,
		      status: 'Confirmed',
		    });
		  assert.equal(assignmentResponse.status, 201);
		  assert.equal(assignmentResponse.body.agreedRate, 900);

		  const expenseResponse = await request(app)
		    .post(`/campaigns/${campaignId}/expenses`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({
		      contactId,
		      description: 'Boosting spend',
		      amount: 120,
		      expenseDate: '2026-06-12T00:00:00.000Z',
		      billable: true,
		      status: 'Submitted',
		    });
		  assert.equal(expenseResponse.status, 201);
		  assert.equal(expenseResponse.body.amount, 120);
		  assert.equal(expenseResponse.body.billable, true);

		  // #2: a Submitted campaign expense is not on the books yet; approving it
		  // posts to the ledger (DR Marketing Expense / CR Cash).
		  const plBeforeApprove = await request(app)
		    .get(`/companies/1/finance/profit-and-loss?${plRange}`)
		    .set('Authorization', `Bearer ${token}`);
		  const approveExpenseResponse = await request(app)
		    .put(`/campaign-expenses/${expenseResponse.body.id}`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({ status: 'Approved' });
		  assert.equal(approveExpenseResponse.status, 200);
		  assert.equal(approveExpenseResponse.body.status, 'Approved');
		  const plAfterApprove = await request(app)
		    .get(`/companies/1/finance/profit-and-loss?${plRange}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(plAfterApprove.body.totalExpenses - plBeforeApprove.body.totalExpenses, 120);

		  // Deleting the expense reverses the posting.
		  const deleteExpenseResponse = await request(app)
		    .delete(`/campaign-expenses/${expenseResponse.body.id}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(deleteExpenseResponse.status, 204);
		  const plAfterDelete = await request(app)
		    .get(`/companies/1/finance/profit-and-loss?${plRange}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(plAfterDelete.body.totalExpenses - plBeforeApprove.body.totalExpenses, 0);

		  const campaignExecutionResponse = await request(app)
		    .get(`/campaigns/${campaignId}/deliverables`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(campaignExecutionResponse.status, 200);
		  assert.ok(campaignExecutionResponse.body.some((item) => item.id === deliverableResponse.body.id));

		  const updatedCampaignResponse = await request(app)
		    .put(`/campaigns/${campaignId}`)
		    .set('Authorization', `Bearer ${token}`)
		    .send({ status: 'Active', budget: 3000 });
		  assert.equal(updatedCampaignResponse.status, 200);
		  assert.equal(updatedCampaignResponse.body.status, 'Active');
		  assert.equal(updatedCampaignResponse.body.budget, 3000);

		  const deleteCampaignResponse = await request(app)
		    .delete(`/campaigns/${campaignId}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(deleteCampaignResponse.status, 204);

		  const campaignsResponse = await request(app)
		    .get('/companies/1/campaigns?includeArchived=true')
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(campaignsResponse.status, 200);
		  const archivedCampaign = campaignsResponse.body.find((item) => item.id === campaignId);
		  assert.ok(archivedCampaign);
		  assert.equal(archivedCampaign.status, 'Archived');
		  assert.ok(archivedCampaign.archivedAt);

		  const dashboardResponse = await request(app)
	    .get('/companies/1/crm-dashboard')
	    .set('Authorization', `Bearer ${token}`);
	  assert.equal(dashboardResponse.status, 200);
	  assert.ok(dashboardResponse.body.wonDeals >= 1);
	  assert.ok(dashboardResponse.body.wonRevenue >= 5000);
	  assert.ok(Array.isArray(dashboardResponse.body.opportunitiesByStage));

	  const myDashboardResponse = await request(app)
	    .get('/companies/1/crm-dashboard?ownerUserId=me')
	    .set('Authorization', `Bearer ${token}`);
	  assert.equal(myDashboardResponse.status, 200);
	  assert.equal(myDashboardResponse.body.ownerUserId, 'admin-placeholder-id');
	  assert.ok(myDashboardResponse.body.commissionDraft >= 550);

		  const archiveProposalResponse = await request(app)
		    .delete(`/proposals/${proposalResponse.body.id}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(archiveProposalResponse.status, 204);

		  const archiveVendorRequestResponse = await request(app)
		    .delete(`/vendor-requests/${requestResponse.body.id}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(archiveVendorRequestResponse.status, 204);

		  const archiveOpportunityResponse = await request(app)
		    .delete(`/opportunities/${opportunityId}`)
		    .set('Authorization', `Bearer ${token}`);
		  assert.equal(archiveOpportunityResponse.status, 204);
	});

test('management summary and report exports surface reporting controls', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const summaryResponse = await request(app)
    .get('/companies/1/reports/management-summary')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(summaryResponse.status, 200);
  assert.ok(summaryResponse.body.finance);
  assert.ok(summaryResponse.body.inventory);
  assert.ok(Array.isArray(summaryResponse.body.topClients));
  assert.ok(Array.isArray(summaryResponse.body.topSuppliers));
  assert.ok(Array.isArray(summaryResponse.body.lowStockItems));
  assert.ok(Array.isArray(summaryResponse.body.recentActivity));

  const exportResponse = await request(app)
    .get('/companies/1/reports/export/management-kpis')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(exportResponse.status, 200);
  assert.match(String(exportResponse.headers['content-type']), /text\/csv/i);
  assert.match(exportResponse.text, /openReceivables/i);
});

test('stock movements are recorded for opening balances, receipts, and manual adjustments', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  await request(app).post('/companies/1/warehouses').set('Authorization', `Bearer ${token}`).send({ name: 'Main' });

  const createItemResponse = await request(app)
    .post('/companies/1/inventory-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      sku: 'MOVE-1',
      name: 'Movement Item',
      category: 'Testing',
      unit: 'pcs',
      onHand: 5,
      reorderPoint: 2,
      unitCost: 10,
      location: 'Main',
    });
  assert.equal(createItemResponse.status, 201);
  const itemId = createItemResponse.body.id;
  const itemSku = createItemResponse.body.sku;

  let movementResponse = await request(app)
    .get(`/companies/1/stock-movements?inventoryItemId=${itemId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(movementResponse.status, 200);
  assert.ok(
    movementResponse.body.some(
      (movement) => movement.movementType === 'Opening' && movement.quantityChange === 5,
    ),
  );

  const createOrderResponse = await request(app)
    .post('/companies/1/purchase-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNumber: 'PO-MOVE-1',
      supplierId: 'supplier-1',
      orderDate: '2026-04-08T00:00:00.000Z',
      status: 'Ordered',
      items: [
        {
          inventoryItemId: itemId,
          sku: itemSku,
          description: 'Movement Item',
          quantity: 7,
          unitCost: 10,
          lineTotal: 70,
        },
      ],
    });
  assert.equal(createOrderResponse.status, 201);

  const receiveOrderResponse = await request(app)
    .patch(`/purchase-orders/${createOrderResponse.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'Received' });
  assert.equal(receiveOrderResponse.status, 200);

  const adjustResponse = await request(app)
    .post(`/companies/1/inventory-items/${itemId}/adjustments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      quantityChange: -2,
      note: 'Cycle count correction',
    });
  assert.equal(adjustResponse.status, 201);
  assert.equal(adjustResponse.body.item.onHand, 10);

  movementResponse = await request(app)
    .get(`/companies/1/stock-movements?inventoryItemId=${itemId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(movementResponse.status, 200);
  assert.ok(
    movementResponse.body.some(
      (movement) =>
        movement.movementType === 'Receipt'
        && movement.quantityChange === 7
        && movement.referenceId === createOrderResponse.body.id,
    ),
  );
  assert.ok(
    movementResponse.body.some(
      (movement) =>
        movement.movementType === 'Adjustment'
        && movement.quantityChange === -2
        && /cycle count/i.test(movement.note || ''),
    ),
  );
});

test('inventory location balances support stock issues and transfers', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  for (const name of ['Warehouse A', 'Event Cage']) {
    await request(app).post('/companies/1/warehouses').set('Authorization', `Bearer ${token}`).send({ name });
  }

  const createItemResponse = await request(app)
    .post('/companies/1/inventory-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      sku: 'LEDGER-1',
      name: 'Ledger Item',
      category: 'Testing',
      unit: 'pcs',
      onHand: 9,
      reorderPoint: 2,
      unitCost: 6,
      location: 'Warehouse A',
    });
  assert.equal(createItemResponse.status, 201);
  const itemId = createItemResponse.body.id;
  const itemSku = createItemResponse.body.sku;

  let balanceResponse = await request(app)
    .get(`/companies/1/inventory-location-balances?inventoryItemId=${itemId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(balanceResponse.status, 200);
  assert.equal(balanceResponse.body.length, 1);
  assert.equal(balanceResponse.body[0].location, 'Warehouse A');
  assert.equal(balanceResponse.body[0].quantity, 9);

  const issueResponse = await request(app)
    .post(`/companies/1/inventory-items/${itemId}/issues`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      quantity: 3,
      location: 'Warehouse A',
      projectId: 'proj-1',
      issuedTo: 'Field Team',
      note: 'Launch kit allocation',
    });
  assert.equal(issueResponse.status, 201);
  assert.equal(issueResponse.body.item.onHand, 6);
  assert.equal(issueResponse.body.balances[0].quantity, 6);

  const transferResponse = await request(app)
    .post(`/companies/1/inventory-items/${itemId}/transfers`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      quantity: 2,
      fromLocation: 'Warehouse A',
      toLocation: 'Event Cage',
      note: 'Stage for weekend event',
    });
  assert.equal(transferResponse.status, 201);
  assert.equal(transferResponse.body.item.location, 'Event Cage');

  balanceResponse = await request(app)
    .get(`/companies/1/inventory-location-balances?inventoryItemId=${itemId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(balanceResponse.status, 200);
  assert.equal(balanceResponse.body.length, 2);
  assert.ok(
    balanceResponse.body.some(
      (entry) => entry.location === 'Warehouse A' && entry.quantity === 4,
    ),
  );
  assert.ok(
    balanceResponse.body.some(
      (entry) => entry.location === 'Event Cage' && entry.quantity === 2,
    ),
  );

  const movementResponse = await request(app)
    .get(`/companies/1/stock-movements?inventoryItemId=${itemId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(movementResponse.status, 200);
  assert.ok(
    movementResponse.body.some(
      (movement) => movement.movementType === 'Issue' && movement.quantityChange === -3,
    ),
  );
  assert.ok(
    movementResponse.body.some(
      (movement) => movement.movementType === 'Transfer Out' && movement.quantityChange === -2,
    ),
  );
  assert.ok(
    movementResponse.body.some(
      (movement) => movement.movementType === 'Transfer In' && movement.quantityChange === 2,
    ),
  );
});

test('warehouses: CRUD, enforcement, rename cascade, and delete guard', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // Create (as default) + duplicate-name rejection.
  const created = await auth(request(app).post('/companies/1/warehouses')).send({ name: 'Depot North', code: 'DN', isDefault: true });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Depot North');
  assert.equal(created.body.isDefault, true);
  const whId = created.body.id;
  const dup = await auth(request(app).post('/companies/1/warehouses')).send({ name: 'Depot North' });
  assert.equal(dup.status, 400);

  // Stock placed into the warehouse.
  const item = await auth(request(app).post('/companies/1/inventory-items')).send({
    sku: 'WH-ITEM', name: 'WH Item', category: 'Testing', unit: 'pcs', onHand: 10, reorderPoint: 1, unitCost: 2, location: 'Depot North',
  });
  assert.equal(item.status, 201);
  const itemId = item.body.id;

  // Enforcement: issuing to an unregistered location is rejected.
  const badIssue = await auth(request(app).post(`/companies/1/inventory-items/${itemId}/issues`)).send({ quantity: 1, location: 'Nowhere' });
  assert.equal(badIssue.status, 400);
  assert.match(badIssue.body.message, /warehouse/i);

  // Rename cascades to the stock balance keyed by the old name.
  const renamed = await auth(request(app).put(`/warehouses/${whId}`)).send({ name: 'Depot N' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, 'Depot N');
  const balances = await auth(request(app).get(`/companies/1/inventory-location-balances?inventoryItemId=${itemId}`));
  assert.ok(balances.body.some((b) => b.location === 'Depot N' && b.quantity === 10));

  // Delete guard: blocked while holding stock; allowed once empty.
  const blocked = await auth(request(app).delete(`/warehouses/${whId}`));
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.message, /stock/i);
  const empty = await auth(request(app).post('/companies/1/warehouses')).send({ name: 'Empty WH' });
  const del = await auth(request(app).delete(`/warehouses/${empty.body.id}`));
  assert.equal(del.status, 200);
});

test('purchase receipts route stock into the default warehouse when the item has none', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  await auth(request(app).post('/companies/1/warehouses')).send({ name: 'Receiving Dock', isDefault: true });

  // Item with no location and no opening stock (allowed).
  const item = await auth(request(app).post('/companies/1/inventory-items')).send({
    sku: 'RCV-1', name: 'Receive Item', category: 'Testing', unit: 'pcs', onHand: 0, reorderPoint: 1, unitCost: 3,
  });
  assert.equal(item.status, 201);
  const itemId = item.body.id;
  const itemSku = item.body.sku;

  const order = await auth(request(app).post('/companies/1/purchase-orders')).send({
    orderNumber: 'PO-RCV-1', supplierId: 'supplier-1', orderDate: '2026-05-01T00:00:00.000Z', status: 'Ordered',
    items: [{ inventoryItemId: itemId, sku: itemSku, description: 'Receive Item', quantity: 5, unitCost: 3, lineTotal: 15 }],
  });
  assert.equal(order.status, 201);
  await auth(request(app).patch(`/purchase-orders/${order.body.id}/status`)).send({ status: 'Received' });

  const balances = await auth(request(app).get(`/companies/1/inventory-location-balances?inventoryItemId=${itemId}`));
  assert.ok(balances.body.some((b) => b.location === 'Receiving Dock' && b.quantity === 5));
});

test('purchase orders support partial receipts with receipt history', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const createItemResponse = await request(app)
    .post('/companies/1/inventory-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      sku: 'PART-REC-1',
      name: 'Partial Receipt Item',
      category: 'Testing',
      unit: 'pcs',
      onHand: 0,
      reorderPoint: 2,
      unitCost: 8,
    });
  assert.equal(createItemResponse.status, 201);
  const itemId = createItemResponse.body.id;
  const itemSku = createItemResponse.body.sku;

  const createOrderResponse = await request(app)
    .post('/companies/1/purchase-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNumber: 'PO-PART-1',
      supplierId: 'supplier-1',
      orderDate: '2026-04-08T00:00:00.000Z',
      status: 'Ordered',
      items: [
        {
          inventoryItemId: itemId,
          sku: itemSku,
          description: 'Partial Receipt Item',
          quantity: 10,
          unitCost: 8,
          lineTotal: 80,
        },
      ],
    });
  assert.equal(createOrderResponse.status, 201);
  const orderId = createOrderResponse.body.id;

  const firstReceiptResponse = await request(app)
    .post(`/purchase-orders/${orderId}/receipts`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      notes: 'First shipment',
      items: [{ lineIndex: 0, quantity: 4 }],
    });
  assert.equal(firstReceiptResponse.status, 201);
  assert.equal(firstReceiptResponse.body.status, 'Partially Received');

  let receiptHistoryResponse = await request(app)
    .get(`/companies/1/purchase-receipts?purchaseOrderId=${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(receiptHistoryResponse.status, 200);
  assert.equal(receiptHistoryResponse.body.length, 1);
  assert.equal(receiptHistoryResponse.body[0].items[0].quantity, 4);

  let movementResponse = await request(app)
    .get(`/companies/1/stock-movements?inventoryItemId=${itemId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(movementResponse.status, 200);
  assert.ok(
    movementResponse.body.some(
      (movement) =>
        movement.movementType === 'Receipt'
        && movement.quantityChange === 4
        && movement.referenceId === orderId,
    ),
  );

  const finalReceiptResponse = await request(app)
    .post(`/purchase-orders/${orderId}/receipts`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      notes: 'Final shipment',
      items: [{ lineIndex: 0, quantity: 6 }],
    });
  assert.equal(finalReceiptResponse.status, 201);
  assert.equal(finalReceiptResponse.body.status, 'Received');

  receiptHistoryResponse = await request(app)
    .get(`/companies/1/purchase-receipts?purchaseOrderId=${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(receiptHistoryResponse.status, 200);
  assert.equal(receiptHistoryResponse.body.length, 2);
});

test('vendor bills can link suppliers and purchase orders with derived defaults', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const supplierResponse = await request(app)
    .post('/companies/1/suppliers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Linked Payables Supplier',
      paymentTermsDays: 15,
    });
  assert.equal(supplierResponse.status, 201);
  const supplierId = supplierResponse.body.id;

  const orderResponse = await request(app)
    .post('/companies/1/purchase-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderNumber: 'PO-BILL-LINK',
      supplierId,
      orderDate: '2026-04-08T00:00:00.000Z',
      status: 'Ordered',
      items: [
        {
          inventoryItemId: 'item-1',
          sku: 'APP-TSHIRT-BLK',
          description: 'Apparel T-Shirt Black',
          quantity: 3,
          unitCost: 22,
          lineTotal: 66,
        },
      ],
    });
  assert.equal(orderResponse.status, 201);

  const createBillResponse = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      supplierId,
      purchaseOrderId: orderResponse.body.id,
      referenceInvoiceNumber: 'SUP-LINK-1',
      issueDate: '2026-04-08T00:00:00.000Z',
      status: 'Draft',
    });
  assert.equal(createBillResponse.status, 201);
  assert.match(createBillResponse.body.billNumber, /^VI-\d{4}$/);
  assert.equal(createBillResponse.body.referenceInvoiceNumber, 'SUP-LINK-1');
  assert.equal(createBillResponse.body.vendorName, 'Linked Payables Supplier');
  assert.equal(createBillResponse.body.supplierId, supplierId);
  assert.equal(createBillResponse.body.purchaseOrderId, orderResponse.body.id);
  assert.equal(createBillResponse.body.amount, 66);
  assert.match(createBillResponse.body.dueDate, /^2026-04-23T/);

  const purchasePayablesResponse = await request(app)
    .get('/companies/1/purchase-order-payables')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(purchasePayablesResponse.status, 200);
  const purchaseSummary = purchasePayablesResponse.body.find(
    (summary) => summary.purchaseOrderId === orderResponse.body.id,
  );
  assert.ok(purchaseSummary);
  assert.equal(purchaseSummary.billedAmount, 66);
  assert.equal(purchaseSummary.remainingToBill, 0);

  const supplierPayablesResponse = await request(app)
    .get('/companies/1/finance/supplier-payables')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(supplierPayablesResponse.status, 200);
  const supplierSummary = supplierPayablesResponse.body.find(
    (summary) => summary.supplierId === supplierId,
  );
  assert.ok(supplierSummary);
  assert.equal(supplierSummary.totalBilledAmount, 66);
  assert.equal(supplierSummary.draftBillAmount, 66);

  const mismatchedSupplierResponse = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      supplierId: 'supplier-2',
      purchaseOrderId: orderResponse.body.id,
      issueDate: '2026-04-08T00:00:00.000Z',
      amount: 10,
    });
  assert.equal(mismatchedSupplierResponse.status, 400);
  assert.match(mismatchedSupplierResponse.body.message, /supplier/i);

  const overbillResponse = await request(app)
    .post('/companies/1/finance/vendor-bills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      supplierId,
      purchaseOrderId: orderResponse.body.id,
      issueDate: '2026-04-09T00:00:00.000Z',
      amount: 1,
    });
  assert.equal(overbillResponse.status, 400);
  assert.match(overbillResponse.body.message, /remaining purchase order amount/i);
});

test('sales orders confirm and create draft invoices', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');

  const createOrderResponse = await request(app)
    .post('/companies/1/sales-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: 'client-1',
      orderDate: '2026-04-08T00:00:00.000Z',
      status: 'Draft',
      notes: 'Website package',
      items: [
        {
          description: 'Discovery workshop',
          quantity: 2,
          unitPrice: 250,
          lineTotal: 500,
        },
      ],
    });
  assert.equal(createOrderResponse.status, 201);
  assert.match(createOrderResponse.body.orderNumber, /^SO-/);
  assert.equal(createOrderResponse.body.totalAmount, 500);
  const orderId = createOrderResponse.body.id;

  const confirmResponse = await request(app)
    .patch(`/sales-orders/${orderId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'Confirmed' });
  assert.equal(confirmResponse.status, 200);
  assert.equal(confirmResponse.body.status, 'Confirmed');

  const invoiceResponse = await request(app)
    .post(`/sales-orders/${orderId}/invoice`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(invoiceResponse.status, 201);
  assert.equal(invoiceResponse.body.status, 'Draft');
  assert.equal(invoiceResponse.body.salesOrderId, orderId);
  assert.equal(invoiceResponse.body.total, 500);

  const listResponse = await request(app)
    .get('/companies/1/sales-orders')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(listResponse.status, 200);
  const order = listResponse.body.find((item) => item.id === orderId);
  assert.equal(order.status, 'Invoiced');
  assert.equal(order.invoiceId, invoiceResponse.body.id);
});

test('purchase orders above the company threshold require approval before ordering', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // Set an approval threshold of 1000.
  const settingsResponse = await auth(request(app).put('/companies/1/finance/settings')).send({
    poApprovalThreshold: 1000,
  });
  assert.equal(settingsResponse.status, 200);
  assert.equal(settingsResponse.body.poApprovalThreshold, 1000);

  // An order at/above the threshold is forced to a pending Draft, even if Ordered was requested.
  const bigOrder = await auth(request(app).post('/companies/1/purchase-orders')).send({
    supplierId: 'supplier-1',
    orderDate: '2026-04-08T00:00:00.000Z',
    status: 'Ordered',
    items: [{ description: 'Bulk supplies', quantity: 100, unitCost: 25, lineTotal: 2500 }],
  });
  assert.equal(bigOrder.status, 201);
  assert.equal(bigOrder.body.approvalStatus, 'pending');
  assert.equal(bigOrder.body.status, 'Draft');

  // It cannot be moved to Ordered while pending.
  const blocked = await auth(request(app).patch(`/purchase-orders/${bigOrder.body.id}/status`)).send({
    status: 'Ordered',
  });
  assert.equal(blocked.status, 400);

  // Approve it, then it can advance.
  const approved = await auth(request(app).post(`/purchase-orders/${bigOrder.body.id}/approve`)).send({});
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approvalStatus, 'approved');
  assert.ok(approved.body.approvedBy);

  const ordered = await auth(request(app).patch(`/purchase-orders/${bigOrder.body.id}/status`)).send({
    status: 'Ordered',
  });
  assert.equal(ordered.status, 200);
  assert.equal(ordered.body.status, 'Ordered');

  // A small order below the threshold needs no approval and behaves as before.
  const smallOrder = await auth(request(app).post('/companies/1/purchase-orders')).send({
    supplierId: 'supplier-1',
    orderDate: '2026-04-08T00:00:00.000Z',
    status: 'Ordered',
    items: [{ description: 'Few supplies', quantity: 2, unitCost: 10, lineTotal: 20 }],
  });
  assert.equal(smallOrder.status, 201);
  assert.equal(smallOrder.body.approvalStatus, 'not_required');
  assert.equal(smallOrder.body.status, 'Ordered');

  // Rejection blocks the order permanently.
  const toReject = await auth(request(app).post('/companies/1/purchase-orders')).send({
    supplierId: 'supplier-1',
    orderDate: '2026-04-08T00:00:00.000Z',
    items: [{ description: 'Questionable buy', quantity: 100, unitCost: 50, lineTotal: 5000 }],
  });
  assert.equal(toReject.body.approvalStatus, 'pending');
  const rejected = await auth(request(app).post(`/purchase-orders/${toReject.body.id}/reject`)).send({
    reason: 'Over budget',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.approvalStatus, 'rejected');
  const stillBlocked = await auth(request(app).patch(`/purchase-orders/${toReject.body.id}/status`)).send({
    status: 'Ordered',
  });
  assert.equal(stillBlocked.status, 400);
});

test('custom field definitions drive validation and storage on contacts and items', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // Define a required text field and a select field for contacts.
  const tierField = await auth(request(app).post('/companies/1/custom-fields')).send({
    entityType: 'contact',
    label: 'Account Tier',
    fieldType: 'select',
    options: ['Gold', 'Silver'],
    required: true,
  });
  assert.equal(tierField.status, 201);
  assert.equal(tierField.body.entityType, 'contact');
  assert.equal(tierField.body.key, 'account_tier');
  assert.deepEqual(tierField.body.options, ['Gold', 'Silver']);

  // Listing returns it.
  const list = await auth(request(app).get('/companies/1/custom-fields?entityType=contact'));
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);

  // Creating a contact without the required field fails.
  const missing = await auth(request(app).post('/companies/1/contacts')).send({
    name: 'No Tier Co',
  });
  assert.equal(missing.status, 400);

  // An invalid select value fails.
  const badValue = await auth(request(app).post('/companies/1/contacts')).send({
    name: 'Bad Tier Co',
    customFields: { account_tier: 'Platinum' },
  });
  assert.equal(badValue.status, 400);

  // A valid value is stored and round-trips.
  const ok = await auth(request(app).post('/companies/1/contacts')).send({
    name: 'Gold Co',
    customFields: { account_tier: 'Gold' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.customFields.account_tier, 'Gold');

  // Inventory items get their own namespace; a contact field does not apply.
  const numberField = await auth(request(app).post('/companies/1/custom-fields')).send({
    entityType: 'inventory_item',
    label: 'Shelf Life Days',
    fieldType: 'number',
  });
  assert.equal(numberField.status, 201);
  const item = await auth(request(app).post('/companies/1/inventory-items')).send({
    name: 'Yogurt',
    category: 'Food',
    unit: 'unit',
    onHand: 0,
    customFields: { shelf_life_days: '14' },
  });
  assert.equal(item.status, 201);
  assert.equal(item.body.customFields.shelf_life_days, 14);

  // Deleting a definition works.
  const del = await auth(request(app).delete(`/custom-fields/${numberField.body.id}`));
  assert.equal(del.status, 200);
  const afterDelete = await auth(request(app).get('/companies/1/custom-fields?entityType=inventory_item'));
  assert.equal(afterDelete.body.length, 0);
});

test('records delete gracefully: block on dependents, cascade owned children, hard-delete when safe', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-del-'));
  const store = new DataStore({ dbPath: path.join(tmpDir, 'taskflow.db'), seedOnEmpty: false });
  const co = store.createCompany({ name: 'Del Co', website: '', address: '' });
  const item = (over) => store.createInventoryItem({
    companyId: co.id, name: 'X', category: 'Gen', unit: 'pcs',
    vatApplicable: true, tracksInventory: true, onHand: 0, reorderPoint: 0, unitCost: 1, ...over,
  });

  // Inventory item: hard-delete when pristine; block when stock on hand.
  const freeItem = item({ name: 'Widget' });
  store.deleteInventoryItem(freeItem.id);
  assert.equal(store.getInventoryItemById(freeItem.id), undefined);
  const stocked = item({ name: 'Gadget', onHand: 5 });
  assert.throws(() => store.deleteInventoryItem(stocked.id), /stock on hand/);
  assert.ok(store.getInventoryItemById(stocked.id));

  // Task: cascades comments + time entries; subtasks are detached, not deleted.
  const project = store.createProject({ name: 'P', description: '', color: '#fff', companyId: co.id, visibility: 'Public' });
  const user = store.createUser({
    name: 'U', email: 'u-del@test.com', password: 'password', role: 'Employee',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Employee' }],
  });
  const parent = store.createTask({ title: 'Parent', description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: co.id, projectId: project.id });
  const child = store.createTask({ title: 'Child', description: '', status: 'To Do', priority: 'Medium', tags: [], companyId: co.id, projectId: project.id, parentTaskId: parent.id });
  store.createComment({ taskId: parent.id, userId: user.id, content: 'hi' });
  store.createTimeEntry({ companyId: co.id, taskId: parent.id, userId: user.id, minutes: 30 });
  store.deleteTask(parent.id);
  assert.equal(store.getTaskById(parent.id), undefined);
  assert.equal(store.listTimeEntries(parent.id).length, 0);
  const childAfter = store.getTaskById(child.id);
  assert.ok(childAfter, 'subtask should survive parent deletion');
  assert.equal(childAfter.parentTaskId ?? null, null, 'subtask should be detached');

  // Contact: deletable when unreferenced; blocked once a campaign assignment uses it.
  const freeContact = store.createContact({ companyId: co.id, name: 'Free Contact' });
  store.deleteContact(freeContact.id);
  assert.equal(store.getContactById(freeContact.id), undefined);
  const usedContact = store.createContact({ companyId: co.id, name: 'Used Contact' });
  const campaign = store.createCrmCampaign({
    companyId: co.id, name: 'C', status: 'Active', visibility: 'Public',
    proposalId: null, opportunityId: null, contactId: null, projectId: null,
    startDate: null, endDate: null, budget: null, ownerUserId: null, ownerName: null, notes: null,
  });
  store.createCampaignAssignment({
    companyId: co.id, campaignId: campaign.id, contactId: usedContact.id,
    role: 'Influencer', agreedRate: null, status: 'Confirmed', notes: null,
  });
  assert.throws(() => store.deleteContact(usedContact.id), /referenced by/);
  assert.ok(store.getContactById(usedContact.id));
});

test('HR: employee directory, leave requests, approval, and balance', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // Department + employee with a 20-day annual allowance.
  const dept = await auth(request(app).post('/companies/1/departments')).send({ name: 'Engineering' });
  assert.equal(dept.status, 201);
  const employee = await auth(request(app).post('/companies/1/employees')).send({
    name: 'Dana Dev', jobTitle: 'Engineer', departmentId: dept.body.id,
    employmentType: 'Full-time', hireDate: '2025-01-01', annualLeaveAllowance: 20,
  });
  assert.equal(employee.status, 201);
  assert.equal(employee.body.status, 'Active');
  assert.equal(employee.body.annualLeaveAllowance, 20);

  const list = await auth(request(app).get('/companies/1/employees'));
  assert.ok(list.body.some((e) => e.id === employee.body.id));

  // Paid leave type + a 5-day request (inclusive Mon–Fri).
  const annual = await auth(request(app).post('/companies/1/leave-types')).send({ name: 'Annual', paid: true });
  assert.equal(annual.status, 201);
  const req1 = await auth(request(app).post('/companies/1/leave-requests')).send({
    employeeId: employee.body.id, leaveTypeId: annual.body.id,
    startDate: '2026-03-02', endDate: '2026-03-06',
  });
  assert.equal(req1.status, 201);
  assert.equal(req1.body.days, 5);
  assert.equal(req1.body.status, 'Pending');

  // Pending leave shows as pending, not yet deducted.
  let balance = await auth(request(app).get(`/employees/${employee.body.id}/leave-balance?year=2026`));
  assert.equal(balance.body.allowance, 20);
  assert.equal(balance.body.pending, 5);
  assert.equal(balance.body.used, 0);
  assert.equal(balance.body.remaining, 20);

  // Approving deducts it from the balance.
  const approved = await auth(request(app).put(`/leave-requests/${req1.body.id}/status`)).send({ status: 'Approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'Approved');
  assert.ok(approved.body.reviewedByName);
  balance = await auth(request(app).get(`/employees/${employee.body.id}/leave-balance?year=2026`));
  assert.equal(balance.body.used, 5);
  assert.equal(balance.body.remaining, 15);

  // A leave type in use cannot be deleted; an employee with leave cascades it away.
  const typeDelete = await auth(request(app).delete(`/leave-types/${annual.body.id}`));
  assert.equal(typeDelete.status, 409);
  const empDelete = await auth(request(app).delete(`/employees/${employee.body.id}`));
  assert.equal(empDelete.status, 204);
  const afterList = await auth(request(app).get('/companies/1/leave-requests'));
  assert.ok(!afterList.body.some((r) => r.employeeId === employee.body.id));
});

test('delivery-note templates are separate and a public delivery payload renders', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // A delivery-type template is kept apart from invoice templates.
  const tpl = await auth(request(app).post('/companies/1/invoice-templates')).send({
    name: 'DN Template', docType: 'delivery', layout: 'classic', primaryColor: '#111827', accentColor: '#2563eb',
    showCompanyAddress: true, showTaxId: true,
  });
  assert.equal(tpl.status, 201);
  assert.equal(tpl.body.docType, 'delivery');
  const deliveryList = await auth(request(app).get('/companies/1/invoice-templates?docType=delivery'));
  assert.ok(deliveryList.body.some((t) => t.id === tpl.body.id));
  const invoiceList = await auth(request(app).get('/companies/1/invoice-templates'));
  assert.ok(!invoiceList.body.some((t) => t.id === tpl.body.id), 'delivery template must not show among invoice templates');

  // Build a confirmed sales order and a delivery from it.
  const so = await auth(request(app).post('/companies/1/sales-orders')).send({
    clientId: 'client-1', orderDate: '2026-04-08T00:00:00.000Z', status: 'Draft',
    items: [{ description: 'Widget', quantity: 5, unitPrice: 10 }],
  });
  await auth(request(app).patch(`/sales-orders/${so.body.id}/status`)).send({ status: 'Confirmed' });
  const delivery = await auth(request(app).post(`/sales-orders/${so.body.id}/deliveries`)).send({
    items: [{ salesOrderLineIndex: 0, quantity: 3 }],
  });
  assert.equal(delivery.status, 201);

  // The public delivery payload exposes the delivery, its order, client, company, and a delivery template.
  const pub = await request(app).get(`/public/deliveries/${delivery.body.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.delivery.id, delivery.body.id);
  assert.equal(pub.body.salesOrder.id, so.body.id);
  assert.ok(pub.body.client && pub.body.client.name);
  assert.equal(pub.body.template.docType, 'delivery');
  assert.ok(pub.body.company && pub.body.company.id === '1');
});

test('per-line discounts apply to sales orders and invoices', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // Sales order: a 10% line and a fixed-amount line.
  const so = await auth(request(app).post('/companies/1/sales-orders')).send({
    clientId: 'client-1',
    orderDate: '2026-04-08T00:00:00.000Z',
    status: 'Draft',
    items: [
      { description: 'Item A', quantity: 2, unitPrice: 100, discount: 10, discountType: 'percent' }, // 200 - 10% = 180
      { description: 'Item B', quantity: 1, unitPrice: 100, discount: 25, discountType: 'amount' },   // 100 - 25 = 75
    ],
  });
  assert.equal(so.status, 201);
  assert.equal(so.body.items[0].lineTotal, 180);
  assert.equal(so.body.items[0].discount, 10);
  assert.equal(so.body.items[0].discountType, 'percent');
  assert.equal(so.body.items[1].lineTotal, 75);
  assert.equal(so.body.totalAmount, 255);

  // Invoice: a discounted manual line.
  const inv = await auth(request(app).post('/invoices')).send({
    companyId: '1',
    clientId: 'client-1',
    issueDate: '2026-04-08T00:00:00.000Z',
    dueDate: '2026-05-08T00:00:00.000Z',
    lineItems: [
      { itemType: 'Manual', description: 'Service', quantity: 4, unitPrice: 50, discount: 20, discountType: 'percent' }, // 200 - 20% = 160
    ],
  });
  assert.equal(inv.status, 201);
  assert.equal(inv.body.lineItems[0].amount, 160);
  assert.equal(inv.body.lineItems[0].discount, 20);
  assert.equal(inv.body.total, 160);
});

test('company tax + details are editable by an admin and persisted', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const updated = await auth(request(app).put('/companies/1')).send({
    taxNumber: '100123456700003',
    registrationNumber: 'CR-99887',
    phone: '+97142223333',
    email: 'billing@innovate.test',
    city: 'Dubai',
    country: 'UAE',
    taxDetails: 'VAT registered — 5% standard rate',
    legalName: 'Innovate Corp LLC',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.taxNumber, '100123456700003');
  assert.equal(updated.body.legalName, 'Innovate Corp LLC');

  const fetched = await auth(request(app).get('/companies/1'));
  assert.equal(fetched.body.taxNumber, '100123456700003');
  assert.equal(fetched.body.taxDetails, 'VAT registered — 5% standard rate');
  assert.equal(fetched.body.city, 'Dubai');
});

test('influencers import from CSV rows and export back out', async () => {
  const app = makeApp();
  const token = await login(app, 'admin@taskflow.com');
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  const result = await auth(request(app).post('/companies/1/influencers/import')).send({
    rows: [
      { name: 'Nova Reels', platform: 'Instagram', handle: '@nova', niche: 'Beauty', followers: '52000', engagementRate: '3.4', rateCard: '1500', location: 'Dubai, UAE', languages: 'English; Arabic', availability: 'Available' },
      { name: '', platform: 'TikTok' }, // missing name → skipped
    ],
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.created, 1);
  assert.equal(result.body.failed, 1);

  // The imported row is a Person contact with the Influencer role and coerced numbers.
  const influencers = await auth(request(app).get('/companies/1/contacts?role=Influencer'));
  const nova = influencers.body.find((c) => c.name === 'Nova Reels');
  assert.ok(nova, 'imported influencer should be listed');
  assert.equal(nova.kind, 'Person');
  assert.deepEqual(nova.roles, ['Influencer']);
  assert.equal(nova.followerCount, 52000);
  assert.equal(nova.engagementRate, 3.4);
  assert.equal(nova.influencerHandle, '@nova');
  assert.deepEqual(nova.languages, ['English', 'Arabic']);

  // Export returns a CSV that includes the imported influencer.
  const exported = await auth(request(app).get('/companies/1/influencers/export'));
  assert.equal(exported.status, 200);
  assert.match(exported.headers['content-type'], /text\/csv/);
  assert.match(exported.text, /^name,email,phone,platform,handle,niche,followers,engagementRate,rateCard,location,languages,availability/);
  assert.match(exported.text, /Nova Reels/);
});
