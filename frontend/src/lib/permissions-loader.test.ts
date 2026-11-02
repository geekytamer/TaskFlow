import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL, RETRY_DELAYS_MS, loadReducer, nextRetryDelay, usableFeed, type LoadEvent, type LoadState } from './permissions-loader';
import { guardDecision } from './guard-decision';
import { buildAccess, type MyPermissions } from './permissions';
import { isAuthzChange } from './authz-change';

const feed = (companyId: string, keys: string[] = ['sales.view']): MyPermissions => ({
  engine: 'legacy', version: 1, companyId, superAdmin: false, member: true,
  grants: keys.map((key) => ({ key })), fields: [], disabledModules: [], academy: { lockedModules: [] },
});
const run = (events: LoadEvent[], from: LoadState = INITIAL) => events.reduce(loadReducer, from);

test('loading → ready opens the gates for that company only', () => {
  const loading = run([{ type: 'start', companyId: 'c1' }]);
  assert.equal(loading.status, 'loading');
  assert.equal(usableFeed(loading, 'c1'), null);
  const ready = loadReducer(loading, { type: 'success', companyId: 'c1', feed: feed('c1') });
  assert.equal(ready.status, 'ready');
  assert.ok(usableFeed(ready, 'c1'));
  assert.equal(usableFeed(ready, 'c2'), null, 'another company is not answered by this feed');
});

test('a company switch closes the gates until the new answer; a late answer for the old one is dropped', () => {
  const ready = run([{ type: 'start', companyId: 'c1' }, { type: 'success', companyId: 'c1', feed: feed('c1') }]);
  const switching = loadReducer(ready, { type: 'start', companyId: 'c2' });
  assert.equal(switching.status, 'loading');
  assert.equal(switching.feed, null);
  const late = loadReducer(switching, { type: 'success', companyId: 'c1', feed: feed('c1') });
  assert.equal(late, switching);
  assert.equal(usableFeed(late, 'c2'), null);
});

test('a refresh of the same company keeps the answer; the same answer keeps its object', () => {
  const ready = run([{ type: 'start', companyId: 'c1' }, { type: 'success', companyId: 'c1', feed: feed('c1') }]);
  assert.equal(loadReducer(ready, { type: 'start', companyId: 'c1' }), ready);
  assert.equal(loadReducer(ready, { type: 'success', companyId: 'c1', feed: feed('c1') }), ready);
  const failedRefresh = loadReducer(ready, { type: 'failure', companyId: 'c1' });
  assert.equal(failedRefresh.status, 'ready', 'a failed refresh does not close open gates');
  assert.ok(usableFeed(failedRefresh, 'c1'));
});

test('a failed first load is an error with automatic retries at 2s, 5s, 15s, then Retry only', () => {
  let state = run([{ type: 'start', companyId: 'c1' }, { type: 'failure', companyId: 'c1' }]);
  assert.equal(state.status, 'error');
  assert.equal(usableFeed(state, 'c1'), null);
  const delays: Array<number | null> = [];
  for (let i = 0; i < 4; i++) {
    delays.push(nextRetryDelay(state));
    state = run([{ type: 'start', companyId: 'c1' }, { type: 'failure', companyId: 'c1' }], state);
  }
  assert.deepEqual(delays, [...RETRY_DELAYS_MS, null]);
  // Retry by hand still works, and success clears the error.
  const recovered = run([{ type: 'start', companyId: 'c1' }, { type: 'success', companyId: 'c1', feed: feed('c1') }], state);
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.failures, 0);
  assert.equal(nextRetryDelay(recovered), null);
});

test('no company: idle, nothing to load', () => {
  assert.deepEqual(loadReducer(INITIAL, { type: 'start', companyId: null }), INITIAL);
});

const perms = (state: 'loading' | 'error' | 'ready', keys: string[] = []) => {
  const access = buildAccess(state === 'ready' ? feed('c1', keys) : null);
  return { ready: access.ready, error: state === 'error', canAdmin: access.canAdmin };
};
const base = { userLoading: false, companyLoading: false, hasCompany: true };

test('guard: waits while loading, never denies on a guess', () => {
  const d = guardDecision({ ...base, permission: 'sales.view', permissions: perms('loading') });
  assert.deepEqual(d, { loading: true, allowed: false, denied: false, error: false });
});

test('guard: a failed load reports an error, keeps waiting, and does not deny', () => {
  const d = guardDecision({ ...base, permission: 'sales.view', permissions: perms('error') });
  assert.deepEqual(d, { loading: true, allowed: false, denied: false, error: true });
});

test('guard: ready answers decide', () => {
  assert.deepEqual(guardDecision({ ...base, permission: 'sales.view', permissions: perms('ready', ['sales.view']) }),
    { loading: false, allowed: true, denied: false, error: false });
  assert.deepEqual(guardDecision({ ...base, permission: 'sales.view', permissions: perms('ready', []) }),
    { loading: false, allowed: false, denied: true, error: false });
  // A page with no permission is open once signed in.
  assert.equal(guardDecision({ ...base, permissions: perms('loading') }).allowed, true);
});

test('guard: the super admin passes only their own surfaces', () => {
  const access = buildAccess({ ...feed('c1', []), superAdmin: true });
  const p = { ready: true, error: false, canAdmin: access.canAdmin };
  assert.equal(guardDecision({ ...base, permission: 'people.manage_roles', permissions: p }).allowed, true);
  assert.equal(guardDecision({ ...base, permission: 'settings.edit_branding', permissions: p }).allowed, true);
  assert.equal(guardDecision({ ...base, permission: 'sales.view', permissions: p }).denied, true);
});

test('only authz-related saves refresh the permissions', () => {
  for (const path of ['/companies/1/roles/r1', '/companies/1/people/u1/roles', '/users/u1', '/companies/1/users',
    '/permission-groups/g1/permissions', '/holding-groups/h1/assignments', '/companies/1']) {
    assert.equal(isAuthzChange({ method: 'PUT', path }), true, path);
  }
  for (const path of ['/companies/1/sales-orders', '/tasks/t1', '/companies/1/contacts/import', '/companies/1/team-chats']) {
    assert.equal(isAuthzChange({ method: 'POST', path }), false, path);
  }
  assert.equal(isAuthzChange(undefined), false);
});
