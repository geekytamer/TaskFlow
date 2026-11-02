/**
 * Sensitive fields (authz/mask.ts) on every path they leave through.
 *
 * Poison values: every sensitive value carries a marker (SAL-, IBAN-, IDNO-,
 * RATE 7352619, CREDIT 9162847, COST 3.2147...). A path leaks when the marker or the
 * property appears in what it returns — list, detail, write echo, CSV.
 *
 * No PDF or payslip file carries these fields today (payslips are JSON inside
 * the payroll run; invoice PDFs carry the company's own bank accounts, which
 * stay — Task 1 judgment), so the file paths here are the CSV exports and the
 * WPS salary file.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { mask, canEditField, canViewField, fieldsWritten, FIELD_MAP, FIELD_MODULES, SELF_FIELDS } = require('../dist/authz/mask');
const { SENSITIVE_FIELDS } = require('../dist/authz/catalogue');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };

// ─── mask() itself ──────────────────────────────────────────────────────────

const fakeEff = (companyId, fields) => ({
  userId: 'u1',
  byCompany: new Map([[companyId, { grants: new Map(), fields: new Map(Object.entries(fields).map(([k, v]) => [k, { ...v, sources: [] }])) }]]),
  team: () => new Set(),
});

test('FIELD_MAP covers every sensitive field of the catalogue, and only those', () => {
  const used = new Set(Object.values(FIELD_MAP).flatMap((props) => Object.values(props)));
  for (const { key } of SENSITIVE_FIELDS) {
    assert.ok(used.has(key), `${key} hides at least one property`);
    assert.ok(key in FIELD_MODULES, `${key} has a module entry`);
  }
  assert.equal(used.size, SENSITIVE_FIELDS.length);
});

test('mask(): every mapped property goes without view and stays with it (copy, row untouched)', () => {
  for (const [entity, props] of Object.entries(FIELD_MAP)) {
    const row = { id: 'x', keep: 'yes', ...Object.fromEntries(Object.keys(props).map((p) => [p, `${p}-VALUE`])) };
    const none = mask(fakeEff('c', {}), 'c', entity, row);
    for (const p of Object.keys(props)) assert.ok(!(p in none), `${entity}.${p} hidden without view`);
    assert.equal(none.keep, 'yes');
    assert.equal(row[Object.keys(props)[0]], `${Object.keys(props)[0]}-VALUE`, 'original row untouched');
    const all = Object.fromEntries([...new Set(Object.values(props))].map((f) => [f, { view: true, edit: false }]));
    assert.deepEqual(mask(fakeEff('c', all), 'c', entity, row), row, `${entity} with view: unchanged`);
    // Another company's grant does not count.
    const other = mask(fakeEff('other', all), 'c', entity, row);
    for (const p of Object.keys(props)) assert.ok(!(p in other), `${entity}.${p}: other company's field does not count`);
  }
  assert.equal(mask(fakeEff('c', {}), 'c', 'employee', null), null);
});

test('mask(): only the switch that is off hides its properties', () => {
  const row = { basicSalary: 1, iban: 'I', idNumber: 'N', name: 'n' };
  const out = mask(fakeEff('c', { salary: { view: true, edit: false } }), 'c', 'employee', row);
  assert.deepEqual(out, { basicSalary: 1, name: 'n' });
});

test('mask(): self sees own salary, IDs and bank details; never rate cards or terms', () => {
  const eff = fakeEff('c', {});
  assert.deepEqual(mask(eff, 'c', 'employee', { basicSalary: 1, iban: 'I', idNumber: 'N' }, { self: true }), { basicSalary: 1, iban: 'I', idNumber: 'N' });
  assert.deepEqual([...SELF_FIELDS].sort(), ['bank_details', 'personal_ids', 'salary']);
  assert.deepEqual(mask(eff, 'c', 'contact', { rateCardAmount: 5 }, { self: true }), {});
});

test('mask(): a field whose module is off is hidden from everyone but self', () => {
  const eff = fakeEff('c', { salary: { view: true, edit: true }, rate_cards: { view: true, edit: true }, cost_prices: { view: true, edit: true } });
  const off = (m) => m !== 'payroll' && m !== 'contacts';
  assert.deepEqual(mask(eff, 'c', 'employee', { basicSalary: 1 }, { moduleOn: off }), {});
  assert.deepEqual(mask(eff, 'c', 'employee', { basicSalary: 1 }, { moduleOn: off, self: true }), { basicSalary: 1 });
  assert.deepEqual(mask(eff, 'c', 'contact', { rateCardAmount: 1 }, { moduleOn: off }), {});
  assert.deepEqual(mask(eff, 'c', 'item', { unitCost: 1 }, { moduleOn: () => false }), { unitCost: 1 }, 'cost has no module lock');
  assert.equal(canViewField(eff, 'c', 'salary', { moduleOn: () => true }), true);
});

test('canEditField() and fieldsWritten()', () => {
  const eff = fakeEff('c', { salary: { view: true, edit: false }, client_terms: { view: true, edit: true } });
  assert.equal(canEditField(eff, 'c', 'salary'), false);
  assert.equal(canEditField(eff, 'c', 'client_terms'), true);
  assert.equal(canEditField(eff, 'c', 'bank_details'), false);
  assert.deepEqual(fieldsWritten('employee', { name: 'x', basicSalary: 5, iban: undefined }), ['salary']);
  assert.deepEqual(fieldsWritten('employee', { basicSalary: '5', iban: '' }, { basicSalary: 5, iban: null }), [], 'unchanged values are not writes');
  assert.deepEqual(fieldsWritten('employee', { iban: '' }, { iban: 'X' }).sort(), ['bank_details'], 'clearing is a write');
  assert.deepEqual(fieldsWritten('client', null), []);
});

// ─── The server ─────────────────────────────────────────────────────────────

const RATE = 7352619;
const CREDIT = 9162847;
const COST = 3.2147;

const build = (engine) => {
  const dbPath = path.join(makeTmpDir(`taskflow-mask-${engine}-`), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Acme', website: '', address: '' });
  const c = company.id;
  const mk = (name, role) => store.createUser({
    name, email: `${name.toLowerCase()}@mask.test`, role,
    companyIds: [c], companyRoles: [{ companyId: c, role }], password: 'x',
  });
  const u = {
    admin: mk('Admin', 'Admin'), manager: mk('Manager', 'Manager'), accountant: mk('Accountant', 'Accountant'),
    emp: mk('Emp', 'Employee'), clerk: mk('Clerk', 'Employee'),
  };
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400000);
  const pay = (tag, salary) => ({
    basicSalary: salary, allowances: 100, deductions: 10, bankName: `BANK-${tag}`, iban: `IBAN-${tag}`, bankCode: `BIC-${tag}`,
    idType: 'civil_id', idNumber: `IDNO-${tag}`, hireDate: twoYearsAgo, status: 'Active',
  });
  const e = {
    other: store.createEmployee({ companyId: c, name: 'Other', ...pay('OTHER', 4837261) }),
    emp: store.createEmployee({ companyId: c, name: 'Emp', userId: u.emp.id, ...pay('EMPSELF', 1234) }),
    clerk: store.createEmployee({ companyId: c, name: 'Clerk', userId: u.clerk.id, ...pay('CLERKSELF', 2345) }),
  };
  const influencer = store.createContact({ companyId: c, name: 'Influ', roles: ['Influencer'], visibility: 'Public', ownerUserId: u.emp.id, ownerName: 'Emp', rateCardAmount: RATE, nextFollowupDate: new Date(Date.now() - 3600000), nextFollowupNote: 'call' });
  const client = store.createClient({ companyId: c, name: 'Client Co', email: 'c@c.test', address: '1 Main Street', creditLimit: CREDIT });
  const item = store.createInventoryItem({ companyId: c, name: 'Widget', category: 'Parts', unit: 'pcs', vatApplicable: true, tracksInventory: true, onHand: 0, reorderPoint: 0, unitCost: COST });

  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: c, permissionsEngine: engine });
  const server = app.listen(0);
  server.unref();
  const agent = request.agent(server);
  const auth = (user) => `Bearer ${store.issueToken(user.id)}`;
  const call = (method, user, url, body) => {
    const r = agent[method](url.replaceAll(':c', c)).set('Authorization', auth(user));
    return body === undefined ? r : r.send(body);
  };
  return {
    engine, store, c, u, e, influencer, client, item,
    get: (user, url) => call('get', user, url),
    put: (user, url, body) => call('put', user, url, body),
    post: (user, url, body) => call('post', user, url, body),
    patch: (user, url, body) => call('patch', user, url, body),
  };
};

const text = (res) => (res.body && typeof res.body === 'object' && Object.keys(res.body).length ? JSON.stringify(res.body) : res.text);
const ok = (res, what) => assert.ok(res.status >= 200 && res.status < 300, `${what}: ${res.status} ${res.text.slice(0, 300)}`);

/** Give someone a custom main role (v2). */
const mainRole = (store, companyId, userId, name, grants, fields = []) => {
  const role = store.authz.saveRole(companyId, { name, grants, fields }, null);
  store.authz.setAssignments(userId, companyId, { mainRoleId: role.id, addOnRoleIds: [] }, null);
  return role;
};

