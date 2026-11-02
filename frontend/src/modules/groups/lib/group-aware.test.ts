import assert from 'node:assert/strict';
import test from 'node:test';
import { needsOwnRecordsNotice } from './group-aware';

test('group-aware pages and company settings carry no notice; record pages do', () => {
  assert.equal(needsOwnRecordsNotice('/'), false);
  assert.equal(needsOwnRecordsNotice('/tasks'), false);
  assert.equal(needsOwnRecordsNotice('/settings/people'), false);
  assert.equal(needsOwnRecordsNotice('/finance'), true);
  assert.equal(needsOwnRecordsNotice('/crm/pipeline'), true);
  assert.equal(needsOwnRecordsNotice('/projects/abc'), false, 'a record opened from a group list is that record\'s own company');
});
