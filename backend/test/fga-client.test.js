const test = require('node:test');
const assert = require('node:assert/strict');

const { getFgaConfig } = require('../dist/permissions/fga-client');

test('getFgaConfig defaults to the legacy engine when AUTHZ_ENGINE is unset', () => {
  const saved = process.env.AUTHZ_ENGINE;
  delete process.env.AUTHZ_ENGINE;
  assert.equal(getFgaConfig().engine, 'legacy');
  if (saved !== undefined) process.env.AUTHZ_ENGINE = saved;
});

test('getFgaConfig rejects an unknown engine rather than silently defaulting', () => {
  const saved = process.env.AUTHZ_ENGINE;
  process.env.AUTHZ_ENGINE = 'wide-open';
  assert.throws(() => getFgaConfig(), /AUTHZ_ENGINE/);
  if (saved === undefined) delete process.env.AUTHZ_ENGINE;
  else process.env.AUTHZ_ENGINE = saved;
});

test('getFgaConfig requires store and model ids when the engine is openfga', () => {
  const savedEngine = process.env.AUTHZ_ENGINE;
  const savedStore = process.env.FGA_STORE_ID;
  process.env.AUTHZ_ENGINE = 'openfga';
  delete process.env.FGA_STORE_ID;
  assert.throws(() => getFgaConfig(), /FGA_STORE_ID/);
  if (savedEngine === undefined) delete process.env.AUTHZ_ENGINE;
  else process.env.AUTHZ_ENGINE = savedEngine;
  if (savedStore !== undefined) process.env.FGA_STORE_ID = savedStore;
});
