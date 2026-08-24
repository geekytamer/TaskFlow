# OpenFGA Permissions (Phases 0–4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up OpenFGA as a parallel authorization engine, backfill every existing role into per-company groups, and run shadow mode in production so divergences are logged — with zero change to who can do what.

**Architecture:** SQLite remains the source of truth for groups, grants and assignments; OpenFGA holds a projection of them as tuples, kept in sync by a transactional outbox plus an idempotent reconciler. A `PermissionService` with `legacy` / `shadow` / `openfga` adapters is selected by the `AUTHZ_ENGINE` env var. In shadow mode the existing `requireCompanyRoles` keeps its exact behaviour and additionally queries OpenFGA, logging any disagreement.

**Tech Stack:** TypeScript, Express 4, better-sqlite3, `@openfga/sdk`, OpenFGA server + PostgreSQL in Docker, `node --test` + supertest.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-24-openfga-permissions-design.md`. Read it before starting.
- Branch: `feature/openfga-permissions`.
- **`users.role` and `users.companyRoles` are never modified, never dropped.** They stay authoritative for all of Phases 0–4.
- **No behaviour change in Phases 0–4.** Every existing test must still pass unchanged. Shadow mode observes; it never decides.
- Grants are additive-only. There are no deny rows anywhere in this plan.
- Migration ids continue from `078_`. The last existing migration is `077_vendor_bill_template` at `backend/src/data/store.ts:3345`; the migration array terminates at line 3353.
- New migrations must be idempotent and additive — `CREATE TABLE IF NOT EXISTS`, guarded `ALTER TABLE`, `INSERT OR IGNORE`.
- Permission object ids use `/` as separator: `permission:<companyId>/<module>/<action>`. Never `:`.
- Tests run from compiled output: `npm test` runs `npm run build` first and loads `../dist/...`. Test files are plain CommonJS `.js` in `backend/test/`.
- OpenFGA binds to `127.0.0.1` only and is never proxied through nginx.
- Fail closed as `503`, never `403`, never open.

---

### Task 1: OpenFGA infrastructure and typed client

**Files:**
- Create: `backend/docker-compose.fga.yml`
- Create: `backend/src/permissions/fga-client.ts`
- Modify: `backend/.env.production.example`
- Modify: `backend/package.json` (dependency + scripts)
- Test: `backend/test/fga-client.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `getFgaConfig(): { engine: 'legacy'|'shadow'|'openfga'; apiUrl: string; storeId: string; modelId: string; apiToken: string }`
  - `getFgaClient(): OpenFgaClient` — memoised singleton
  - `fgaHealthy(): Promise<boolean>`

- [ ] **Step 1: Pin the OpenFGA image version**

Do not use `latest` in the compose file. Resolve the current version and record it:

```bash
docker run --rm openfga/openfga:latest version
```

Use the reported version (e.g. `v1.8.4`) as `<FGA_VERSION>` everywhere below.

- [ ] **Step 2: Write the compose file**

Create `backend/docker-compose.fga.yml`:

```yaml
services:
  fga-postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: openfga
      POSTGRES_PASSWORD: ${FGA_DB_PASSWORD:?set FGA_DB_PASSWORD}
      POSTGRES_DB: openfga
    volumes:
      - fga-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openfga -d openfga"]
      interval: 5s
      timeout: 5s
      retries: 12

  fga-migrate:
    image: openfga/openfga:<FGA_VERSION>
    command: migrate
    environment:
      OPENFGA_DATASTORE_ENGINE: postgres
      OPENFGA_DATASTORE_URI: postgres://openfga:${FGA_DB_PASSWORD}@fga-postgres:5432/openfga?sslmode=disable
    depends_on:
      fga-postgres:
        condition: service_healthy

  openfga:
    image: openfga/openfga:<FGA_VERSION>
    command: run
    restart: unless-stopped
    environment:
      OPENFGA_DATASTORE_ENGINE: postgres
      OPENFGA_DATASTORE_URI: postgres://openfga:${FGA_DB_PASSWORD}@fga-postgres:5432/openfga?sslmode=disable
      OPENFGA_AUTHN_METHOD: preshared
      OPENFGA_AUTHN_PRESHARED_KEYS: ${FGA_API_TOKEN:?set FGA_API_TOKEN}
      OPENFGA_PLAYGROUND_ENABLED: "false"
      OPENFGA_LOG_LEVEL: warn
    ports:
      - "127.0.0.1:8080:8080"
      - "127.0.0.1:3000:3000"
    depends_on:
      fga-migrate:
        condition: service_completed_successfully

volumes:
  fga-pgdata:
```

Port 8080 is the HTTP API; 3000 is the metrics/health port. Both are bound to loopback.

- [ ] **Step 3: Start it and confirm it is healthy**

```bash
cd backend && FGA_DB_PASSWORD=devpassword FGA_API_TOKEN=devtoken docker compose -f docker-compose.fga.yml up -d
```

Then:

```bash
curl -s -H "Authorization: Bearer devtoken" http://127.0.0.1:8080/stores
```

Expected: `{"stores":[],...}` — an empty store list, not a connection error and not a 401.

- [ ] **Step 4: Install the SDK**

```bash
cd backend && npm install @openfga/sdk
```

- [ ] **Step 5: Add env vars to the example file**

Append to `backend/.env.production.example`:

```env
# Authorization engine: legacy | shadow | openfga
AUTHZ_ENGINE=legacy
FGA_API_URL=http://127.0.0.1:8080
FGA_API_TOKEN=
FGA_STORE_ID=
FGA_MODEL_ID=
FGA_DB_PASSWORD=
```

- [ ] **Step 6: Write the failing test**

Create `backend/test/fga-client.test.js`:

```js
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
  const saved = { ...process.env };
  process.env.AUTHZ_ENGINE = 'openfga';
  delete process.env.FGA_STORE_ID;
  assert.throws(() => getFgaConfig(), /FGA_STORE_ID/);
  process.env = saved;
});
```

The second test matters: a typo in `AUTHZ_ENGINE` must never fall back to something permissive.

- [ ] **Step 7: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="getFgaConfig"
```

Expected: FAIL — `Cannot find module '../dist/permissions/fga-client'`.

- [ ] **Step 8: Implement the client module**

Create `backend/src/permissions/fga-client.ts`:

```ts
import { OpenFgaClient } from '@openfga/sdk';

export type AuthzEngine = 'legacy' | 'shadow' | 'openfga';

const ENGINES: AuthzEngine[] = ['legacy', 'shadow', 'openfga'];

export interface FgaConfig {
  engine: AuthzEngine;
  apiUrl: string;
  storeId: string;
  modelId: string;
  apiToken: string;
}

export function getFgaConfig(): FgaConfig {
  const raw = process.env.AUTHZ_ENGINE ?? 'legacy';
  if (!ENGINES.includes(raw as AuthzEngine)) {
    throw new Error(
      `AUTHZ_ENGINE must be one of ${ENGINES.join(' | ')}, received "${raw}".`,
    );
  }
  const engine = raw as AuthzEngine;
  const config: FgaConfig = {
    engine,
    apiUrl: process.env.FGA_API_URL ?? 'http://127.0.0.1:8080',
    storeId: process.env.FGA_STORE_ID ?? '',
    modelId: process.env.FGA_MODEL_ID ?? '',
    apiToken: process.env.FGA_API_TOKEN ?? '',
  };
  if (engine !== 'legacy') {
    if (!config.storeId) throw new Error('FGA_STORE_ID is required when AUTHZ_ENGINE is not "legacy".');
    if (!config.modelId) throw new Error('FGA_MODEL_ID is required when AUTHZ_ENGINE is not "legacy".');
  }
  return config;
}

let cached: OpenFgaClient | undefined;

export function getFgaClient(): OpenFgaClient {
  if (cached) return cached;
  const config = getFgaConfig();
  cached = new OpenFgaClient({
    apiUrl: config.apiUrl,
    storeId: config.storeId,
    authorizationModelId: config.modelId,
    credentials: config.apiToken
      ? { method: 'api_token', config: { token: config.apiToken } }
      : undefined,
  });
  return cached;
}

/** Test seam: drop the memoised client so a test can change env and re-read it. */
export function resetFgaClient(): void {
  cached = undefined;
}

export async function fgaHealthy(): Promise<boolean> {
  try {
    await getFgaClient().readAuthorizationModels({ pageSize: 1 });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 9: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="getFgaConfig"
```

Expected: 3 passing.

- [ ] **Step 10: Confirm nothing else broke**

```bash
cd backend && npm test
```

Expected: the full existing suite still passes.

- [ ] **Step 11: Document the new service in DEPLOY.md**

Add a section to `DEPLOY.md` after the backend `.env` section covering: starting
the compose stack on the VPS, the `FGA_DB_PASSWORD` and `FGA_API_TOKEN` secrets,
the fact that OpenFGA binds to `127.0.0.1` and must never be added to the nginx
config, and that `fga-pgdata` is a new volume that needs including in backups.

State explicitly that OpenFGA's Postgres is a **second datastore**: restoring
`taskflow.db` from backup without also restoring `fga-pgdata` leaves the two out
of sync, and the fix is `npm run ops -- fga:sync`.

- [ ] **Step 12: Commit**

```bash
git add backend/docker-compose.fga.yml backend/src/permissions/fga-client.ts DEPLOY.md \
        backend/test/fga-client.test.js backend/.env.production.example \
        backend/package.json backend/package-lock.json
git commit -m "feat(authz): OpenFGA compose stack and typed client config"
```

---

### Task 2: Extract the existing gates into a reviewable matrix

This task produces the artifact the whole migration's correctness rests on. It
is **generated then human-reviewed** — do not hand-author it, and do not skip
the review.

**Files:**
- Create: `backend/scripts/extract-gates.ts`
- Create: `docs/superpowers/plans/gate-matrix.csv` (generated output)
- Test: `backend/test/extract-gates.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractGates(source: string): GateRow[]` where
  `GateRow = { method: string; route: string; module: string; action: string; roles: string[]; line: number }`

- [ ] **Step 1: Write the failing test**

Create `backend/test/extract-gates.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { extractGates, inferModule, inferAction } = require('../dist/scripts/extract-gates');

test('inferAction maps HTTP verbs to CRUD actions', () => {
  assert.equal(inferAction('GET', '/companies/:companyId/invoices'), 'read');
  assert.equal(inferAction('POST', '/companies/:companyId/invoices'), 'create');
  assert.equal(inferAction('PATCH', '/invoices/:id'), 'write');
  assert.equal(inferAction('DELETE', '/invoices/:id'), 'delete');
});

test('inferAction recognises named non-CRUD actions from the path suffix', () => {
  assert.equal(inferAction('POST', '/invoices/:id/payments'), 'pay');
  assert.equal(inferAction('POST', '/vendor-bills/:id/post'), 'post');
  assert.equal(inferAction('POST', '/purchase-orders/:id/approve'), 'approve');
  assert.equal(inferAction('POST', '/tasks/mark-invoiced'), 'invoice');
});

test('inferModule takes the first non-parameter segment after any company prefix', () => {
  assert.equal(inferModule('/companies/:companyId/invoices'), 'invoices');
  assert.equal(inferModule('/companies/:companyId/finance/accounts'), 'finance');
  assert.equal(inferModule('/invoices/:id/payments'), 'invoices');
});

test('extractGates pairs a route with the requireCompanyRoles call inside it', () => {
  const source = [
    "  app.post(",
    "    '/companies/:companyId/invoices',",
    "    authMiddleware,",
    "    asyncHandler(async (req, res) => {",
    "      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);",
    "      res.json({});",
    "    }),",
    "  );",
  ].join('\n');

  const rows = extractGates(source);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].roles, ['Admin', 'Manager', 'Accountant']);
  assert.equal(rows[0].module, 'invoices');
  assert.equal(rows[0].action, 'create');
  assert.equal(rows[0].method, 'POST');
});