const CLERK_GRANTS = [
  { key: 'hr.view' }, { key: 'hr.edit' }, { key: 'hr.view_attendance' },
  { key: 'payroll.view' }, { key: 'payroll.create' }, { key: 'payroll.export' },
  { key: 'contacts.view', scope: 'company' }, { key: 'contacts.view_details' }, { key: 'contacts.create' }, { key: 'contacts.manage' },
  { key: 'contacts.edit', scope: 'company' }, { key: 'contacts.export' },
  { key: 'crm.view', scope: 'company' },
  { key: 'influencers.export' }, { key: 'influencers.review' },
  { key: 'inventory.view' }, { key: 'inventory.export' }, { key: 'inventory.create' }, { key: 'inventory.manage_items' },
  { key: 'portal.view' }, { key: 'portal.manage_catalogue' },
  { key: 'finance.view' }, { key: 'finance.export' }, { key: 'settings.view_activity' }, { key: 'quality.view' }, { key: 'quality.create' },
];

/** Every read path a sensitive property leaves through, with what marks it. */
const READS = (w) => ({
  salary: [
    ['/companies/:c/employees', [/4837261/]],
    [`/employees/${w.e.other.id}`, [/"basicSalary"/, /4837261/]],
    ['/companies/:c/hr/gratuity', [/"monthlyWage":4837261/]],
  ],
  bank_details: [
    ['/companies/:c/employees', [/IBAN-OTHER/, /BANK-OTHER/, /BIC-OTHER/]],
    [`/employees/${w.e.other.id}`, [/IBAN-OTHER/, /BANK-OTHER/]],
  ],
  personal_ids: [
    ['/companies/:c/employees', [/IDNO-OTHER/]],
    [`/employees/${w.e.other.id}`, [/IDNO-OTHER/]],
  ],
  rate_cards: [
    ['/companies/:c/contacts', [/rateCardAmount/, /7352619/]],
    [`/contacts/${w.influencer.id}`, [/rateCardAmount/, /7352619/]],
    [`/contacts/${w.influencer.id}/summary`, [/rateCardAmount/, /7352619/]],
    ['/companies/:c/influencers/export', [/rateCard/, /7352619/]],
  ],
  client_terms: [
    ['/companies/:c/clients', [/creditLimit/, /9162847/]],
  ],
  cost_prices: [
    ['/companies/:c/inventory-items', [/unitCost/, /3\.2147/]],
    ['/companies/:c/inventory-items/export', [/unitCost/, /3\.2147/]],
    // Side paths: the low-stock report and its CSV, and the item-created event's metadata.
    ['/companies/:c/reports/management-summary', [/"unitCost"/]],
    ['/companies/:c/reports/export/inventory-alerts', [/unitCost/, /3\.2147/]],
    ['/companies/:c/activity-events?limit=200', [/"unitCost"/]],
  ],
});

