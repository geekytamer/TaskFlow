import assert from 'node:assert/strict';
import test from 'node:test';
import { framePerCompany } from './group-aware';

test('pages that merge a whole group, settings and single records are not framed', () => {
  for (const path of ['/', '/tasks', '/projects', '/contacts', '/clients', '/suppliers', '/sales', '/purchases', '/purchases/requisitions', '/finance']) {
    assert.equal(framePerCompany(path), false, path);
  }
  for (const path of ['/settings/people', '/admin', '/academy', '/projects/abc', '/contacts/abc', '/inventory/warehouses/w1',
    '/flexi/accounts/c1', '/inbox', '/whatsapp']) {
    assert.equal(framePerCompany(path), false, path);
  }
});

test('every other page is shown once per company of the group', () => {
  for (const path of ['/inventory', '/hr/leave', '/crm/pipeline', '/approvals', '/documents', '/purchases/rfq']) {
    assert.equal(framePerCompany(path), true, path);
  }
});