test('extractGates records routes that have no role gate so they are not silently missed', () => {
  const source = [
    "  app.get(",
    "    '/companies/:companyId/tasks',",
    "    authMiddleware,",
    "    asyncHandler(async (req, res) => {",
    "      res.json({});",
    "    }),",
    "  );",
  ].join('\n');

  const rows = extractGates(source);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].roles, []);
});
```

That last test is the important one. A route the parser fails to associate with
a gate must appear in the matrix with an empty role list so a human notices it,
rather than vanishing.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="extractGates|inferAction|inferModule"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the extractor**

Create `backend/scripts/extract-gates.ts`:

```ts
import fs from 'fs';
import path from 'path';

export interface GateRow {
  method: string;
  route: string;
  module: string;
  action: string;
  roles: string[];
  line: number;
}

const NAMED_ACTIONS: Array<[RegExp, string]> = [
  [/\/payments?$/, 'pay'],
  [/\/post$/, 'post'],
  [/\/approve$/, 'approve'],
  [/\/confirm$/, 'confirm'],
  [/\/void$/, 'void'],
  [/\/cancel$/, 'cancel'],
  [/\/receive$/, 'receive'],
  [/\/issue$/, 'issue'],
  [/\/transfer$/, 'transfer'],
  [/mark-invoiced$/, 'invoice'],
  [/\/send$/, 'send'],
  [/\/pdf$/, 'read'],
];

export function inferAction(method: string, route: string): string {
  for (const [pattern, action] of NAMED_ACTIONS) {
    if (pattern.test(route)) return action;
  }
  switch (method.toUpperCase()) {
    case 'GET': return 'read';
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'write';
    case 'DELETE': return 'delete';
    default: return 'read';
  }
}

export function inferModule(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const start = segments[0] === 'companies' ? 2 : 0;
  for (let i = start; i < segments.length; i += 1) {
    if (!segments[i].startsWith(':')) return segments[i];
  }
  return segments[0] ?? 'unknown';
}

const ROUTE_RE = /app\.(get|post|put|patch|delete)\(/;
const PATH_RE = /['"`](\/[^'"`]*)['"`]/;
const ROLES_RE = /requireCompanyRoles\([^,]+,[^,]+,\s*(\[[^\]]*\]|\w+)\s*\)/;

/** Maps the named role-array constants declared at the top of server.ts. */
const ROLE_CONSTANTS: Record<string, string[]> = {
  userRoles: ['Admin', 'Manager', 'Employee', 'Accountant'],
  companyManagementRoles: ['Admin', 'Manager', 'Accountant'],
};

export function extractGates(source: string): GateRow[] {
  const lines = source.split('\n');
  const rows: GateRow[] = [];
  let current: { method: string; route: string; line: number; depth: number } | null = null;

  lines.forEach((line, index) => {
    const routeMatch = line.match(ROUTE_RE);
    if (routeMatch) {
      // The path may be on this line or the next one.
      const pathMatch = line.match(PATH_RE) ?? (lines[index + 1] ?? '').match(PATH_RE);
      if (pathMatch) {
        if (current) rows.push(finalise(current, []));
        current = {
          method: routeMatch[1].toUpperCase(),
          route: pathMatch[1],
          line: index + 1,
          depth: 0,
        };
        return;
      }
    }

    if (!current) return;

    const rolesMatch = line.match(ROLES_RE);
    if (rolesMatch) {
      rows.push(finalise(current, parseRoles(rolesMatch[1])));
      current = null;
    }
  });

  if (current) rows.push(finalise(current, []));
  return rows;
}

function parseRoles(raw: string): string[] {
  if (ROLE_CONSTANTS[raw]) return ROLE_CONSTANTS[raw];
  return raw
    .replace(/[[\]]/g, '')
    .split(',')
    .map((part) => part.trim().replace(/['"`]/g, ''))
    .filter(Boolean)
    .flatMap((part) => ROLE_CONSTANTS[part] ?? [part]);
}

function finalise(
  current: { method: string; route: string; line: number },
  roles: string[],
): GateRow {
  return {
    method: current.method,
    route: current.route,
    module: inferModule(current.route),
    action: inferAction(current.method, current.route),
    roles: Array.from(new Set(roles)).sort(),
    line: current.line,
  };
}