const leaksOf = async (w, user, field) => {
  const found = [];
  for (const [url, markers] of READS(w)[field]) {
    const res = await w.get(user, url);
    ok(res, `${w.engine} ${field} ${url}`);
    const t = text(res);
    if (markers.some((m) => m.test(t))) found.push(url);
  }
  return found;
};

for (const engine of ['legacy', 'shadow', 'v2']) {
  test(`${engine}: system roles see exactly what they saw before (management sees, Employees see their own only)`, async () => {
    const w = build(engine);
    for (const who of ['admin', 'manager', 'accountant']) {
      for (const field of ['salary', 'bank_details', 'personal_ids', 'rate_cards', 'client_terms', 'cost_prices']) {
        assert.deepEqual(await leaksOf(w, w.u[who], field), READS(w)[field].map(([u]) => u), `${engine} ${who} sees ${field} everywhere`);
      }
    }
    // Employees: the HR list and their own record; contacts and influencer export.
    const list = text(await w.get(w.u.emp, '/companies/:c/employees'));
    for (const marker of ['4837261', 'IBAN-OTHER', 'BANK-OTHER', 'BIC-OTHER', 'IDNO-OTHER']) assert.ok(!list.includes(marker), `${engine} employee list: ${marker}`);
    for (const marker of ['1234', 'IBAN-EMPSELF', 'IDNO-EMPSELF']) assert.ok(list.includes(marker), `${engine} employee sees own ${marker}`);
    const own = (await w.get(w.u.emp, `/employees/${w.e.emp.id}`)).body;
    assert.equal(own.basicSalary, 1234);
    assert.equal(own.iban, 'IBAN-EMPSELF');
    const other = (await w.get(w.u.emp, `/employees/${w.e.other.id}`)).body;
    for (const p of Object.keys(FIELD_MAP.employee)) assert.ok(!(p in other), `${engine} employee detail of another: ${p}`);
    assert.equal(other.name, 'Other');
    for (const url of ['/companies/:c/contacts', `/contacts/${w.influencer.id}/summary`, '/companies/:c/influencers/export', '/companies/:c/followups']) {
      const res = await w.get(w.u.emp, url);
      ok(res, `${engine} employee ${url}`);
      assert.ok(!/rateCard|7352619/.test(text(res)), `${engine} employee ${url} carries no rate card`);
    }
    assert.ok(text(await w.get(w.u.emp, '/companies/:c/contacts')).includes('Influ'), 'not vacuous: the contact is listed');
    // CSV export: no rateCard column at all.
    const csv = (await w.get(w.u.emp, '/companies/:c/influencers/export')).text;
    assert.ok(!csv.split('\n')[0].includes('rateCard'));
    // Payroll run and WPS stay management (route gate) with full figures.
    const run = await w.post(w.u.admin, '/companies/:c/payroll-runs', { period: '2026-09' });
    ok(run, `${engine} create run`);
    const runBody = (await w.get(w.u.accountant, `/payroll-runs/${run.body.id}`)).body;
    assert.ok(runBody.payslips.every((p) => typeof p.net === 'number' && typeof p.basic === 'number'), `${engine} accountant sees payslip figures`);
    assert.equal((await w.get(w.u.emp, `/payroll-runs/${run.body.id}`)).status, 403);
  });

  test(`${engine}: writes by system roles are unchanged; the create echo hides a rate card the person cannot see`, async () => {
    const w = build(engine);
    // Management edits salary, bank, IDs, rate cards and credit limits as before.
    ok(await w.put(w.u.manager, `/employees/${w.e.other.id}`, { basicSalary: 5000, iban: 'IBAN-NEW', idNumber: 'IDNO-NEW' }), 'manager PUT employee');
    ok(await w.put(w.u.accountant, `/contacts/${w.influencer.id}`, { rateCardAmount: 8000 }), 'accountant PUT contact');
    ok(await w.put(w.u.admin, `/clients/${w.client.id}`, { creditLimit: 12000 }), 'admin PUT client');
    // An Employee creating a contact with a rate card.
    const created = await w.post(w.u.emp, '/companies/:c/contacts', { name: 'NewInflu', roles: ['Influencer'], rateCardAmount: 4444 });
    if (engine === 'v2') {
      // Under v2 a field the person may not edit is refused (spec §6).
      assert.equal(created.status, 403);
      assert.equal(created.body.permission, 'field:rate_cards');
    } else {
      assert.equal(created.status, 201, `${engine}: legacy writes unchanged`);
      assert.ok(!('rateCardAmount' in created.body), `${engine}: the echo hides it (spec §6 leak closure)`);
      assert.equal(w.store.getContactById(created.body.id).rateCardAmount, 4444, 'still stored');
    }
    // PATCH echo of their own contact carries no rate card (spec §6).
    const patched = await w.patch(w.u.emp, `/contacts/${w.influencer.id}`, { priority: 'High' });
    ok(patched, `${engine} employee PATCH own contact`);
    assert.ok(!('rateCardAmount' in patched.body));
  });

  test(`${engine}: a company with payroll or contacts switched off hides those fields, as the old rules did`, async () => {
    const w = build(engine);
    w.store.db.prepare('UPDATE companies SET disabledModules = ? WHERE id = ?').run(JSON.stringify(['payroll']), w.c);
    const list = text(await w.get(w.u.manager, '/companies/:c/employees'));
    assert.ok(!list.includes('4837261'), `${engine}: payroll off hides others' salary`);
    assert.ok(text(await w.get(w.u.emp, `/employees/${w.e.emp.id}`)).includes('1234'), 'own still shown');
    // Only the paths the old rule was asked on lock: the gratuity report and a
    // write echo show pay as they did.
    assert.equal((await w.get(w.u.manager, '/companies/:c/hr/gratuity')).body.lines.find((l) => l.employeeId === w.e.other.id).monthlyWage, 4837261);
    const echo = await w.put(w.u.manager, `/employees/${w.e.other.id}`, { jobTitle: 'Tech' });
    ok(echo, 'PUT employee');
    assert.equal(echo.body.basicSalary, 4837261);
  });

  test(`${engine}: with contacts switched off, client terms outside the contact screens show as before`, async () => {
    const w = build(engine);
    w.store.db.prepare('UPDATE companies SET disabledModules = ? WHERE id = ?').run(JSON.stringify(['contacts']), w.c);
    const body = {
      companyId: w.c, clientId: w.client.id, issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      status: 'Sent', taxRate: 0, lineItems: [{ itemType: 'Manual', description: 'Big', quantity: 1, unitPrice: CREDIT + 1, amount: CREDIT + 1 }],
    };
    const res = await w.post(w.u.admin, '/invoices', body);
    assert.equal(res.status, 409, res.text);
    assert.equal(res.body.limit, CREDIT, 'the credit-limit refusal still names the limit to an Admin');
  });
}

