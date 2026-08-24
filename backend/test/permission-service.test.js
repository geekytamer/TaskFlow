const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DataStore } = require('../dist/data/store');
const {
  PermissionService,
  AuthzUnavailableError,
} = require('../dist/permissions/permission-service');

const freshStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-svc-'));
  return new DataStore({ dbPath: path.join(dir, 'taskflow.db'), seedOnEmpty: false });
};

/** Stands in for OpenFGA, so these tests need no running server. */
/** Permissions are given as 'company/module/action' triples. */
const stubFga = (permissions, opts = {}) => ({
  calls: 0,
  permissions,
  throws: opts.throws || false,
  async listGrantedObjects() {
    this.calls += 1;
    if (this.throws) throw new Error('connection refused');
    return this.permissions.map((p) => `permission:${p}`);
  },
});

test('permissions are fetched once and served from cache thereafter', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read']);
  const svc = new PermissionService({ store, fga });

  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true);
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true);
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true);
  assert.equal(fga.calls, 1, 'repeat checks must hit the cache');
});

test('bumping the authz version invalidates the cache', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read']);
  const svc = new PermissionService({ store, fga });

  await svc.has('u1', 'c1', 'invoices', 'read');
  store.bumpAuthzVersion();
  await svc.has('u1', 'c1', 'invoices', 'read');
  assert.equal(fga.calls, 2, 'a version bump must force a refetch');
});

test('a permission granted after a refetch takes effect', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read']);
  const svc = new PermissionService({ store, fga });

  assert.equal(await svc.has('u1', 'c1', 'invoices', 'delete'), false);
  fga.permissions = ['c1/invoices/read', 'c1/invoices/delete'];
  store.bumpAuthzVersion();
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'delete'), true);
});

test('one fetch covers every company the user belongs to', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read', 'c2/tasks/create']);
  const svc = new PermissionService({ store, fga });

  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true);
  assert.equal(await svc.has('u1', 'c2', 'tasks', 'create'), true);
  assert.equal(fga.calls, 1, 'a second company must not cost a second round trip');
});

test('different users are cached separately', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read']);
  const svc = new PermissionService({ store, fga });

  await svc.has('u1', 'c1', 'invoices', 'read');
  await svc.has('u2', 'c1', 'invoices', 'read');
  assert.equal(fga.calls, 2, 'the cache key must include the user');
});

test('a company the user has nothing in yields an empty set, not an error', async () => {
  const store = freshStore();
  const svc = new PermissionService({ store, fga: stubFga(['c1/invoices/read']) });
  assert.equal((await svc.getPermissions('u1', 'c-other')).size, 0);
  assert.equal(await svc.has('u1', 'c-other', 'invoices', 'read'), false);
});

test('allows() checks a resolved map synchronously', async () => {
  const store = freshStore();
  const svc = new PermissionService({ store, fga: stubFga(['c1/invoices/read']) });
  const map = await svc.getAllPermissions('u1');

  assert.equal(PermissionService.allows(map, 'c1', 'invoices', 'read'), true);
  assert.equal(PermissionService.allows(map, 'c1', 'invoices', 'delete'), false);
  assert.equal(PermissionService.allows(map, 'c2', 'invoices', 'read'), false);
  assert.equal(PermissionService.allows(undefined, 'c1', 'invoices', 'read'), false,
    'an unresolved map must deny, never throw');
});

test('an unknown permission is denied rather than erroring', async () => {
  const store = freshStore();
  const svc = new PermissionService({ store, fga: stubFga(['c1/invoices/read']) });
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'delete'), false);
});

test('an unreachable OpenFGA with a cold cache raises 503, not a denial', async () => {
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

test('an unreachable OpenFGA with a warm cache keeps serving the stale set', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read']);
  const svc = new PermissionService({ store, fga });
  await svc.has('u1', 'c1', 'invoices', 'read');

  fga.throws = true;
  store.bumpAuthzVersion();
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'read'), true,
    'a stale cache beats locking everyone out');
});

test('a failed refetch never silently grants something new', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read']);
  const svc = new PermissionService({ store, fga });
  await svc.has('u1', 'c1', 'invoices', 'read');

  fga.throws = true;
  store.bumpAuthzVersion();
  assert.equal(await svc.has('u1', 'c1', 'invoices', 'delete'), false);
});

test('getPermissions returns the whole set for one round trip', async () => {
  const store = freshStore();
  const fga = stubFga(['c1/invoices/read', 'c1/invoices/create', 'c1/tasks/create']);
  const svc = new PermissionService({ store, fga });

  const perms = await svc.getPermissions('u1', 'c1');
  assert.equal(perms.size, 3);
  assert.ok(perms.has('tasks:create'));
  assert.equal(fga.calls, 1);
});