if (require.main === module) {
  const serverPath = path.join(__dirname, '..', 'src', 'server.ts');
  const rows = extractGates(fs.readFileSync(serverPath, 'utf8'));
  const header = 'method,route,module,action,roles,line';
  const body = rows
    .map((r) => `${r.method},${r.route},${r.module},${r.action},"${r.roles.join(' ')}",${r.line}`)
    .join('\n');
  process.stdout.write(`${header}\n${body}\n`);
  process.stderr.write(
    `\n${rows.length} routes; ${rows.filter((r) => !r.roles.length).length} with no role gate\n`,
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="extractGates|inferAction|inferModule"
```

Expected: 5 passing.

- [ ] **Step 5: Generate the matrix**

```bash
cd backend && npx tsx scripts/extract-gates.ts > ../docs/superpowers/plans/gate-matrix.csv
```

Expected on stderr: a route count in the low hundreds, with a reported count of
gate-less routes.

- [ ] **Step 6: Sanity-check the output against the known total**

```bash
cd backend && grep -c "requireCompanyRoles" src/server.ts
awk -F',' 'NR>1 && $5 != "\"\"" {n++} END {print n}' ../docs/superpowers/plans/gate-matrix.csv
```

The second number should be close to the first (234). A large shortfall means
the parser is missing multi-line `requireCompanyRoles` calls — fix the regex
before proceeding.

- [ ] **Step 7: STOP — human review gate**

Present `gate-matrix.csv` to the user. Do not start Task 3 until they confirm:

1. The inferred module names are the ones they want in the admin UI.
2. The named actions are right, and none are missing.
3. Every route showing an empty role list is genuinely ungated (public,
   super-admin-only, or record-level) and not a parser miss.

- [ ] **Step 8: Commit**

```bash
git add backend/scripts/extract-gates.ts backend/test/extract-gates.test.js \
        docs/superpowers/plans/gate-matrix.csv
git commit -m "feat(authz): extract existing role gates into a reviewable matrix"
```

---

### Task 3: Permission catalogue

**Files:**
- Create: `backend/src/permissions/catalogue.ts`
- Test: `backend/test/permission-catalogue.test.js`

**Interfaces:**
- Consumes: the reviewed `gate-matrix.csv` from Task 2.
- Produces:
  - `MODULES: readonly PermissionModule[]` where
    `PermissionModule = { key: string; labelKey: string; group: string; actions: readonly string[] }`
  - `isValidPermission(module: string, action: string): boolean`
  - `permissionKey(module: string, action: string): string` → `"invoices:read"`
  - `allPermissions(): string[]`

- [ ] **Step 1: Write the failing test**

Create `backend/test/permission-catalogue.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODULES,
  isValidPermission,
  permissionKey,
  allPermissions,
} = require('../dist/permissions/catalogue');

test('every module declares a label key and at least one action', () => {
  assert.ok(MODULES.length > 0);
  for (const mod of MODULES) {
    assert.ok(mod.key, 'module needs a key');
    assert.ok(mod.labelKey, `module ${mod.key} needs a labelKey`);
    assert.ok(mod.group, `module ${mod.key} needs a sidebar group`);
    assert.ok(mod.actions.length > 0, `module ${mod.key} needs actions`);
  }
});

test('module keys are unique', () => {
  const keys = MODULES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('isValidPermission rejects unknown modules and actions', () => {
  assert.equal(isValidPermission('invoices', 'read'), true);
  assert.equal(isValidPermission('invoices', 'teleport'), false);
  assert.equal(isValidPermission('not-a-module', 'read'), false);
});

test('permissionKey formats as module:action', () => {
  assert.equal(permissionKey('invoices', 'create'), 'invoices:create');
});

test('allPermissions returns one entry per module-action pair', () => {
  const expected = MODULES.reduce((sum, m) => sum + m.actions.length, 0);
  assert.equal(allPermissions().length, expected);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="module|permission"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the catalogue**

Create `backend/src/permissions/catalogue.ts`. Populate `MODULES` from the
**reviewed** `gate-matrix.csv` — one entry per distinct module, with the union
of the actions observed for it. The `group` field must match the existing
sidebar section headings in
`frontend/src/modules/layout/components/sidebar-nav.tsx` so the admin matrix
groups the same way the navigation does.

```ts
export interface PermissionModule {
  key: string;
  labelKey: string;
  group: 'operations' | 'finance' | 'crm' | 'hr' | 'core';
  actions: readonly string[];
}

const CRUD = ['read', 'create', 'write', 'delete'] as const;

export const MODULES: readonly PermissionModule[] = [
  // Shape shown for the first few; complete from the reviewed matrix.
  { key: 'projects',        labelKey: 'perm.module.projects',       group: 'operations', actions: CRUD },
  { key: 'tasks',           labelKey: 'perm.module.tasks',          group: 'operations', actions: [...CRUD, 'invoice'] },
  { key: 'invoices',        labelKey: 'perm.module.invoices',       group: 'finance',    actions: [...CRUD, 'pay', 'post', 'void', 'send'] },
  { key: 'vendor-bills',    labelKey: 'perm.module.vendorBills',    group: 'finance',    actions: [...CRUD, 'pay', 'post'] },
  { key: 'purchase-orders', labelKey: 'perm.module.purchaseOrders', group: 'operations', actions: [...CRUD, 'approve', 'receive'] },
  { key: 'inventory',       labelKey: 'perm.module.inventory',      group: 'operations', actions: [...CRUD, 'issue', 'transfer'] },
  { key: 'users',           labelKey: 'perm.module.users',          group: 'core',       actions: CRUD },
  { key: 'settings',        labelKey: 'perm.module.settings',       group: 'core',       actions: ['read', 'write'] },
] as const;

const INDEX = new Map(MODULES.map((m) => [m.key, new Set(m.actions)]));

export function isValidPermission(module: string, action: string): boolean {
  return INDEX.get(module)?.has(action) ?? false;
}

export function permissionKey(module: string, action: string): string {
  return `${module}:${action}`;
}

export function allPermissions(): string[] {
  return MODULES.flatMap((m) => m.actions.map((a) => permissionKey(m.key, a)));
}
```

Generate the full `MODULES` list from the reviewed matrix rather than
transcribing it, then assign each module's `group` by hand to match its sidebar
section:

```bash
cd backend && npx tsx -e "
const fs=require('fs');
const rows=fs.readFileSync('../docs/superpowers/plans/gate-matrix.csv','utf8').trim().split('\n').slice(1);
const mods={};
for(const r of rows){const p=r.split(',');if(p[4]==='\"\"')continue;
(mods[p[2]] ||= new Set()).add(p[3]);}
for(const k of Object.keys(mods).sort())
  console.log(\`  { key: '\${k}', labelKey: 'perm.module.\${k}', group: 'core', actions: \${JSON.stringify([...mods[k]].sort())} },\`);
"
```

- [ ] **Step 4: Add a test asserting the catalogue covers the matrix**

Append to `backend/test/permission-catalogue.test.js`:

```js
const fs = require('node:fs');
const path = require('node:path');

test('catalogue covers every module and action present in the gate matrix', () => {
  const csvPath = path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  const rows = fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1);
  const missing = [];
  for (const row of rows) {
    const [, , module, action, roles] = row.split(',');
    if (roles === '""') continue; // ungated route, reviewed separately
    if (!isValidPermission(module, action)) missing.push(`${module}:${action}`);
  }
  assert.deepEqual(missing, [], `catalogue is missing: ${missing.join(', ')}`);
});
```

This is the test that catches a module you forgot to transcribe.

- [ ] **Step 5: Run the tests until green**

```bash
cd backend && npm test -- --test-name-pattern="module|permission|catalogue"
```

Expected: all passing. If the coverage test lists missing entries, add them to
`MODULES` and re-run.

- [ ] **Step 6: Commit**

```bash
git add backend/src/permissions/catalogue.ts backend/test/permission-catalogue.test.js
git commit -m "feat(authz): permission catalogue derived from the gate matrix"
```

---

### Task 4: Schema migration

**Files:**
- Modify: `backend/src/data/store.ts` (append migration `078_permission_groups` before the `];` at line 3353)
- Test: `backend/test/permission-schema.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the seven tables from spec §5.

- [ ] **Step 1: Write the failing test**

Create `backend/test/permission-schema.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { DataStore } = require('../dist/data/store');

const freshDb = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-perm-'));
  const dbPath = path.join(dir, 'taskflow.db');
  new DataStore({ dbPath, seedOnEmpty: false });
  return new Database(dbPath, { readonly: true });
};

const tableNames = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);

test('migration creates every permission table', () => {
  const db = freshDb();
  const names = tableNames(db);
  for (const expected of [
    'permission_groups',
    'group_implications',
    'group_permissions',
    'user_group_assignments',
    'authz_version',
    'fga_outbox',
    'authz_divergence',
  ]) {
    assert.ok(names.includes(expected), `missing table ${expected}`);
  }
});

test('authz_version is seeded with exactly one row', () => {
  const db = freshDb();
  const rows = db.prepare('SELECT id, version FROM authz_version').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0].version, 1);
});

test('permission_groups enforces unique key per company', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-perm-'));
  const dbPath = path.join(dir, 'taskflow.db');
  new DataStore({ dbPath, seedOnEmpty: false });
  const db = new Database(dbPath);
  const insert = db.prepare(
    "INSERT INTO permission_groups (id, companyId, key, name, isSystem, isActive, createdAt) VALUES (?,?,?,?,0,1,'now')",
  );
  insert.run('g1', 'c1', 'clerk', 'Clerk');
  assert.throws(() => insert.run('g2', 'c1', 'clerk', 'Clerk Again'), /UNIQUE/);
  insert.run('g3', 'c2', 'clerk', 'Clerk'); // same key, different company: allowed
});

test('running migrations twice is a no-op', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-perm-'));
  const dbPath = path.join(dir, 'taskflow.db');
  new DataStore({ dbPath, seedOnEmpty: false });
  new DataStore({ dbPath, seedOnEmpty: false }); // must not throw
  const db = new Database(dbPath, { readonly: true });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM authz_version').get().c, 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="migration creates every permission table"
```

Expected: FAIL — `missing table permission_groups`.

- [ ] **Step 3: Add the migration**

In `backend/src/data/store.ts`, insert immediately before the `];` that closes
the migrations array (line 3353):

```ts
      {
        // Configurable per-company permission groups. Additive only — the
        // legacy users.role / users.companyRoles columns stay authoritative
        // until the OpenFGA cutover completes.
        id: '078_permission_groups',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS permission_groups (
              id          TEXT PRIMARY KEY,
              companyId   TEXT NOT NULL,
              key         TEXT NOT NULL,
              name        TEXT NOT NULL,
              nameAr      TEXT,
              description TEXT,
              isSystem    INTEGER NOT NULL DEFAULT 0,
              isActive    INTEGER NOT NULL DEFAULT 1,
              createdAt   TEXT NOT NULL,
              UNIQUE (companyId, key)
            );
            CREATE TABLE IF NOT EXISTS group_implications (
              parentGroupId TEXT NOT NULL,
              childGroupId  TEXT NOT NULL,
              PRIMARY KEY (parentGroupId, childGroupId)
            );
            CREATE TABLE IF NOT EXISTS group_permissions (
              groupId TEXT NOT NULL,
              module  TEXT NOT NULL,
              action  TEXT NOT NULL,
              PRIMARY KEY (groupId, module, action)
            );
            CREATE TABLE IF NOT EXISTS user_group_assignments (
              userId    TEXT NOT NULL,
              companyId TEXT NOT NULL,
              groupId   TEXT NOT NULL,
              PRIMARY KEY (userId, companyId, groupId)
            );
            CREATE TABLE IF NOT EXISTS authz_version (
              id      INTEGER PRIMARY KEY CHECK (id = 1),
              version INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fga_outbox (
              id        INTEGER PRIMARY KEY AUTOINCREMENT,
              op        TEXT NOT NULL,
              tuple     TEXT NOT NULL,
              createdAt TEXT NOT NULL,
              attempts  INTEGER NOT NULL DEFAULT 0,
              lastError TEXT
            );
            CREATE TABLE IF NOT EXISTS authz_divergence (
              id             INTEGER PRIMARY KEY AUTOINCREMENT,
              userId         TEXT NOT NULL,
              companyId      TEXT NOT NULL,
              module         TEXT NOT NULL,
              action         TEXT NOT NULL,
              route          TEXT NOT NULL,
              legacyAllowed  INTEGER NOT NULL,
              openfgaAllowed INTEGER NOT NULL,
              observedAt     TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_group_permissions_group ON group_permissions (groupId);
            CREATE INDEX IF NOT EXISTS idx_user_group_assignments_user
              ON user_group_assignments (userId, companyId);
            CREATE INDEX IF NOT EXISTS idx_permission_groups_company ON permission_groups (companyId);
            INSERT OR IGNORE INTO authz_version (id, version) VALUES (1, 1);
          `);
        },
      },
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="permission table|authz_version|unique key per company|migrations twice"
```

Expected: 4 passing.

- [ ] **Step 5: Verify against a copy of the real database**

Never run a new migration against the live file first.

```bash
cp taskflow.db /tmp/taskflow-migration-check.db
cd backend && TASKFLOW_DB_PATH=/tmp/taskflow-migration-check.db npm run ops -- migrate
TASKFLOW_DB_PATH=/tmp/taskflow-migration-check.db npm run ops -- status
```

Expected: `078_permission_groups` listed as applied, and every pre-existing
record count unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/src/data/store.ts backend/test/permission-schema.test.js
git commit -m "feat(authz): add permission group schema (migration 078)"
```

---

### Task 5: Store methods for groups, grants and assignments

**Files:**
- Modify: `backend/src/data/store.ts` (new methods on `DataStore`)
- Test: `backend/test/permission-store.test.js`

**Interfaces:**
- Consumes: Task 4's tables.
- Produces, on `DataStore`:
  - `createPermissionGroup(input: { companyId; key; name; nameAr?; description?; isSystem?: boolean }): PermissionGroup`
  - `listPermissionGroups(companyId: string): PermissionGroup[]`
  - `setGroupPermissions(groupId: string, permissions: Array<{ module: string; action: string }>): void`
  - `addGroupImplication(parentGroupId: string, childGroupId: string): void`
  - `assignUserToGroup(userId: string, companyId: string, groupId: string): void`
  - `getEffectivePermissions(userId: string, companyId: string): string[]` — returns `"module:action"` strings, inheritance resolved
  - `getAuthzVersion(): number`
  - `bumpAuthzVersion(): number`

- [ ] **Step 1: Write the failing test**

Create `backend/test/permission-store.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-permstore-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

test('a group grants exactly the permissions it is given', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const group = store.createPermissionGroup({ companyId: co.id, key: 'clerk', name: 'Clerk' });
  store.setGroupPermissions(group.id, [
    { module: 'invoices', action: 'read' },
    { module: 'invoices', action: 'create' },
  ]);
  const user = store.createUser({
    name: 'Sara', email: 'sara@acme.test', role: 'Employee',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Employee' }],
    password: 'x',
  });
  store.assignUserToGroup(user.id, co.id, group.id);

  const perms = store.getEffectivePermissions(user.id, co.id).sort();
  assert.deepEqual(perms, ['invoices:create', 'invoices:read']);
});

test('permissions are inherited transitively through implications', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const base = store.createPermissionGroup({ companyId: co.id, key: 'base', name: 'Base' });
  const mid = store.createPermissionGroup({ companyId: co.id, key: 'mid', name: 'Mid' });
  const top = store.createPermissionGroup({ companyId: co.id, key: 'top', name: 'Top' });

  store.setGroupPermissions(base.id, [{ module: 'invoices', action: 'read' }]);
  store.setGroupPermissions(mid.id, [{ module: 'invoices', action: 'create' }]);
  store.setGroupPermissions(top.id, [{ module: 'invoices', action: 'delete' }]);

  // top implies mid implies base
  store.addGroupImplication(top.id, mid.id);
  store.addGroupImplication(mid.id, base.id);

  const user = store.createUser({
    name: 'Ali', email: 'ali@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }],
    password: 'x',
  });
  store.assignUserToGroup(user.id, co.id, top.id);

  assert.deepEqual(
    store.getEffectivePermissions(user.id, co.id).sort(),
    ['invoices:create', 'invoices:delete', 'invoices:read'],
  );
});

test('an implication cycle terminates instead of hanging', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const a = store.createPermissionGroup({ companyId: co.id, key: 'a', name: 'A' });
  const b = store.createPermissionGroup({ companyId: co.id, key: 'b', name: 'B' });
  store.setGroupPermissions(a.id, [{ module: 'tasks', action: 'read' }]);
  store.addGroupImplication(a.id, b.id);
  store.addGroupImplication(b.id, a.id);

  const user = store.createUser({
    name: 'Cycle', email: 'cycle@acme.test', role: 'Employee',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Employee' }],
    password: 'x',
  });
  store.assignUserToGroup(user.id, co.id, a.id);

  assert.deepEqual(store.getEffectivePermissions(user.id, co.id), ['tasks:read']);
});

