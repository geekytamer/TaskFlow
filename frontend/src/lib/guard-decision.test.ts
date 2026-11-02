import assert from 'node:assert/strict';
import test from 'node:test';
import { guardDecision } from './guard-decision';

const perms = (allowed: boolean) => ({ ready: true, error: false, canAdmin: () => allowed });
const base = { permission: 'hr.view', userLoading: false, companyLoading: false, hasCompany: true };

test('on a page of its own, lacking the permission turns the person away', () => {
  assert.deepEqual(guardDecision({ ...base, permissions: perms(false) }), { loading: false, allowed: false, denied: true, error: false });
});

test('in one company section of a group page, lacking it only closes that section', () => {
  const d = guardDecision({ ...base, permissions: perms(false), inSection: true });
  assert.equal(d.allowed, false);
  assert.equal(d.denied, false, 'no redirect: the other companies stay on screen');
});

test('in a section, holding it shows the section', () => {
  assert.equal(guardDecision({ ...base, permissions: perms(true), inSection: true }).allowed, true);
});