// ─── v2 custom roles: each switch on its own ───────────────────────────────

test('v2: a custom role without any sensitive field gets no sensitive property on any path (own excepted)', async () => {
  const w = build('v2');
  mainRole(w.store, w.c, w.u.clerk.id, 'Clerk', CLERK_GRANTS, []);
  for (const field of ['salary', 'bank_details', 'personal_ids', 'rate_cards', 'client_terms', 'cost_prices']) {
    assert.deepEqual(await leaksOf(w, w.u.clerk, field), [], `clerk without ${field}`);
  }
  // Not vacuous: the rows themselves are there.
  assert.ok(text(await w.get(w.u.clerk, '/companies/:c/employees')).includes('Other'));
  assert.ok(text(await w.get(w.u.clerk, '/companies/:c/inventory-items')).includes('Widget'));
  assert.ok(text(await w.get(w.u.clerk, '/companies/:c/clients')).includes('Client Co'));
  // CSV headers drop the column.
  assert.ok(!(await w.get(w.u.clerk, '/companies/:c/inventory-items/export')).text.split('\n')[0].includes('unitCost'));
  assert.ok(!(await w.get(w.u.clerk, '/companies/:c/influencers/export')).text.split('\n')[0].includes('rateCard'));
  // Own record: salary, IDs and bank details.
  const own = (await w.get(w.u.clerk, `/employees/${w.e.clerk.id}`)).body;
  assert.equal(own.basicSalary, 2345);
  assert.equal(own.idNumber, 'IDNO-CLERKSELF');
  assert.equal(own.iban, 'IBAN-CLERKSELF');
  // Gratuity: own line has the wage, others' not.
  const grat = (await w.get(w.u.clerk, '/companies/:c/hr/gratuity')).body;
  assert.equal(grat.lines.find((l) => l.employeeId === w.e.clerk.id).monthlyWage, 2345);
  assert.ok(!('monthlyWage' in grat.lines.find((l) => l.employeeId === w.e.other.id)));
  // Lots and stock movements carry the cost too.
  w.store.createInventoryLot({ companyId: w.c, inventoryItemId: w.item.id, lotNumber: 'LOT-1', quantity: 1, unitCost: COST, expiryDate: '2030-01-01' });
  // Not vacuous: an admin sees the cost on both.
  for (const url of ['/companies/:c/inventory-lots', '/companies/:c/stock-movements']) assert.ok(/unitCost/.test(text(await w.get(w.u.admin, url))), `admin ${url}`);
  const lot = w.store.listInventoryLots(w.c)[0];
  for (const url of ['/companies/:c/inventory-lots', '/companies/:c/stock-movements', `/inventory-lots/${lot.id}/trace`]) {
    const res = await w.get(w.u.clerk, url);
    ok(res, url);
    assert.ok(!/unitCost/.test(text(res)), `${url} hides unitCost`);
  }
  assert.ok(/unitCost/.test(text(await w.get(w.u.admin, `/inventory-lots/${lot.id}/trace`))), 'admin trace shows the cost');
  const inspected = await w.post(w.u.clerk, `/inventory-lots/${lot.id}/inspections`, { checks: [{ name: 'Seal', pass: true }] });
  ok(inspected, 'inspection');
  assert.ok(!/unitCost/.test(text(inspected)), 'inspection echo hides the lot cost');
  // A customer return's restocked cost is cost_prices too (event metadata).
  w.store.createActivityEvent({ companyId: w.c, entityType: 'customer_return', entityId: 'r1', action: 'received', summary: 'Return received.', metadata: { restockedCost: 6.42, creditNoteId: null } });
  const events = await w.get(w.u.clerk, '/companies/:c/activity-events?limit=200');
  assert.ok(!/restockedCost/.test(text(events)) && /Return received/.test(text(events)));
  // Write echoes: PUT employee (no salary in it), POST /contacts/:id/roles.
  const put = await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { jobTitle: 'Tech' });
  ok(put, 'clerk PUT employee without sensitive fields');
  assert.ok(!/4837261|IBAN-OTHER|IDNO-OTHER/.test(text(put)));
  const roles = await w.post(w.u.clerk, `/contacts/${w.influencer.id}/roles`, { role: 'Lead' });
  ok(roles, 'clerk add role');
  assert.ok(!/7352619/.test(text(roles)));
});

