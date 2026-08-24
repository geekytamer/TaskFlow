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
  assert.deepEqual(rows[0].roles, ['Accountant', 'Admin', 'Manager']);
  assert.equal(rows[0].module, 'invoices');
  assert.equal(rows[0].action, 'create');
  assert.equal(rows[0].method, 'POST');
});

test('extractGates expands the named role-array constants', () => {
  const source = [
    "  app.get(",
    "    '/companies/:companyId/vendor-bills',",
    "    asyncHandler(async (req, res) => {",
    "      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);",
    "    }),",
    "  );",
  ].join('\n');

  const rows = extractGates(source);
  assert.deepEqual(rows[0].roles, ['Accountant', 'Admin', 'Manager']);
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

test('extractGates finds a requireCompanyRoles call split across lines', () => {
  const source = [
    "  app.post(",
    "    '/companies/:companyId/payroll/run',",
    "    asyncHandler(async (req, res) => {",
    "      requireCompanyRoles(",
    "        req,",
    "        req.params.companyId,",
    "        ['Admin', 'Accountant'],",
    "      );",
    "    }),",
    "  );",
  ].join('\n');

  const rows = extractGates(source);
  assert.deepEqual(rows[0].roles, ['Accountant', 'Admin']);
});

test('role constants are read from the source rather than hardcoded', () => {
  const source = [
    "  const crmRoles: UserRole[] = ['Admin', 'Manager', 'Employee'];",
    "  app.get(",
    "    '/companies/:companyId/opportunities',",
    "    handler((req, res) => {",
    "      requireCompanyRoles(req, req.params.companyId, crmRoles);",
    "    }),",
    "  );",
  ].join('\n');

  assert.deepEqual(extractGates(source)[0].roles, ['Admin', 'Employee', 'Manager']);
});

test('a gate inside a load* helper is attributed to the routes that call it', () => {
  const source = [
    "  const loadFollowup = (req: AuthedRequest) => {",
    "    const f = store.getFollowupById(req.params.id);",
    "    requireCompanyRoles(req, f.companyId, ['Admin', 'Manager']);",
    "    return f;",
    "  };",
    "  app.post(",
    "    '/followups/:id/reschedule',",
    "    handler((req, res) => {",
    "      const followup = loadFollowup(req);",
    "      res.json(followup);",
    "    }),",
    "  );",
  ].join('\n');

  const rows = extractGates(source);
  assert.equal(rows.length, 1, 'the helper must not be emitted as its own route');
  assert.deepEqual(rows[0].roles, ['Admin', 'Manager']);
  assert.equal(rows[0].route, '/followups/:id/reschedule');
});

test('a helper defined after a route is not attributed to that route', () => {
  const source = [
    "  app.delete(",
    "    '/warehouses/:id',",
    "    handler((req, res) => {",
    "      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);",
    "    }),",
    "  );",
    "  const loadRecipe = (req: AuthedRequest) => {",
    "    requireCompanyRoles(req, recipe.companyId, ['Accountant']);",
    "  };",
  ].join('\n');

  const rows = extractGates(source);
  assert.deepEqual(rows[0].roles, ['Admin', 'Manager'],
    'the trailing helper gate must not leak into the preceding route');
});

test('a route factory is expanded into one row per call site', () => {
  const source = [
    "  const requisitionAction = (",
    "    suffix: string,",
    "    roles: UserRole[],",
    "    run: (id: string, req: AuthedRequest) => unknown,",
    "  ) => {",
    "    app.post(",
    "      `/purchase-requisitions/:id/${suffix}`,",
    "      authMiddleware,",
    "      handler((req, res) => {",
    "        requireCompanyRoles(req, existing.companyId, roles);",
    "      }),",
    "    );",
    "  };",
    "  requisitionAction('submit', companyManagementRoles, (id) => store.submit(id));",
    "  requisitionAction('approve', ['Admin', 'Manager'], (id) => store.approve(id));",
  ].join('\n');

  const rows = extractGates(source);
  const byRoute = Object.fromEntries(rows.map((r) => [r.route, r]));

  assert.ok(byRoute['/purchase-requisitions/:id/submit'], 'submit route missing');
  assert.ok(byRoute['/purchase-requisitions/:id/approve'], 'approve route missing');
  assert.deepEqual(byRoute['/purchase-requisitions/:id/submit'].roles,
    ['Accountant', 'Admin', 'Manager']);
  assert.deepEqual(byRoute['/purchase-requisitions/:id/approve'].roles, ['Admin', 'Manager']);
  assert.ok(!rows.some((r) => r.route.includes('${')),
    'no unexpanded template literal may survive into the matrix');
  assert.ok(!rows.some((r) => r.roles.includes('roles')),
    'a parameter name must never be emitted as a role');
});
