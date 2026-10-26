import assert from 'node:assert/strict';
import test from 'node:test';
import { beyond as serverBeyond } from '../../../../../backend/src/authz/describe';
import { buildAccess, type MyPermissions } from '@/lib/permissions';
import type { Scope } from '@/services/authzService';
import { beyondMe, holderFromFloor, holderFromAccess, within, type Holder } from './beyond';

type G = { key: string; scope?: Scope; limit?: number };
type F = { key: string; view: boolean; edit: boolean };

/** The same holdings as the server's CompanyEffective and as the client's Holder (through buildAccess). */
function both(grants: G[], fields: F[]) {
  const actor = {
    grants: new Map(grants.map((g) => [g.key, { scope: g.scope, limit: g.limit, sources: [] }])),
    fields: new Map(fields.map((f) => [f.key, { view: f.view, edit: f.edit, sources: [] }])),
  };
  const feed: MyPermissions = {
    engine: 'v2', version: 1, companyId: 'c1', superAdmin: false, member: true,
    grants: grants.map((g) => ({ key: g.key, ...(g.scope ? { scope: g.scope } : {}), ...(g.limit !== undefined ? { limit: g.limit } : {}) })),
    fields: fields.map((f) => ({ key: f.key as never, view: f.view, edit: f.edit })),
    disabledModules: [], academy: { lockedModules: [] },
  };
  return { actor, me: holderFromAccess(buildAccess(feed)) as Holder };
}

const SCOPE_OPTS: Array<Scope | undefined> = [undefined, 'own', 'team', 'company', 'group'];
const LIMIT_OPTS: Array<number | undefined> = [undefined, 100, 5000];

test('beyondMe answers exactly like the server for every scope and limit combination', () => {
  let cases = 0;
  for (const myScope of SCOPE_OPTS) for (const myLimit of LIMIT_OPTS) {
    const { actor, me } = both([{ key: 'tasks.view', scope: myScope, limit: myLimit }], [{ key: 'salary', view: true, edit: false }]);
    for (const scope of SCOPE_OPTS) for (const limit of LIMIT_OPTS) for (const view of [false, true]) for (const edit of [false, true]) {
      const grants = [{ key: 'tasks.view', scope, limit }, ...(limit === 100 ? [{ key: 'sales.view' }] : [])];
      const fields = [{ key: 'salary', view, edit }, { key: 'bank_details', view: edit, edit: false }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expected = serverBeyond(actor as any, grants, fields);
      assert.deepEqual(beyondMe(me, grants, fields), expected, JSON.stringify({ myScope, myLimit, scope, limit, view, edit }));
      cases++;
    }
  }
  assert.ok(cases > 300);
});

test('readable cases: wider scope, missing key, higher or no limit, fields', () => {
  const { me } = both([{ key: 'tasks.view', scope: 'team' }, { key: 'purchasing.approve', limit: 5000 }], [{ key: 'salary', view: true, edit: false }]);
  assert.equal(within(me, { key: 'tasks.view', scope: 'own' }), true);
  assert.equal(within(me, { key: 'tasks.view', scope: 'company' }), false);
  assert.equal(within(me, { key: 'sales.view' }), false);
  assert.equal(within(me, { key: 'purchasing.approve', limit: 4000 }), true);
  assert.equal(within(me, { key: 'purchasing.approve', limit: 6000 }), false);
  assert.equal(within(me, { key: 'purchasing.approve' }), false, 'no limit is above a limit');
  assert.deepEqual(beyondMe(me, [], [{ key: 'salary', view: true, edit: true }]), ['field:salary']);
});

test('the super admin is exempt; a closed answer holds nothing', () => {
  const feed = { engine: 'v2', version: 1, companyId: 'c1', superAdmin: true, member: false, grants: [], fields: [], disabledModules: [], academy: { lockedModules: [] } } as MyPermissions;
  assert.equal(holderFromAccess(buildAccess(feed)), null);
  assert.deepEqual(beyondMe(null, [{ key: 'people.manage_roles' }]), []);
  const closed = holderFromAccess(buildAccess(null))!;
  assert.deepEqual(beyondMe(closed, [{ key: 'dashboard.view' }]), ['dashboard.view']);
});

test('C-2: the group floor bounds a group admin; null is unbounded', () => {
  const floor = holderFromFloor({ grants: [{ key: 'crm.view', scope: 'company' }], fields: [{ key: 'salary', view: true, edit: false }] });
  assert.deepEqual(beyondMe(floor, [{ key: 'crm.view', scope: 'group' }, { key: 'sales.view' }], [{ key: 'salary', view: true, edit: true }]), ['crm.view', 'sales.view', 'field:salary']);
  assert.deepEqual(beyondMe(floor, [{ key: 'crm.view', scope: 'own' }]), []);
  assert.equal(holderFromFloor(null), null);
});
