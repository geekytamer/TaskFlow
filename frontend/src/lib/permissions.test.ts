import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildAccess, type MyPermissions } from './permissions';
import { NAV_PERMISSIONS } from '@/modules/layout/lib/nav-permissions';
import { allPermissionKeys, SENSITIVE_FIELDS } from '../../../backend/src/authz/catalogue';

const feed = (over: Partial<MyPermissions> = {}): MyPermissions => ({
  engine: 'legacy',
  version: 3,
  companyId: 'c1',
  superAdmin: false,
  member: true,
  grants: [
    { key: 'sales.view' },
    { key: 'projects.view', scope: 'own' },
    { key: 'tasks.view', scope: 'company' },
    { key: 'purchasing.approve', limit: 5000 },
  ],
  fields: [
    { key: 'salary', view: true, edit: false },
    { key: 'rate_cards', view: false, edit: false },
  ],
  disabledModules: ['manufacturing'],
  academy: { lockedModules: ['sales'] },
  ...over,
});

test('closed while loading: no answer means every gate is shut', () => {
  const access = buildAccess(null);
  assert.equal(access.ready, false);
  assert.equal(access.can('sales.view'), false);
  assert.equal(access.can('dashboard.view'), false);
  assert.equal(access.canAny('sales.view', 'hr.view'), false);
  assert.equal(access.scopeOf('tasks.view'), undefined);
  assert.deepEqual(access.field('salary'), { view: false, edit: false });
  assert.equal(access.superAdmin, false);
  assert.equal(access.academyLocked('sales'), false);
});

test('closed while loading still knows switched-off modules from the company list', () => {
  const access = buildAccess(null, ['payroll']);
  assert.equal(access.moduleOn('payroll'), false);
  assert.equal(access.moduleOn('sales'), true);
});

test('can follows the grants, nothing else', () => {
  const access = buildAccess(feed());
  assert.equal(access.ready, true);
  assert.equal(access.can('sales.view'), true);
  assert.equal(access.can('sales.delete'), false);
  assert.equal(access.can('people.manage_roles'), false);
  assert.equal(access.canAny('sales.delete', 'sales.view'), true);
});

test('scope: a grant answers a scope it reaches, an unscoped grant answers any', () => {
  const access = buildAccess(feed());
  assert.equal(access.scopeOf('projects.view'), 'own');
  assert.equal(access.can('projects.view'), true);
  assert.equal(access.can('projects.view', { scope: 'own' }), true);
  assert.equal(access.can('projects.view', { scope: 'company' }), false);
  assert.equal(access.can('tasks.view', { scope: 'team' }), true);
  assert.equal(access.can('tasks.view', { scope: 'company' }), true);
  assert.equal(access.can('tasks.view', { scope: 'group' }), false);
  assert.equal(access.can('sales.view', { scope: 'group' }), true);
  assert.equal(access.scopeOf('sales.view'), undefined);
  assert.equal(access.limitOf('purchasing.approve'), 5000);
});

test('several grants of one key: the widest scope wins', () => {
  const access = buildAccess(feed({ grants: [{ key: 'crm.view', scope: 'own' }, { key: 'crm.view', scope: 'company' }, { key: 'crm.view', scope: 'team' }] }));
  assert.equal(access.scopeOf('crm.view'), 'company');
  assert.equal(access.can('crm.view', { scope: 'company' }), true);
});

test('field: view and edit as reported; an unreported field is closed', () => {
  const access = buildAccess(feed());
  assert.deepEqual(access.field('salary'), { view: true, edit: false });
  assert.deepEqual(access.field('rate_cards'), { view: false, edit: false });
  assert.deepEqual(access.field('client_terms'), { view: false, edit: false });
});

test('the super admin flag opens nothing by itself (the server decides by grants)', () => {
  const access = buildAccess(feed({ superAdmin: true, grants: [] }));
  assert.equal(access.superAdmin, true);
  assert.equal(access.can('sales.view'), false);
});

test('canAdmin: can(), plus only the super admin surfaces for the platform administrator', () => {
  const sa = buildAccess(feed({ superAdmin: true, grants: [] }));
  for (const key of ['settings.edit_branding', 'people.manage_roles', 'people.view_roles', 'people.manage']) {
    assert.equal(sa.canAdmin(key), true, key);
  }
  assert.equal(sa.canAdmin('sales.view'), false);
  assert.equal(sa.canAdmin('settings.manage_approvals'), false);
  const member = buildAccess(feed());
  assert.equal(member.canAdmin('sales.view'), true);
  assert.equal(member.canAdmin('people.manage_roles'), false);
  assert.equal(buildAccess(null).canAdmin('people.manage_roles'), false);
});

test('modules and academy locks come from the answer', () => {
  const access = buildAccess(feed(), ['sales']);
  assert.equal(access.moduleOn('manufacturing'), false);
  assert.equal(access.moduleOn('sales'), true, 'the answer is fresher than the company list');
  assert.equal(access.academyLocked('sales'), true);
  assert.equal(access.academyLocked('crm'), false);
});

const KEYS = new Set(allPermissionKeys());
const FIELDS = new Set(SENSITIVE_FIELDS.map((f) => f.key));

test('every menu destination names a catalogue key', () => {
  for (const [href, key] of Object.entries(NAV_PERMISSIONS)) {
    assert.ok(KEYS.has(key), `${href} → ${key} is not in the catalogue`);
  }
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

test('every literal can(...), useAuthGuard(...) and field(...) in the app names a catalogue key', () => {
  const root = join(__dirname, '..');
  const unknown: string[] = [];
  let seen = 0;
  for (const file of sources(root)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(?:can|canAdmin|useCan|useAuthGuard)\('([a-z_-]+\.[a-z_]+)'/g)) {
      seen++;
      if (!KEYS.has(m[1])) unknown.push(`${file}: ${m[1]}`);
    }
    for (const m of text.matchAll(/\bfield\('([a-z_]+)'\)/g)) {
      seen++;
      if (!FIELDS.has(m[1])) unknown.push(`${file}: field ${m[1]}`);
    }
  }
  assert.ok(seen > 50, `expected many gates, found ${seen}`);
  assert.deepEqual(unknown, []);
});

test('no screen still asks the removed role fallback', () => {
  const root = join(__dirname, '..');
  const offenders = sources(root).filter((file) => /usePermissionOr\(/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
