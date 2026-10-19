const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');

const build = (engine) => {
  const dir = makeTmpDir('taskflow-enforce-');
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const app = createServer({
    // One connection: the probe writes through the server and reads through
    // `store`, so both must see the same database state.
    store,
    dbPath,
    seedOnEmpty: false,
    allowSeedReset: false,
    permissionsEngine: engine,
    logger: { info() {}, warn() {}, error() {} },
  });
  // supertest binds a new ephemeral port per request unless handed a server
  // that is already listening. Thousands of binds occasionally collide with
  // another process on the machine and come back as non-HTTP data, so bind
  // once and reuse it.
  const server = app.listen(0);
  server.unref();
  return { app, store, agent: request.agent(server) };
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

/**
 * Reduces a response to the authorization outcome, which is what this test is
 * about. A 403 is a denial; anything else means authorization let the request
 * through, and what the handler then did — 200, 404, 400 — is not an
 * authorization difference. Comparing raw status codes made the test sensitive
 * to unrelated handler behaviour.
 */
const outcome = (status) => (status === 403 ? 'denied' : 'allowed');

const probeAll = async (agent, store) => {
  const results = {};
  for (const user of store.listUsers()) {
    const token = store.issueToken(user.id);
    const companies = user.companyRoles?.length
      ? user.companyRoles.map((r) => r.companyId)
      : (user.companyIds || []);
    for (const co of companies) {
      for (const [method, tpl] of PROBES) {
        const url = tpl.replace(':co', co);
        const res = await agent[method](url).set('Authorization', `Bearer ${token}`);
        results[`${user.email}|${co}|${method.toUpperCase()} ${url}`] = outcome(res.status);
      }
    }
  }
  return results;
};

test('PERMISSIONS_ENGINE shadow and v2 produce byte-identical authorization outcomes to legacy', async () => {
  const legacy = build('legacy');
  const legacyResults = await probeAll(legacy.agent, legacy.store);
  const keys = Object.keys(legacyResults);
  assert.ok(keys.length > 50, `expected a broad probe, got ${keys.length} results`);

  for (const engine of ['shadow', 'v2']) {
    const other = build(engine);
    const results = await probeAll(other.agent, other.store);
    const diffs = keys
      .filter((k) => legacyResults[k] !== results[k])
      .map((k) => `${k}: legacy=${legacyResults[k]} ${engine}=${results[k]}`);
    assert.deepEqual(diffs, [],
      `${diffs.length} outcome differences between legacy and ${engine}:\n${diffs.slice(0, 20).join('\n')}`);
    if (engine === 'shadow') assert.deepEqual(other.store.listAuthzDivergences(), [], 'seeded roles never diverge');
  }

  // A probe set that never denies anything would pass trivially.
  const denied = keys.filter((k) => legacyResults[k] === 'denied');
  assert.ok(denied.length > 0, 'the probe set must include denials to be meaningful');
});

test('v2 still denies a user outside the company', async () => {
  const { agent, store } = build('v2');
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

  const res = await agent
    .get(`/companies/${foreign.id}/invoices`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403, 'company scoping must survive the engine switch');
});