test('permissions do not leak across companies', () => {
  const store = freshStore();
  const co1 = store.createCompany({ name: 'One', website: '', address: '' });
  const co2 = store.createCompany({ name: 'Two', website: '', address: '' });
  const g1 = store.createPermissionGroup({ companyId: co1.id, key: 'clerk', name: 'Clerk' });
  store.setGroupPermissions(g1.id, [{ module: 'invoices', action: 'read' }]);

  const user = store.createUser({
    name: 'Multi', email: 'multi@acme.test', role: 'Employee',
    companyIds: [co1.id, co2.id],
    companyRoles: [
      { companyId: co1.id, role: 'Employee' },
      { companyId: co2.id, role: 'Employee' },
    ],
    password: 'x',
  });
  store.assignUserToGroup(user.id, co1.id, g1.id);

  assert.deepEqual(store.getEffectivePermissions(user.id, co1.id), ['invoices:read']);
  assert.deepEqual(store.getEffectivePermissions(user.id, co2.id), []);
});

test('bumpAuthzVersion increases monotonically', () => {
  const store = freshStore();
  const before = store.getAuthzVersion();
  const after = store.bumpAuthzVersion();
  assert.equal(after, before + 1);
  assert.equal(store.getAuthzVersion(), after);
});
```

The cycle test is not hypothetical — the admin UI will let someone wire A→B and
B→A, and an unguarded recursive CTE would spin forever.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="group grants|inherited transitively|cycle|leak across companies|bumpAuthzVersion"
```

Expected: FAIL — `store.createPermissionGroup is not a function`.

- [ ] **Step 3: Implement the store methods**

Add to the `DataStore` class in `backend/src/data/store.ts`:

```ts
  createPermissionGroup(input: {
    companyId: string;
    key: string;
    name: string;
    nameAr?: string;
    description?: string;
    isSystem?: boolean;
  }) {
    const row = {
      id: uuid(),
      companyId: input.companyId,
      key: input.key,
      name: input.name,
      nameAr: input.nameAr ?? null,
      description: input.description ?? null,
      isSystem: input.isSystem ? 1 : 0,
      isActive: 1,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO permission_groups
           (id, companyId, key, name, nameAr, description, isSystem, isActive, createdAt)
         VALUES (@id, @companyId, @key, @name, @nameAr, @description, @isSystem, @isActive, @createdAt)`,
      )
      .run(row);
    this.bumpAuthzVersion();
    return row;
  }

  listPermissionGroups(companyId: string) {
    return this.db
      .prepare('SELECT * FROM permission_groups WHERE companyId = ? ORDER BY name ASC')
      .all(companyId);
  }

  setGroupPermissions(groupId: string, permissions: Array<{ module: string; action: string }>) {
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM group_permissions WHERE groupId = ?').run(groupId);
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO group_permissions (groupId, module, action) VALUES (?, ?, ?)',
      );
      permissions.forEach((p) => insert.run(groupId, p.module, p.action));
      this.bumpAuthzVersionInTrx();
    });
    trx();
  }

  addGroupImplication(parentGroupId: string, childGroupId: string) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO group_implications (parentGroupId, childGroupId) VALUES (?, ?)',
      )
      .run(parentGroupId, childGroupId);
    this.bumpAuthzVersion();
  }

  assignUserToGroup(userId: string, companyId: string, groupId: string) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO user_group_assignments (userId, companyId, groupId) VALUES (?, ?, ?)',
      )
      .run(userId, companyId, groupId);
    this.bumpAuthzVersion();
  }

  /**
   * Effective permissions for a user in one company, with implications resolved.
   * The recursive CTE's UNION (not UNION ALL) is what makes an A→B→A cycle
   * terminate — repeated group ids are discarded rather than re-expanded.
   */
  getEffectivePermissions(userId: string, companyId: string): string[] {
    const rows = this.db
      .prepare(
        `WITH RECURSIVE reachable(groupId) AS (
           SELECT groupId FROM user_group_assignments
             WHERE userId = @userId AND companyId = @companyId
           UNION
           SELECT gi.childGroupId FROM group_implications gi
             JOIN reachable r ON gi.parentGroupId = r.groupId
         )
         SELECT DISTINCT gp.module, gp.action
           FROM group_permissions gp
           JOIN reachable r ON gp.groupId = r.groupId`,
      )
      .all({ userId, companyId }) as Array<{ module: string; action: string }>;
    return rows.map((r) => `${r.module}:${r.action}`);
  }

  getAuthzVersion(): number {
    const row = this.db.prepare('SELECT version FROM authz_version WHERE id = 1').get() as
      | { version: number }
      | undefined;
    return row?.version ?? 1;
  }

  private bumpAuthzVersionInTrx(): number {
    this.db.prepare('UPDATE authz_version SET version = version + 1 WHERE id = 1').run();
    return this.getAuthzVersion();
  }

  bumpAuthzVersion(): number {
    return this.bumpAuthzVersionInTrx();
  }
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="group grants|inherited transitively|cycle|leak across companies|bumpAuthzVersion"
```

Expected: 5 passing.

- [ ] **Step 5: Run the whole suite**

```bash
cd backend && npm test
```

Expected: everything green, including the pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/data/store.ts backend/test/permission-store.test.js
git commit -m "feat(authz): group, grant and assignment store methods"
```

---

### Task 6: Backfill existing roles into groups

**Files:**
- Modify: `backend/src/data/store.ts` (migration `079_backfill_permission_groups`)
- Create: `backend/src/permissions/seed-matrix.ts`
- Test: `backend/test/permission-backfill.test.js`

**Interfaces:**
- Consumes: Task 3's catalogue, Task 4's tables, Task 5's store methods.
- Produces: `SEED_MATRIX: Record<'Admin'|'Manager'|'Employee'|'Accountant', string[]>` — permission keys per built-in role, transcribed from the reviewed `gate-matrix.csv`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/permission-backfill.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { SEED_MATRIX } = require('../dist/permissions/seed-matrix');

const seededStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-backfill-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: true });
};

test('every company receives the four built-in groups as system groups', () => {
  const store = seededStore();
  for (const company of store.listCompanies()) {
    const groups = store.listPermissionGroups(company.id);
    const keys = groups.map((g) => g.key).sort();
    assert.deepEqual(keys, ['accountant', 'admin', 'employee', 'manager']);
    assert.ok(groups.every((g) => g.isSystem === 1), 'built-ins must be system groups');
  }
});

test('each seeded user is assigned the group matching their legacy role', () => {
  const store = seededStore();
  for (const user of store.listUsers()) {
    const assignments = user.companyRoles?.length
      ? user.companyRoles
      : (user.companyIds || []).map((companyId) => ({ companyId, role: user.role }));
    for (const { companyId, role } of assignments) {
      const perms = store.getEffectivePermissions(user.id, companyId);
      assert.ok(perms.length > 0, `${user.email} has no permissions in ${companyId}`);
      const expected = SEED_MATRIX[role];
      assert.deepEqual(perms.sort(), [...expected].sort(),
        `${user.email} (${role}) permissions do not match the seed matrix`);
    }
  }
});