test('v2: payslips are hidden without salary, except the person\'s own; the WPS file needs salary, bank and IDs', async () => {
  const w = build('v2');
  mainRole(w.store, w.c, w.u.clerk.id, 'Clerk', CLERK_GRANTS, []);
  const run = w.store.createPayrollRun(w.c, '2026-09');
  for (const url of [`/payroll-runs/${run.id}`, '/companies/:c/payroll-runs']) {
    const res = await w.get(w.u.clerk, url);
    ok(res, url);
    const runs = Array.isArray(res.body) ? res.body : [res.body];
    const slips = runs.flatMap((r) => r.payslips);
    const mine = slips.find((s) => s.employeeId === w.e.clerk.id);
    assert.equal(mine.net, 2345 + 100 - 10, `${url}: own payslip visible`);
    for (const s of slips.filter((s) => s.employeeId !== w.e.clerk.id)) {
      for (const p of ['basic', 'allowances', 'deductions', 'net']) assert.ok(!(p in s), `${url}: ${p} of another's payslip`);
    }
    assert.ok(!text(res).includes('4837261'));
  }
  const wps = await w.get(w.u.clerk, `/payroll-runs/${run.id}/wps`);
  assert.equal(wps.status, 403, wps.text);
  assert.match(wps.body.permission, /^field:/);
  // With all three it is the file's own checks that answer (not a 403).
  mainRole(w.store, w.c, w.u.clerk.id, 'Payroll clerk', CLERK_GRANTS,
    ['salary', 'bank_details', 'personal_ids'].map((key) => ({ key, view: true, edit: false })));
  assert.notEqual((await w.get(w.u.clerk, `/payroll-runs/${run.id}/wps`)).status, 403);
});

