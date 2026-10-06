const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractGates, loadRouteSource } = require('../dist/scripts/extract-gates');

/**
 * Routes the permission extractor finds no role check in. Each is public, an
 * authentication route, checks access per record, or is a super-admin tool.
 * A new route lands here only when its handler's role check is hidden in a
 * helper the extractor cannot see, which leaves it out of the permission map:
 * write the check inline instead, or add the route below with the reason.
 */
const KNOWN_UNGATED = new Set([
    'GET /health',
    'GET /public/invoices/:id',
    'GET /public/quotations/:id',
    'GET /public/resolve/:id',
    'GET /public/deliveries/:id',
    'GET /public/vendor-bills/:id',
    'GET /public/documents/:id',
    'POST /auth/login',
    'POST /auth/logout',
    'GET /auth/me',
    'PUT /auth/me',
    'GET /notifications',
    'GET /notifications/unread-count',
    'GET /notifications/preferences',
    'POST /notifications/read-all',
    'POST /notifications/:id/read',
    'PUT /notifications/preferences',
    'GET /admin/overview',
    'GET /admin/companies',
    'GET /admin/users',
    'GET /admin/activity',
    'GET /admin/health',
    'GET /admin/tools/backup',
    'POST /admin/tools/sweep-overdue-all',
    'POST /admin/tools/recompute-commissions-all',
    'POST /admin/tools/refresh-invoice-statuses',
    'POST /admin/impersonate/:userId',
    'GET /companies',
    'GET /users',
    'GET /users/:id',
    'POST /companies',
    'POST /users',
    'PUT /users/:id',
    'DELETE /companies/:id',
    'DELETE /users/:id',
    'GET /positions',
    'GET /positions/:id',
    'POST /positions',
    'PUT /positions/:id',
    'DELETE /positions/:id',
    'GET /projects',
    'GET /projects/:id',
    'GET /tasks',
    'GET /tasks/:id',
    'GET /tasks/:taskId/comments',
    'GET /tasks/:taskId/time-entries',
    'POST /tasks/:taskId/comments',
    'POST /tasks/:taskId/time-entries',
    'POST /tasks/mark-invoiced',
    'DELETE /time-entries/:id',
    'POST /whatsapp/webhook/:webhookToken',
    'POST /seed',
]);

test('no route is ungated by accident', () => {
  const ungated = extractGates(loadRouteSource(path.join(__dirname, '..', 'src')).source).filter((r) => r.gate === 'none').map((r) => `${r.method} ${r.route}`);
  assert.deepEqual(ungated.filter((r) => !KNOWN_UNGATED.has(r)), [], 'new ungated routes');
  assert.deepEqual([...KNOWN_UNGATED].filter((r) => !ungated.includes(r)), [], 'listed routes that are now gated: remove them from the list');
});