test('backfill leaves the legacy role columns untouched', () => {
  const store = seededStore();
  for (const user of store.listUsers()) {
    assert.ok(user.role, 'users.role must survive the backfill');
  }
});

test('backfill is idempotent across a second migration run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-backfill-'));
  const dbPath = path.join(dir, 'taskflow.db');
  const first = new DataStore({ dbPath, seedOnEmpty: true });
  const company = first.listCompanies()[0];
  const before = first.listPermissionGroups(company.id).length;

  const second = new DataStore({ dbPath, seedOnEmpty: false });
  assert.equal(second.listPermissionGroups(company.id).length, before);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="built-in groups|legacy role|idempotent"
```

Expected: FAIL — `SEED_MATRIX` module not found.

- [ ] **Step 3: Write the seed matrix**

Create `backend/src/permissions/seed-matrix.ts`, transcribed from the reviewed
`gate-matrix.csv`. For each role, include every `module:action` whose row lists
that role.

```ts
import type { UserRole } from '../types';

/**
 * The permissions each legacy role holds today, derived mechanically from the
 * reviewed gate matrix (docs/superpowers/plans/gate-matrix.csv). Changing a
 * value here changes who can do what after the backfill — do not edit by hand
 * without regenerating and re-reviewing the matrix.
 */
export const SEED_MATRIX: Record<UserRole, string[]> = {
  Admin: [/* every permission listing Admin in the matrix */],
  Manager: [/* every permission listing Manager */],
  Accountant: [/* every permission listing Accountant */],
  Employee: [/* every permission listing Employee */],
};
```

Generate the contents rather than typing them:

```bash
cd backend && npx tsx -e "
const fs=require('fs');
const rows=fs.readFileSync('../docs/superpowers/plans/gate-matrix.csv','utf8').trim().split('\n').slice(1);
const out={Admin:new Set(),Manager:new Set(),Accountant:new Set(),Employee:new Set()};
for(const r of rows){const p=r.split(',');const roles=p[4].replace(/\"/g,'').split(' ').filter(Boolean);
for(const role of roles){if(out[role])out[role].add(p[2]+':'+p[3]);}}
for(const k of Object.keys(out))console.log(k, JSON.stringify([...out[k]].sort(),null,2));
"
```

Paste the output into the file.

- [ ] **Step 4: Add the backfill migration**

Append to the migrations array in `backend/src/data/store.ts`, after `078`:

```ts
      {
        // Reproduce today's four roles as editable per-company groups, and
        // assign every user the group matching their existing role. Purely
        // additive: users.role and users.companyRoles are read, never written.
        id: '079_backfill_permission_groups',
        run: () => {
          const { SEED_MATRIX } = require('../permissions/seed-matrix');
          const now = new Date().toISOString();
          const companies = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
          const insertGroup = this.db.prepare(
            `INSERT OR IGNORE INTO permission_groups
               (id, companyId, key, name, isSystem, isActive, createdAt)
             VALUES (?, ?, ?, ?, 1, 1, ?)`,
          );
          const insertPerm = this.db.prepare(
            'INSERT OR IGNORE INTO group_permissions (groupId, module, action) VALUES (?, ?, ?)',
          );
          const findGroup = this.db.prepare(
            'SELECT id FROM permission_groups WHERE companyId = ? AND key = ?',
          );
          const insertAssignment = this.db.prepare(
            'INSERT OR IGNORE INTO user_group_assignments (userId, companyId, groupId) VALUES (?, ?, ?)',
          );

          const roles: Array<[string, string]> = [
            ['Admin', 'admin'],
            ['Manager', 'manager'],
            ['Employee', 'employee'],
            ['Accountant', 'accountant'],
          ];

          companies.forEach(({ id: companyId }) => {
            roles.forEach(([roleName, key]) => {
              insertGroup.run(uuid(), companyId, key, roleName, now);
              const group = findGroup.get(companyId, key) as { id: string };
              (SEED_MATRIX[roleName] as string[]).forEach((permission: string) => {
                const [module, action] = permission.split(':');
                insertPerm.run(group.id, module, action);
              });
            });
          });

          const users = this.db
            .prepare('SELECT id, role, companyIds, companyRoles FROM users')
            .all() as Array<{ id: string; role: string; companyIds: string; companyRoles: string | null }>;

          users.forEach((user) => {
            const parsed: Array<{ companyId: string; role: string }> = user.companyRoles
              ? JSON.parse(user.companyRoles)
              : [];
            // Same fallback getEffectiveRole already applies in http.ts.
            const assignments = parsed.length
              ? parsed
              : (JSON.parse(user.companyIds || '[]') as string[]).map((companyId) => ({
                  companyId,
                  role: user.role,
                }));
            assignments.forEach(({ companyId, role }) => {
              const key = role.toLowerCase();
              const group = findGroup.get(companyId, key) as { id: string } | undefined;
              if (group) insertAssignment.run(user.id, companyId, group.id);
            });
          });
        },
      },
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="built-in groups|legacy role|seed matrix|idempotent"
```

Expected: all passing.

- [ ] **Step 6: Verify against a copy of the real database**

```bash
cp taskflow.db /tmp/taskflow-backfill-check.db
cd backend && TASKFLOW_DB_PATH=/tmp/taskflow-backfill-check.db npm run ops -- migrate
npx tsx -e "
const Database=require('better-sqlite3');
const db=new Database('/tmp/taskflow-backfill-check.db',{readonly:true});
console.log('users:', db.prepare('SELECT COUNT(*) c FROM users').get().c);
console.log('groups:', db.prepare('SELECT COUNT(*) c FROM permission_groups').get().c);
console.log('assignments:', db.prepare('SELECT COUNT(*) c FROM user_group_assignments').get().c);
console.log('users with no assignment:', db.prepare(
  'SELECT COUNT(*) c FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_group_assignments a WHERE a.userId = u.id)'
).get().c);
"
```

Expected: `groups` = 4 × company count, and **`users with no assignment` = 0**.
A non-zero value there means someone would lose access at cutover — stop and
investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/data/store.ts backend/src/permissions/seed-matrix.ts \
        backend/test/permission-backfill.test.js
git commit -m "feat(authz): backfill legacy roles into per-company groups (migration 079)"
```

---

### Task 7: OpenFGA model bootstrap and tuple projection

**Files:**
- Create: `backend/src/permissions/fga-model.ts`
- Create: `backend/src/permissions/tuples.ts`
- Create: `backend/src/permissions/outbox.ts`
- Test: `backend/test/fga-tuples.test.js`

**Interfaces:**
- Consumes: Task 1's client, Task 5's store methods.
- Produces:
  - `AUTHORIZATION_MODEL` — the model as an SDK-shaped JSON object
  - `bootstrapFgaStore(): Promise<{ storeId: string; modelId: string }>`
  - `permissionObject(companyId: string, module: string, action: string): string`
  - `tuplesForStore(store: DataStore): TupleKey[]`
  - `enqueueTuples(store, op: 'write'|'delete', tuples: TupleKey[]): void`
  - `drainOutbox(store): Promise<{ flushed: number; failed: number }>`

- [ ] **Step 1: Write the failing test**

Create `backend/test/fga-tuples.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { permissionObject, tuplesForStore } = require('../dist/permissions/tuples');

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-tuples-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

test('permission objects use slash separators, never colons in the id', () => {
  const obj = permissionObject('c-7f3a', 'invoices', 'create');
  assert.equal(obj, 'permission:c-7f3a/invoices/create');
  assert.equal(obj.split(':').length, 2, 'exactly one colon, separating type from id');
});

test('tuplesForStore emits membership, implication, grant and company tuples', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const parent = store.createPermissionGroup({ companyId: co.id, key: 'mgr', name: 'Manager' });
  const child = store.createPermissionGroup({ companyId: co.id, key: 'emp', name: 'Employee' });
  store.setGroupPermissions(child.id, [{ module: 'tasks', action: 'read' }]);
  store.addGroupImplication(parent.id, child.id);
  const user = store.createUser({
    name: 'Sara', email: 'sara@acme.test', role: 'Manager',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Manager' }],
    password: 'x',
  });
  store.assignUserToGroup(user.id, co.id, parent.id);

  const tuples = tuplesForStore(store);

  assert.ok(tuples.some((t) =>
    t.user === `user:${user.id}` && t.relation === 'direct_member' && t.object === `group:${parent.id}`));
  assert.ok(tuples.some((t) =>
    t.user === `group:${parent.id}` && t.relation === 'implied_by' && t.object === `group:${child.id}`),
    'implication points parent -> child so members of parent inherit child grants');
  assert.ok(tuples.some((t) =>
    t.user === `group:${child.id}#member` && t.relation === 'granted'
    && t.object === permissionObject(co.id, 'tasks', 'read')));
  assert.ok(tuples.some((t) =>
    t.user === `company:${co.id}` && t.relation === 'owner'
    && t.object === permissionObject(co.id, 'tasks', 'read')));
});

