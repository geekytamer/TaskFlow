import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/api-client';
import { contactInUse, describeBlockers } from './contact-in-use';

test('reads the reasons from a refused delete, and nothing else', () => {
  const refused = new ApiError(409, 'in use', { code: 'contact_in_use', blockers: [{ key: 'invoices', count: 3 }] });
  assert.deepEqual(contactInUse(refused), [{ key: 'invoices', count: 3 }]);
  assert.equal(contactInUse(new ApiError(403, 'nope', { code: 'FORBIDDEN' })), null);
  assert.equal(contactInUse(new ApiError(409, 'other', { code: 'duplicate_handle' })), null);
  assert.equal(contactInUse(new Error('x')), null);
});

test('says what still uses the contact in Arabic and English', () => {
  const blockers = [{ key: 'invoices', count: 3 }, { key: 'vendor_bills', count: 1 }];
  assert.equal(describeBlockers(blockers, 'ar'), 'ما زالت مرتبطة بـ: 3 فواتير، 1 فواتير موردين / مدفوعات. احذفها أو انقلها لجهة أخرى أولاً.');
  assert.match(describeBlockers(blockers, 'en'), /^It is still linked to: 3 invoices, 1 vendor bills \/ payouts\./);
  assert.match(describeBlockers([{ key: 'something_new', count: 2 }], 'en'), /2 something new/);
});