test('v2: each switch on its own shows its properties and nothing else', async () => {
  const w = build('v2');
  for (const field of ['salary', 'bank_details', 'personal_ids', 'rate_cards', 'client_terms', 'cost_prices']) {
    mainRole(w.store, w.c, w.u.clerk.id, `Only ${field}`, CLERK_GRANTS, [{ key: field, view: true, edit: false }]);
    for (const other of ['salary', 'bank_details', 'personal_ids', 'rate_cards', 'client_terms', 'cost_prices']) {
      const leaks = await leaksOf(w, w.u.clerk, other);
      if (other === field) assert.deepEqual(leaks, READS(w)[other].map(([u]) => u), `with ${field}: sees it everywhere`);
      else assert.deepEqual(leaks, [], `with ${field}: ${other} hidden`);
    }
  }
});

test('v2: view without edit — a write changing the field is 403 with the field key; re-sending it unchanged is fine', async () => {
  const w = build('v2');
  const view = ['salary', 'bank_details', 'personal_ids', 'rate_cards', 'client_terms', 'cost_prices'].map((key) => ({ key, view: true, edit: false }));
  mainRole(w.store, w.c, w.u.clerk.id, 'Viewer', CLERK_GRANTS, view);
  const refused = async (res, field) => {
    assert.equal(res.status, 403, `${field}: ${res.status} ${res.text.slice(0, 200)}`);
    assert.equal(res.body.code, 'FORBIDDEN');
    assert.equal(res.body.permission, `field:${field}`);
  };
  await refused(await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { basicSalary: 1 }), 'salary');
  await refused(await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { iban: 'X' }), 'bank_details');
  await refused(await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { idNumber: 'X' }), 'personal_ids');
  await refused(await w.put(w.u.clerk, `/contacts/${w.influencer.id}`, { rateCardAmount: 1 }), 'rate_cards');
  await refused(await w.post(w.u.clerk, '/companies/:c/contacts', { name: 'X', rateCardAmount: 1 }), 'rate_cards');
  await refused(await w.put(w.u.clerk, `/clients/${w.client.id}`, { creditLimit: 1 }), 'client_terms');
  await refused(await w.post(w.u.clerk, '/clients', { companyId: w.c, name: 'New Client', email: 'n@n.test', address: '2 Main Street', creditLimit: 5 }), 'client_terms');
  await refused(await w.post(w.u.clerk, '/companies/:c/inventory-items', { name: 'Gadget', category: 'Parts', unit: 'pcs', tracksInventory: false, unitCost: 2 }), 'cost_prices');
  // Nothing was written.
  assert.equal(w.store.getEmployeeById(w.e.other.id).basicSalary, 4837261);
  assert.equal(w.store.getContactById(w.influencer.id).rateCardAmount, RATE);
  assert.equal(w.store.getClientById(w.client.id).creditLimit, CREDIT);
  // The same values sent back (an edit form) and other fields: allowed.
  ok(await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { basicSalary: 4837261, iban: 'IBAN-OTHER', jobTitle: 'Lead tech' }), 'unchanged salary re-sent');
  ok(await w.put(w.u.clerk, `/clients/${w.client.id}`, { creditLimit: CREDIT, notes: 'ok' }), 'unchanged credit re-sent');
  ok(await w.post(w.u.clerk, '/companies/:c/inventory-items', { name: 'Gadget', category: 'Parts', unit: 'pcs', tracksInventory: false }), 'item without a cost');

  // With edit the same writes go through.
  mainRole(w.store, w.c, w.u.clerk.id, 'Editor', CLERK_GRANTS, view.map((f) => ({ ...f, edit: true })));
  ok(await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { basicSalary: 1 }), 'salary edit');
  ok(await w.put(w.u.clerk, `/clients/${w.client.id}`, { creditLimit: 1 }), 'credit edit');
  ok(await w.put(w.u.clerk, `/contacts/${w.influencer.id}`, { rateCardAmount: 1 }), 'rate edit');
});