test('super admins get a company-level super_admin tuple', () => {
  const store = freshStore();
  const co = store.createCompany({ name: 'Acme', website: '', address: '' });
  const admin = store.createUser({
    name: 'Root', email: 'root@platform.test', role: 'Admin',
    companyIds: [co.id], companyRoles: [{ companyId: co.id, role: 'Admin' }],
    password: 'x', isSuperAdmin: true,
  });
  const tuples = tuplesForStore(store);
  assert.ok(tuples.some((t) =>
    t.user === `user:${admin.id}` && t.relation === 'super_admin' && t.object === `company:${co.id}`));
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="permission objects|tuplesForStore|super admins"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the model**

Create `backend/src/permissions/fga-model.ts`:

```ts
import { getFgaClient } from './fga-client';

/**
 * Mirrors the DSL in the design doc §7:
 *
 *   type group
 *     define direct_member: [user]
 *     define implied_by:    [group]
 *     define member:        direct_member or member from implied_by
 *   type permission
 *     define owner:   [company]
 *     define granted: [group#member] or super_admin from owner
 */
export const AUTHORIZATION_MODEL = {
  schema_version: '1.1',
  type_definitions: [
    { type: 'user', relations: {} },
    {
      type: 'group',
      relations: {
        direct_member: { this: {} },
        implied_by: { this: {} },
        member: {
          union: {
            child: [
              { computedUserset: { relation: 'direct_member' } },
              { tupleToUserset: { tupleset: { relation: 'implied_by' }, computedUserset: { relation: 'member' } } },
            ],
          },
        },
      },
      metadata: {
        relations: {
          direct_member: { directly_related_user_types: [{ type: 'user' }] },
          implied_by: { directly_related_user_types: [{ type: 'group' }] },
          member: { directly_related_user_types: [] },
        },
      },
    },
    {
      type: 'company',
      relations: { super_admin: { this: {} } },
      metadata: { relations: { super_admin: { directly_related_user_types: [{ type: 'user' }] } } },
    },
    {
      type: 'permission',
      relations: {
        owner: { this: {} },
        granted: {
          union: {
            child: [
              { this: {} },
              { tupleToUserset: { tupleset: { relation: 'owner' }, computedUserset: { relation: 'super_admin' } } },
            ],
          },
        },
      },
      metadata: {
        relations: {
          owner: { directly_related_user_types: [{ type: 'company' }] },
          granted: { directly_related_user_types: [{ type: 'group', relation: 'member' }] },
        },
      },
    },
  ],
} as const;

export async function bootstrapFgaStore(): Promise<{ storeId: string; modelId: string }> {
  const client = getFgaClient();
  const store = await client.createStore({ name: 'taskflow' });
  const storeId = store.id!;
  client.storeId = storeId;
  const model = await client.writeAuthorizationModel(AUTHORIZATION_MODEL as never);
  return { storeId, modelId: model.authorization_model_id! };
}
```

- [ ] **Step 4: Implement the tuple projection**

Create `backend/src/permissions/tuples.ts`:

```ts
import type { DataStore } from '../data/store';

export interface TupleKey {
  user: string;
  relation: string;
  object: string;
}

export function permissionObject(companyId: string, module: string, action: string): string {
  return `permission:${companyId}/${module}/${action}`;
}

/** Every tuple implied by the current SQL state. The reconciler diffs against this. */
export function tuplesForStore(store: DataStore): TupleKey[] {
  const db = (store as unknown as { db: import('better-sqlite3').Database }).db;
  const tuples: TupleKey[] = [];

  const assignments = db
    .prepare('SELECT userId, groupId FROM user_group_assignments')
    .all() as Array<{ userId: string; groupId: string }>;
  assignments.forEach((a) => {
    tuples.push({ user: `user:${a.userId}`, relation: 'direct_member', object: `group:${a.groupId}` });
  });

  const implications = db
    .prepare('SELECT parentGroupId, childGroupId FROM group_implications')
    .all() as Array<{ parentGroupId: string; childGroupId: string }>;
  implications.forEach((i) => {
    tuples.push({
      user: `group:${i.parentGroupId}`,
      relation: 'implied_by',
      object: `group:${i.childGroupId}`,
    });
  });

  const grants = db
    .prepare(
      `SELECT gp.groupId, gp.module, gp.action, pg.companyId
         FROM group_permissions gp
         JOIN permission_groups pg ON pg.id = gp.groupId`,
    )
    .all() as Array<{ groupId: string; module: string; action: string; companyId: string }>;
  const owners = new Set<string>();
  grants.forEach((g) => {
    const object = permissionObject(g.companyId, g.module, g.action);
    tuples.push({ user: `group:${g.groupId}#member`, relation: 'granted', object });
    if (!owners.has(object)) {
      owners.add(object);
      tuples.push({ user: `company:${g.companyId}`, relation: 'owner', object });
    }
  });

  const superAdmins = db
    .prepare('SELECT id, companyIds, isSuperAdmin FROM users WHERE isSuperAdmin = 1')
    .all() as Array<{ id: string; companyIds: string }>;
  superAdmins.forEach((u) => {
    (JSON.parse(u.companyIds || '[]') as string[]).forEach((companyId) => {
      tuples.push({ user: `user:${u.id}`, relation: 'super_admin', object: `company:${companyId}` });
    });
  });

  return tuples;
}
```

`users.isSuperAdmin` is added by migration `049` (see
`backend/src/data/store.ts:2326`), so it is guaranteed present by the time `078`
runs. No column guard is needed.

- [ ] **Step 5: Implement the outbox**

Create `backend/src/permissions/outbox.ts`:

```ts
import type { DataStore } from '../data/store';
import { getFgaClient } from './fga-client';
import type { TupleKey } from './tuples';

const BATCH = 100;

export function enqueueTuples(store: DataStore, op: 'write' | 'delete', tuples: TupleKey[]): void {
  if (!tuples.length) return;
  const db = (store as unknown as { db: import('better-sqlite3').Database }).db;
  const insert = db.prepare(
    'INSERT INTO fga_outbox (op, tuple, createdAt) VALUES (?, ?, ?)',
  );
  const now = new Date().toISOString();
  const trx = db.transaction(() => {
    tuples.forEach((t) => insert.run(op, JSON.stringify(t), now));
  });
  trx();
}

export async function drainOutbox(store: DataStore): Promise<{ flushed: number; failed: number }> {
  const db = (store as unknown as { db: import('better-sqlite3').Database }).db;
  const rows = db
    .prepare('SELECT id, op, tuple FROM fga_outbox ORDER BY id ASC LIMIT ?')
    .all(BATCH) as Array<{ id: number; op: string; tuple: string }>;
  if (!rows.length) return { flushed: 0, failed: 0 };

  const client = getFgaClient();
  const writes = rows.filter((r) => r.op === 'write').map((r) => JSON.parse(r.tuple));
  const deletes = rows.filter((r) => r.op === 'delete').map((r) => JSON.parse(r.tuple));

  try {
    await client.write({
      ...(writes.length ? { writes } : {}),
      ...(deletes.length ? { deletes } : {}),
    });
    const remove = db.prepare('DELETE FROM fga_outbox WHERE id = ?');
    const trx = db.transaction(() => rows.forEach((r) => remove.run(r.id)));
    trx();
    return { flushed: rows.length, failed: 0 };
  } catch (error) {
    const bump = db.prepare(
      'UPDATE fga_outbox SET attempts = attempts + 1, lastError = ? WHERE id = ?',
    );
    const message = error instanceof Error ? error.message : String(error);
    const trx = db.transaction(() => rows.forEach((r) => bump.run(message, r.id)));
    trx();
    return { flushed: 0, failed: rows.length };
  }
}
```

- [ ] **Step 6: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="permission objects|tuplesForStore|super admins"
```

Expected: 3 passing.

- [ ] **Step 7: Bootstrap a real store and record the ids**

```bash
cd backend && FGA_API_URL=http://127.0.0.1:8080 FGA_API_TOKEN=devtoken \
  npx tsx -e "
    process.env.AUTHZ_ENGINE='legacy';
    const {bootstrapFgaStore}=require('./src/permissions/fga-model');
    bootstrapFgaStore().then(r=>console.log(JSON.stringify(r,null,2)));
  "
```

Put the reported `storeId` and `modelId` into `backend/.env` as `FGA_STORE_ID`
and `FGA_MODEL_ID`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/permissions/fga-model.ts backend/src/permissions/tuples.ts \
        backend/src/permissions/outbox.ts backend/test/fga-tuples.test.js
git commit -m "feat(authz): OpenFGA model bootstrap, tuple projection and outbox"
```

---

### Task 8: Reconciler command

**Files:**
- Create: `backend/src/permissions/sync.ts`
- Modify: `backend/src/ops.ts` (add `fga:sync` and `fga:status` commands, and their help text)
- Test: `backend/test/fga-sync.test.js`

**Interfaces:**
- Consumes: Tasks 1, 5, 7.
- Produces: `syncTuples(store, opts?: { dryRun?: boolean }): Promise<{ toWrite: TupleKey[]; toDelete: TupleKey[]; written: number; deleted: number }>`

- [ ] **Step 1: Write the failing test**

Create `backend/test/fga-sync.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { diffTuples } = require('../dist/permissions/sync');

const key = (t) => `${t.user}|${t.relation}|${t.object}`;

test('diffTuples reports what to add and what to remove', () => {
  const desired = [
    { user: 'user:a', relation: 'direct_member', object: 'group:g1' },
    { user: 'user:b', relation: 'direct_member', object: 'group:g1' },
  ];
  const actual = [
    { user: 'user:b', relation: 'direct_member', object: 'group:g1' },
    { user: 'user:c', relation: 'direct_member', object: 'group:g1' },
  ];
  const { toWrite, toDelete } = diffTuples(desired, actual);
  assert.deepEqual(toWrite.map(key), ['user:a|direct_member|group:g1']);
  assert.deepEqual(toDelete.map(key), ['user:c|direct_member|group:g1']);
});

