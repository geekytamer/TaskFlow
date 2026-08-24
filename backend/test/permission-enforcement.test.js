const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');

/**
 * Serves permissions straight from the SQL group tables, standing in for
 * OpenFGA. Sound because the equivalence test and a live per-user comparison
 * both establish that the two agree; this isolates the *enforcement* path so it
 * can be tested without a running OpenFGA.
 */
const sqlReader = (store) => ({
  async listGrantedObjects(userId) {
    const objects = [];
    for (const company of store.listCompanies()) {
      for (const perm of store.getEffectivePermissions(userId, company.id)) {
        const [module, action] = perm.split(':');
        objects.push(`permission:${company.id}/${module}/${action}`);
      }
    }
    return objects;
  },
});

const build = (engine) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-enforce-'));
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    dbPath,
    seedOnEmpty: false,
    allowSeedReset: false,
    authzEngine: engine,
    permissionReader: sqlReader(store),
    logger: { info() {}, warn() {}, error() {} },
  });
  return { app, store };
};

const PROBES = [
  ['get', '/companies/:co/invoices'],
  ['get', '/companies/:co/vendor-bills'],
  ['get', '/companies/:co/purchase-orders'],
  ['get', '/companies/:co/inventory-items'],
  ['get', '/companies/:co/contacts'],
  ['get', '/companies/:co/employees'],
  ['get', '/companies/:co/payroll-runs'],
  ['get', '/companies/:co/users'],
  ['get', '/companies/:co/clients'],
  ['get', '/companies/:co/warehouses'],
  ['get', '/companies/:co/opportunities'],
  ['get', '/companies/:co/campaigns'],
  ['get', '/companies/:co/documents'],
  ['get', '/companies/:co/numbering-settings'],
  ['get', '/companies/:co/custom-fields'],
  ['get', '/companies/:co/budgets'],
  ['get', '/companies/:co/sales-orders'],
  ['get', '/companies/:co/leave-requests'],
];

const probeAll = async (app, store) => {
  const results = {};
  for (const user of store.listUsers()) {
    const token = store.issueToken(user.id);
    const companies = user.companyRoles?.length
      ? user.companyRoles.map((r) => r.companyId)
      : (user.companyIds || []);
    for (const co of companies) {
      for (const [method, tpl] of PROBES) {
        const url = tpl.replace(':co', co);
        const res = await request(app)[method](url).set('Authorization', `Bearer ${token}`);
        results[`${user.email}|${co}|${method.toUpperCase()} ${url}`] = res.status;
      }
    }
  }
  return results;
};

test('AUTHZ_ENGINE=openfga produces byte-identical authorization outcomes to legacy', async () => {
  const legacy = build('legacy');
  const openfga = build('openfga');

  const legacyResults = await probeAll(legacy.app, legacy.store);
  const openfgaResults = await probeAll(openfga.app, openfga.store);

  const keys = Object.keys(legacyResults);
  assert.ok(keys.length > 50, `expected a broad probe, got ${keys.length} results`);

  const diffs = [];
  for (const k of keys) {
    if (legacyResults[k] !== openfgaResults[k]) {
      diffs.push(`${k}: legacy=${legacyResults[k]} openfga=${openfgaResults[k]}`);
    }
  }
  assert.deepEqual(diffs, [],
    `${diffs.length} outcome differences between engines:\n${diffs.slice(0, 20).join('\n')}`);

  // A probe set that never denies anything would pass trivially.
  const denied = keys.filter((k) => legacyResults[k] === 403);
  assert.ok(denied.length > 0, 'the probe set must include denials to be meaningful');
});

test('openfga mode still denies a user outside the company', async () => {
  const { app, store } = build('openfga');
  const companies = store.listCompanies();
  const outsider = store.listUsers().find((u) => {
    const ids = u.companyRoles?.length ? u.companyRoles.map((r) => r.companyId) : (u.companyIds || []);
    return !u.isSuperAdmin && ids.length < companies.length;
  });
  assert.ok(outsider, 'need a user who is not in every company');

  const ids = outsider.companyRoles?.length
    ? outsider.companyRoles.map((r) => r.companyId)
    : (outsider.companyIds || []);
  const foreign = companies.find((c) => !ids.includes(c.id));
  const token = store.issueToken(outsider.id);

  const res = await request(app)
    .get(`/companies/${foreign.id}/invoices`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'company scoping must survive the engine switch');
});