test('v2: portal pricing profiles and price ranges follow client_terms and rate_cards', async () => {
  const w = build('v2');
  const clientContact = w.store.createContact({ companyId: w.c, name: 'Buyer', roles: ['Client'], visibility: 'Public' });
  w.store.catalogue.setPricingProfile({ contactId: clientContact.id, companyId: w.c, mode: 'markup', markupPercent: 37 });
  w.store.catalogue.setPriceRange({ companyId: w.c, contactId: w.influencer.id, belowPercent: 11, abovePercent: 22 });
  mainRole(w.store, w.c, w.u.clerk.id, 'Portal', [...CLERK_GRANTS, { key: 'portal.manage_access' }], []);
  const profile = await w.get(w.u.clerk, `/companies/:c/pricing-profiles/${clientContact.id}`);
  ok(profile, 'profile');
  assert.ok(!/markupPercent|"mode"/.test(text(profile)), text(profile));
  // Not vacuous: an Admin sees the terms.
  assert.equal((await w.get(w.u.admin, `/companies/:c/pricing-profiles/${clientContact.id}`)).body.markupPercent, 37);
  assert.equal((await w.get(w.u.admin, `/companies/:c/portal-price-range/${w.influencer.id}`)).body.belowPercent, 11);
  const range = await w.get(w.u.clerk, `/companies/:c/portal-price-range/${w.influencer.id}`);
  ok(range, 'range');
  assert.ok(!/belowPercent|abovePercent/.test(text(range)));
  const put = await w.put(w.u.clerk, `/companies/:c/pricing-profiles/${clientContact.id}`, { mode: 'retainer' });
  assert.equal(put.status, 403);
  assert.equal(put.body.permission, 'field:client_terms');
  const putRange = await w.put(w.u.clerk, `/companies/:c/portal-price-range/${w.influencer.id}`, { belowPercent: 1, abovePercent: 1 });
  assert.equal(putRange.status, 403);
  assert.equal(putRange.body.permission, 'field:rate_cards');
  // A requested rate-card change: hidden in the list, and approving it writes the field.
  const request = w.store.influencer.addChangeRequest({ companyId: w.c, contactId: w.influencer.id, portalUserId: 'pu-1', changes: { rateCardAmount: 6543, location: 'Muscat' } });
  assert.ok(request, 'change request created');
  {
    const list = await w.get(w.u.clerk, `/companies/:c/contacts/${w.influencer.id}/change-requests`);
    ok(list, 'change requests');
    assert.ok(!/6543|rateCardAmount/.test(text(list)), text(list));
    assert.ok(/Muscat/.test(text(list)), 'the rest of the request shows');
    const approve = await w.post(w.u.clerk, `/companies/:c/contacts/${w.influencer.id}/change-requests/${request.id}/approve`, {});
    assert.equal(approve.status, 403);
    assert.equal(approve.body.permission, 'field:rate_cards');
    assert.equal(w.store.getContactById(w.influencer.id).rateCardAmount, RATE);
  }
});