test('diffTuples is a no-op when both sides match', () => {
  const tuples = [{ user: 'user:a', relation: 'granted', object: 'permission:c1/invoices/read' }];
  const { toWrite, toDelete } = diffTuples(tuples, [...tuples]);
  assert.deepEqual(toWrite, []);
  assert.deepEqual(toDelete, []);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="diffTuples"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reconciler**

Create `backend/src/permissions/sync.ts`:

```ts
import type { DataStore } from '../data/store';
import { getFgaClient } from './fga-client';
import { tuplesForStore, type TupleKey } from './tuples';

const key = (t: TupleKey) => `${t.user}|${t.relation}|${t.object}`;

export function diffTuples(desired: TupleKey[], actual: TupleKey[]) {
  const desiredMap = new Map(desired.map((t) => [key(t), t]));
  const actualMap = new Map(actual.map((t) => [key(t), t]));
  const toWrite = [...desiredMap].filter(([k]) => !actualMap.has(k)).map(([, t]) => t);
  const toDelete = [...actualMap].filter(([k]) => !desiredMap.has(k)).map(([, t]) => t);
  return { toWrite, toDelete };
}

async function readAllTuples(): Promise<TupleKey[]> {
  const client = getFgaClient();
  const out: TupleKey[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.read({}, { pageSize: 100, continuationToken });
    (page.tuples ?? []).forEach((t) => {
      if (t.key) out.push({ user: t.key.user!, relation: t.key.relation!, object: t.key.object! });
    });
    continuationToken = page.continuation_token || undefined;
  } while (continuationToken);
  return out;
}

export async function syncTuples(store: DataStore, opts: { dryRun?: boolean } = {}) {
  const desired = tuplesForStore(store);
  const actual = await readAllTuples();
  const { toWrite, toDelete } = diffTuples(desired, actual);

  if (opts.dryRun) return { toWrite, toDelete, written: 0, deleted: 0 };

  const client = getFgaClient();
  const CHUNK = 100;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    await client.write({ deletes: toDelete.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    await client.write({ writes: toWrite.slice(i, i + CHUNK) });
  }
  return { toWrite, toDelete, written: toWrite.length, deleted: toDelete.length };
}
```

Deletes run before writes so a re-pointed tuple never collides with its
replacement.

- [ ] **Step 4: Wire the ops commands**

In `backend/src/ops.ts`, add to `printHelp()`:

```
  fga:sync [--dry-run]         Reconcile OpenFGA tuples with the database
  fga:status                   Show OpenFGA connectivity and outbox depth
```

And add to the `switch` on `command` (alongside `case 'status':` at line 138):

```ts
  case 'fga:sync': {
    const store = new DataStore({ dbPath, seedOnEmpty: false });
    const { syncTuples } = require('./permissions/sync');
    syncTuples(store, { dryRun: args.includes('--dry-run') })
      .then((result: { toWrite: unknown[]; toDelete: unknown[]; written: number; deleted: number }) => {
        console.log(`to write: ${result.toWrite.length}, to delete: ${result.toDelete.length}`);
        if (!args.includes('--dry-run')) {
          console.log(`written: ${result.written}, deleted: ${result.deleted}`);
        }
      })
      .catch((error: Error) => {
        console.error(`fga:sync failed: ${error.message}`);
        process.exitCode = 1;
      });
    break;
  }
  case 'fga:status': {
    const store = new DataStore({ dbPath, seedOnEmpty: false });
    const { fgaHealthy } = require('./permissions/fga-client');
    const db = new Database(dbPath, { readonly: true });
    const depth = getCount(db, 'fga_outbox');
    fgaHealthy().then((healthy: boolean) => {
      console.log(`OpenFGA reachable: ${healthy ? 'yes' : 'no'}`);
      console.log(`Outbox depth: ${depth}`);
      console.log(`Authz version: ${store.getAuthzVersion()}`);
    });
    break;
  }
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="diffTuples"
```

Expected: 2 passing.

- [ ] **Step 6: Do a real dry run against the copied database**

```bash
cd backend && TASKFLOW_DB_PATH=/tmp/taskflow-backfill-check.db \
  FGA_API_URL=http://127.0.0.1:8080 FGA_API_TOKEN=devtoken \
  FGA_STORE_ID=<from Task 7> FGA_MODEL_ID=<from Task 7> AUTHZ_ENGINE=shadow \
  npm run ops -- fga:sync --dry-run
```

Expected: a `to write` count matching the tuple count implied by the backfill,
and `to delete: 0`.

Then run it for real (drop `--dry-run`) and re-run the dry run — the second dry
run must report `to write: 0, to delete: 0`. That is the proof the projection is
correct and idempotent.

- [ ] **Step 7: Commit**

```bash
git add backend/src/permissions/sync.ts backend/src/ops.ts backend/test/fga-sync.test.js
git commit -m "feat(authz): tuple reconciler and fga ops commands"
```

---

### Task 9: PermissionService with caching

**Files:**
- Create: `backend/src/permissions/permission-service.ts`
- Test: `backend/test/permission-service.test.js`

**Interfaces:**
- Consumes: Tasks 1, 3, 5, 7.
- Produces:
  - `class PermissionService` with
    `getPermissions(userId: string, companyId: string): Promise<Set<string>>`
    and `has(userId, companyId, module, action): Promise<boolean>`
  - `class AuthzUnavailableError extends Error` — carries `status = 503`

- [ ] **Step 1: Write the failing test**

Create `backend/test/permission-service.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { PermissionService, AuthzUnavailableError } = require('../dist/permissions/permission-service');

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-svc-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

// A stub standing in for OpenFGA, so these tests need no running server.
const stubFga = (permissions, opts = {}) => ({
  calls: 0,
  async listPermissions(userId, companyId) {
    this.calls += 1;
    if (opts.throws) throw new Error('connection refused');
    return permissions;
  },
});

test('permissions are fetched once and served from cache thereafter', async () => {
  const store = freshStore();
  const fga = stubFga(['invoices:read']);
  const svc = new PermissionService({ store, fga });

  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true);
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true);
  assert.equal(fga.calls, 1, 'second call must hit the cache');
});

test('bumping the authz version invalidates the cache', async () => {
  const store = freshStore();
  const fga = stubFga(['invoices:read']);
  const svc = new PermissionService({ store, fga });

  await svc.has('u1', 'c1', 'invoices', 'read');
  store.bumpAuthzVersion();
  await svc.has('u1', 'c1', 'invoices', 'read');
  assert.equal(fga.calls, 2, 'a version bump must force a refetch');
});

test('an unknown permission is denied rather than erroring', async () => {
  const store = freshStore();
  const svc = new PermissionService({ store, fga: stubFga(['invoices:read']) });
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'delete'), false);
});

test('an unreachable OpenFGA with a cold cache raises a 503, not a denial', async () => {
  const store = freshStore();
  const svc = new PermissionService({ store, fga: stubFga([], { throws: true }) });
  await assert.rejects(
    () => svc.has('u1', 'c1', 'invoices', 'read'),
    (error) => {
      assert.ok(error instanceof AuthzUnavailableError);
      assert.equal(error.status, 503);
      return true;
    },
  );
});

test('an unreachable OpenFGA with a warm cache keeps serving', async () => {
  const store = freshStore();
  const fga = stubFga(['invoices:read']);
  const svc = new PermissionService({ store, fga });
  await svc.has('u1', 'c1', 'invoices', 'read');

  fga.listPermissions = async () => { throw new Error('connection refused'); };
  store.bumpAuthzVersion(); // forces a refetch attempt, which will fail
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true,
    'stale cache is preferable to locking everyone out');
});
```

The last two tests encode spec §10 exactly, and they are the ones that must
never be weakened.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd backend && npm test -- --test-name-pattern="cache|503|warm cache|unknown permission"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `backend/src/permissions/permission-service.ts`:

```ts
import type { DataStore } from '../data/store';
import { getFgaClient } from './fga-client';
import { permissionKey } from './catalogue';

export class AuthzUnavailableError extends Error {
  status = 503;
  constructor(message = 'Authorization service is unavailable.') {
    super(message);
    this.name = 'AuthzUnavailableError';
  }
}

export interface FgaReader {
  listPermissions(userId: string, companyId: string): Promise<string[]>;
}

/** Default reader: one ListObjects call, filtered to the company. */
export class OpenFgaReader implements FgaReader {
  async listPermissions(userId: string, companyId: string): Promise<string[]> {
    const response = await getFgaClient().listObjects({
      user: `user:${userId}`,
      relation: 'granted',
      type: 'permission',
    });
    const prefix = `permission:${companyId}/`;
    return (response.objects ?? [])
      .filter((object) => object.startsWith(prefix))
      .map((object) => {
        const [, module, action] = object.slice('permission:'.length).split('/');
        return permissionKey(module, action);
      });
  }
}

interface CacheEntry {
  version: number;
  permissions: Set<string>;
}

export class PermissionService {
  private readonly store: DataStore;
  private readonly fga: FgaReader;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(deps: { store: DataStore; fga?: FgaReader }) {
    this.store = deps.store;
    this.fga = deps.fga ?? new OpenFgaReader();
  }

  async getPermissions(userId: string, companyId: string): Promise<Set<string>> {
    const cacheKey = `${userId}:${companyId}`;
    const version = this.store.getAuthzVersion();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.version === version) return cached.permissions;

    try {
      const permissions = new Set(await this.fga.listPermissions(userId, companyId));
      this.cache.set(cacheKey, { version, permissions });
      return permissions;
    } catch (error) {
      // Serving a stale set beats locking everyone out; a cold cache has
      // nothing to fall back on, so that is the only case that fails.
      if (cached) return cached.permissions;
      throw new AuthzUnavailableError();
    }
  }

  async has(userId: string, companyId: string, module: string, action: string): Promise<boolean> {
    const permissions = await this.getPermissions(userId, companyId);
    return permissions.has(permissionKey(module, action));
  }

  /** Test seam. */
  clearCache(): void {
    this.cache.clear();
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="cache|503|warm cache|unknown permission"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/permissions/permission-service.ts backend/test/permission-service.test.js
git commit -m "feat(authz): PermissionService with version-keyed cache and 503 semantics"
```

---

### Task 10: Equivalence test

This is the gate on the whole migration. It proves the new engine answers
identically to the old one for every role and every gated route.

**Files:**
- Create: `backend/test/permission-equivalence.test.js`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 9, and `gate-matrix.csv`.
- Produces: nothing — a test only.

- [ ] **Step 1: Write the test**

Create `backend/test/permission-equivalence.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { isValidPermission } = require('../dist/permissions/catalogue');

const ROLES = ['Admin', 'Manager', 'Employee', 'Accountant'];

const matrixRows = () => {
  const csvPath = path.join(__dirname, '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  return fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1)
    .map((line) => {
      const [method, route, module, action, roles] = line.split(',');
      return { method, route, module, action, roles: roles.replace(/"/g, '').split(' ').filter(Boolean) };
    })
    .filter((row) => row.roles.length > 0);
};

test('for every gated route and every role, group permissions match legacy roles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-equiv-'));
  const store = new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
  const company = store.createCompany({ name: 'Equivalence Co', website: '', address: '' });

  const users = {};
  for (const role of ROLES) {
    users[role] = store.createUser({
      name: role,
      email: `${role.toLowerCase()}@equiv.test`,
      role,
      companyIds: [company.id],
      companyRoles: [{ companyId: company.id, role }],
      password: 'x',
    });
  }

  const mismatches = [];
  for (const row of matrixRows()) {
    if (!isValidPermission(row.module, row.action)) {
      mismatches.push(`${row.module}:${row.action} is not in the catalogue (${row.route})`);
      continue;
    }
    for (const role of ROLES) {
      const legacyAllowed = row.roles.includes(role);
      const permissions = store.getEffectivePermissions(users[role].id, company.id);
      const newAllowed = permissions.includes(`${row.module}:${row.action}`);
      if (legacyAllowed !== newAllowed) {
        mismatches.push(
          `${row.method} ${row.route} [${role}] legacy=${legacyAllowed} new=${newAllowed}`,
        );
      }
    }
  }

  assert.deepEqual(mismatches, [],
    `${mismatches.length} divergences between legacy roles and group permissions:\n` +
    mismatches.slice(0, 40).join('\n'));
});
```

- [ ] **Step 2: Run it**

```bash
cd backend && npm test -- --test-name-pattern="group permissions match legacy roles"
```

Expected: PASS. If it fails, the listed divergences point at either a wrong
`SEED_MATRIX` entry or a mis-parsed matrix row — fix the data, never the
assertion.

- [ ] **Step 3: Commit**

```bash
git add backend/test/permission-equivalence.test.js
git commit -m "test(authz): legacy-vs-group equivalence across every gated route"
```

---

### Task 11: Shadow mode

Shadow evaluation goes **inside** `requireCompanyRoles`, so no call site changes
and behaviour is bit-for-bit identical. Legacy always decides.

**Files:**
- Create: `backend/src/permissions/shadow.ts`
- Modify: `backend/src/server.ts:715-723` (the `requireCompanyRoles` definition only)
- Test: `backend/test/permission-shadow.test.js`

**Interfaces:**
- Consumes: Tasks 3, 9, and the route matrix.
- Produces:
  - `routeToPermission(method: string, path: string): { module: string; action: string } | undefined`
  - `recordDivergence(store, entry): void` — writes only when the two answers differ
  - `recordShadowCheck(deps): void` — fire-and-forget, never throws
  - `DataStore.listAuthzDivergences(limit?: number)`

- [ ] **Step 1: Write the failing test**

Create `backend/test/permission-shadow.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const { routeToPermission, recordDivergence } = require('../dist/permissions/shadow');

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-shadow-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

test('routeToPermission resolves an express route to a catalogue entry', () => {
  assert.deepEqual(
    routeToPermission('POST', '/companies/:companyId/invoices'),
    { module: 'invoices', action: 'create' },
  );
});

test('routeToPermission returns undefined for an unmapped route', () => {
  assert.equal(routeToPermission('GET', '/totally/unknown'), undefined);
});

test('recordDivergence writes a row that names both answers', () => {
  const store = freshStore();
  recordDivergence(store, {
    userId: 'u1', companyId: 'c1', module: 'invoices', action: 'create',
    route: 'POST /companies/:companyId/invoices',
    legacyAllowed: true, openfgaAllowed: false,
  });
  const rows = store.listAuthzDivergences();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacyAllowed, 1);
  assert.equal(rows[0].openfgaAllowed, 0);
});

test('recordDivergence writes nothing when both engines agree', () => {
  const store = freshStore();
  recordDivergence(store, {
    userId: 'u1', companyId: 'c1', module: 'invoices', action: 'create',
    route: 'POST /companies/:companyId/invoices',
    legacyAllowed: true, openfgaAllowed: true,
  });
  assert.equal(store.listAuthzDivergences().length, 0);
});
```

Add `listAuthzDivergences()` to `DataStore` as part of this task:

```ts
  listAuthzDivergences(limit = 200) {
    return this.db
      .prepare('SELECT * FROM authz_divergence ORDER BY id DESC LIMIT ?')
      .all(limit);
  }
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npm test -- --test-name-pattern="routeToPermission|recordDivergence"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement shadow evaluation**

Create `backend/src/permissions/shadow.ts`:

```ts
import fs from 'fs';
import path from 'path';
import type { DataStore } from '../data/store';
import type { PermissionService } from './permission-service';

interface RouteMapping { module: string; action: string; }

let routeMap: Map<string, RouteMapping> | undefined;

function loadRouteMap(): Map<string, RouteMapping> {
  if (routeMap) return routeMap;
  routeMap = new Map();
  const csvPath = path.join(__dirname, '..', '..', '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv');
  if (!fs.existsSync(csvPath)) return routeMap;
  fs.readFileSync(csvPath, 'utf8').trim().split('\n').slice(1).forEach((line) => {
    const [method, route, module, action] = line.split(',');
    routeMap!.set(`${method} ${route}`, { module, action });
  });
  return routeMap;
}

export function routeToPermission(method: string, routePath: string): RouteMapping | undefined {
  return loadRouteMap().get(`${method.toUpperCase()} ${routePath}`);
}

export function recordDivergence(
  store: DataStore,
  entry: {
    userId: string; companyId: string; module: string; action: string;
    route: string; legacyAllowed: boolean; openfgaAllowed: boolean;
  },
): void {
  if (entry.legacyAllowed === entry.openfgaAllowed) return;
  const db = (store as unknown as { db: import('better-sqlite3').Database }).db;
  db.prepare(
    `INSERT INTO authz_divergence
       (userId, companyId, module, action, route, legacyAllowed, openfgaAllowed, observedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.userId, entry.companyId, entry.module, entry.action, entry.route,
    entry.legacyAllowed ? 1 : 0, entry.openfgaAllowed ? 1 : 0,
    new Date().toISOString(),
  );
}

/**
 * Fire-and-forget shadow comparison. Never throws and never awaits into the
 * request path — shadow mode must not be able to affect a live response.
 */
export function recordShadowCheck(deps: {
  store: DataStore;
  service: PermissionService;
  userId: string;
  companyId: string;
  method: string;
  routePath: string;
  legacyAllowed: boolean;
}): void {
  const mapping = routeToPermission(deps.method, deps.routePath);
  if (!mapping) return;
  deps.service
    .has(deps.userId, deps.companyId, mapping.module, mapping.action)
    .then((openfgaAllowed) => {
      recordDivergence(deps.store, {
        userId: deps.userId,
        companyId: deps.companyId,
        module: mapping.module,
        action: mapping.action,
        route: `${deps.method} ${deps.routePath}`,
        legacyAllowed: deps.legacyAllowed,
        openfgaAllowed,
      });
    })
    .catch(() => {
      /* Shadow mode is observational. A failure here must never surface. */
    });
}
```

- [ ] **Step 4: Wire it into requireCompanyRoles**

In `backend/src/server.ts`, replace the `requireCompanyRoles` definition at
lines 715–723 with:

```ts
  const requireCompanyRoles = (
    req: AuthedRequest,
    companyId: string,
    roles: UserRole[],
  ) => {
    requireCompanyAccess(req, companyId);
    const allowed = requireCompanyRole(req.user!, companyId, roles);

    // Shadow mode observes only — the legacy answer below still decides.
    if (getFgaConfig().engine === 'shadow' && req.user) {
      recordShadowCheck({
        store,
        service: permissionService,
        userId: req.user.id,
        companyId,
        method: req.method,
        routePath: req.route?.path ?? req.path,
        legacyAllowed: allowed,
      });
    }

    if (!allowed) {
      throw new HttpError(403, 'You do not have permission to perform this action.');
    }
  };
```

Add near the other service construction in `createServer`:

```ts
  const permissionService = new PermissionService({ store });
```

And the imports:

```ts
import { PermissionService } from './permissions/permission-service';
import { recordShadowCheck } from './permissions/shadow';
import { getFgaConfig } from './permissions/fga-client';
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && npm test -- --test-name-pattern="routeToPermission|recordDivergence"
```

Expected: 4 passing.

- [ ] **Step 6: Prove behaviour is unchanged**

```bash
cd backend && npm test
```

Expected: the entire pre-existing suite passes untouched. This is the
non-negotiable gate for Phase 4 — if any existing test changed behaviour,
shadow mode has leaked into the decision path.

- [ ] **Step 7: Verify shadow mode end to end**

```bash
cd backend && AUTHZ_ENGINE=shadow FGA_API_URL=http://127.0.0.1:8080 \
  FGA_API_TOKEN=devtoken FGA_STORE_ID=<id> FGA_MODEL_ID=<id> npm run dev
```

In another shell, log in and call a few gated endpoints, then:

```bash
cd backend && npm run ops -- fga:status
npx tsx -e "
const {DataStore}=require('./src/data/store');
const s=new DataStore({dbPath:process.env.TASKFLOW_DB_PATH||'../taskflow.db',seedOnEmpty:false});
console.table(s.listAuthzDivergences(50));
"
```

Expected: an empty divergence table. Any row is a real discrepancy between the
old and new engines and must be resolved before Plan 2 begins.

- [ ] **Step 8: Commit**

```bash
git add backend/src/permissions/shadow.ts backend/src/server.ts \
        backend/src/data/store.ts backend/test/permission-shadow.test.js
git commit -m "feat(authz): shadow-mode divergence logging inside requireCompanyRoles"
```

---

## Done criteria for Phases 0–4

- [ ] OpenFGA and its Postgres run under compose, bound to loopback, with a pinned image version.
- [ ] `gate-matrix.csv` generated and **human-reviewed**.
- [ ] Migrations `078` and `079` applied to a copy of the production database with **zero users left unassigned**.
- [ ] `npm run ops -- fga:sync --dry-run` reports `to write: 0, to delete: 0` on a second run.
- [ ] The equivalence test passes for every gated route and all four roles.
- [ ] The full pre-existing test suite passes unchanged.
- [ ] Shadow mode runs in production with an empty divergence table.

Only then does Plan 2 (gate refactor, admin UI, frontend, cutover) begin.
