const test = require('node:test');
const assert = require('node:assert/strict');
const { readMatrix, catalogueSource, seedSource } = require('../dist/scripts/generate-catalogue');

const csv = `method,route,module,action,roles,line,gate,resource
GET,/a,invoices,read,"Admin Manager Accountant",1,roles,a
POST,/a,invoices,create,"Admin Accountant",2,roles,a
GET,/open,invoices,teleport,"",3,none,open
GET,/b,hr,read,"Admin",4,roles,b`;

const catalogue = (keys) => `const GATE_MODULES = [
${keys.map((k) => `  {
    key: '${k}',
    labelKey: 'perm.module.${k}',
    group: 'core',
    actions: ["stale"],
  },`).join('\n')}
] as const;`;

const seed = `const GATE_SEED_MATRIX: Record<UserRole, string[]> = {
  Admin: [
    'old:thing',
  ],
};
export const SEED_MATRIX = {};`;

test('the catalogue lists exactly the gated actions of each module; ungated routes grant nothing', () => {
  const out = catalogueSource(catalogue(['invoices', 'hr']), readMatrix(csv));
  assert.match(out, /key: 'invoices',[\s\S]*?actions: \["create","read"\]/);
  assert.match(out, /key: 'hr',[\s\S]*?actions: \["read"\]/);
  assert.doesNotMatch(out, /stale|teleport/);
});

test('a module without catalogue metadata, or metadata without routes, stops the generator', () => {
  assert.throws(() => catalogueSource(catalogue(['invoices']), readMatrix(csv)), /Add hr to GATE_MODULES/);
  assert.throws(() => catalogueSource(catalogue(['invoices', 'hr', 'ghost']), readMatrix(csv)), /"ghost".*no gated route/);
});

test('each role is seeded with the permissions whose routes it may use', () => {
  const out = seedSource(seed, readMatrix(csv));
  const block = (role) => (out.match(new RegExp(`  ${role}: \\[\\n([\\s\\S]*?)\\n  \\],`)) ?? [])[1] ?? '';
  assert.equal(block('Admin'), "    'hr:read',\n    'invoices:create',\n    'invoices:read',");
  assert.equal(block('Manager'), "    'invoices:read',");
  assert.equal(block('Accountant'), "    'invoices:create',\n    'invoices:read',");
  assert.equal(block('Employee'), '');
  assert.match(out, /export const SEED_MATRIX = \{\};/, 'the rest of the file is untouched');
});