test('v2: a credit-limit refusal does not name the limit to someone without client_terms', async () => {
  const w = build('v2');
  mainRole(w.store, w.c, w.u.clerk.id, 'Biller', [...CLERK_GRANTS, { key: 'invoices.view' }, { key: 'invoices.create' }], []);
  const body = {
    companyId: w.c, clientId: w.client.id, issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: 'Sent', taxRate: 0, lineItems: [{ itemType: 'Manual', description: 'Big', quantity: 1, unitPrice: CREDIT + 1, amount: CREDIT + 1 }],
  };
  const res = await w.post(w.u.clerk, '/invoices', body);
  assert.equal(res.status, 409, res.text);
  assert.equal(res.body.code, 'CREDIT_LIMIT_EXCEEDED');
  assert.ok(!('limit' in res.body));
  assert.ok(!res.text.includes(String(CREDIT)) && !res.text.includes(CREDIT.toFixed(3)), res.text);
  // An Admin still gets the figure.
  const admin = await w.post(w.u.admin, '/invoices', body);
  assert.equal(admin.status, 409);
  assert.equal(admin.body.limit, CREDIT);
});

test('v2: linking an employee record to a login is a write of pay, IDs and bank details, and only to a member', async () => {
  const w = build('v2');
  const outsider = w.store.createUser({ name: 'Out', email: 'out@mask.test', role: 'Employee', companyIds: [], companyRoles: [], password: 'x' });
  mainRole(w.store, w.c, w.u.clerk.id, 'HR clerk', [...CLERK_GRANTS, { key: 'hr.create' }], []);
  // Pointing another person's record at myself would make their pay "mine".
  const put = await w.put(w.u.clerk, `/employees/${w.e.other.id}`, { userId: w.u.clerk.id });
  assert.equal(put.status, 403, put.text);
  assert.match(put.body.permission, /^field:(salary|personal_ids|bank_details)$/);
  assert.equal(w.store.getEmployeeById(w.e.other.id).userId ?? null, null);
  const post = await w.post(w.u.clerk, '/companies/:c/employees', { name: 'Twin', userId: w.u.clerk.id, basicSalary: 0 });
  assert.equal(post.status, 403, post.text);
  // Others' figures stay hidden.
  assert.ok(!text(await w.get(w.u.clerk, `/employees/${w.e.other.id}`)).includes('4837261'));
  // Re-sending the existing link, or none, is fine; defaults on create are not writes.
  ok(await w.put(w.u.clerk, `/employees/${w.e.clerk.id}`, { userId: w.u.clerk.id, jobTitle: 'Clerk' }), 'same link');
  ok(await w.post(w.u.clerk, '/companies/:c/employees', { name: 'Fresh', basicSalary: 0, allowances: '', iban: null }), 'create with blank defaults');
  // With the fields, a link must still name a member of the company (any engine's admin too).
  const admin = await w.put(w.u.admin, `/employees/${w.e.other.id}`, { userId: outsider.id });
  assert.equal(admin.status, 400, admin.text);
  ok(await w.put(w.u.admin, `/employees/${w.e.other.id}`, { userId: w.u.manager.id }), 'admin links a member');
});

test('legacy: a link to someone outside the company is refused; a member is fine', async () => {
  const w = build('legacy');
  const outsider = w.store.createUser({ name: 'Out', email: 'out@mask.test', role: 'Employee', companyIds: [], companyRoles: [], password: 'x' });
  assert.equal((await w.post(w.u.manager, '/companies/:c/employees', { name: 'X', userId: outsider.id })).status, 400);
  ok(await w.post(w.u.manager, '/companies/:c/employees', { name: 'Y', userId: w.u.accountant.id }), 'member link');
});

test('every activity event carrying a sensitive-looking metadata key is covered by ACTIVITY_METADATA', () => {
  const fs = require('node:fs');
  const { ACTIVITY_METADATA } = require('../dist/authz/mask');
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
  walk(path.join(__dirname, '..', 'src'));
  const sensitiveProps = new Set(Object.values(FIELD_MAP).flatMap((props) => Object.keys(props)));
  const looksSensitive = (k) => sensitiveProps.has(k) || /cost|salary|wage|iban|idNumber|creditLimit|rateCard|markup/i.test(k);
  const missing = [];
  let seen = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/createActivityEvent\(\{([\s\S]*?)\}\)/g)) {
      const block = m[1];
      const type = block.match(/entityType:\s*'([a-z_]+)'/)?.[1];
      const meta = block.match(/metadata:\s*\{([\s\S]*?)\}/)?.[1];
      if (!meta) continue;
      seen += 1;
      const keys = [...meta.matchAll(/(?:^|[,{\s])([A-Za-z_]\w*)\s*(?::|,|$)/g)].map((x) => x[1]);
      for (const k of keys.filter(looksSensitive)) {
        if (!type || !ACTIVITY_METADATA[type]?.[k]) missing.push(`${path.relative(path.join(__dirname, '..'), file)} ${type ?? '?'}.${k}`);
      }
    }
  }
  assert.ok(seen > 20, `scanned ${seen} events`);
  assert.deepEqual(missing, []);
});
