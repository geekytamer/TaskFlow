import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from './api-client';
import { fanOut, latest } from './fan-out';

test('rows from each company, in company order, each tagged with its company', async () => {
  const { rows, missing } = await fanOut(['a', 'b'], async (id) => (id === 'a' ? [{ id: 'x' }, { id: 'y' }] : [{ id: 'z' }]));
  assert.deepEqual(rows, [{ id: 'x', companyId: 'a' }, { id: 'y', companyId: 'a' }, { id: 'z', companyId: 'b' }]);
  assert.deepEqual(missing, []);
});

test('a row keeps the company it says it belongs to', async () => {
  const { rows } = await fanOut(['g'], async () => [{ id: 'x', companyId: 'child' }]);
  assert.equal(rows[0].companyId, 'child');
});

test('a company that refuses is named, the others still show', async () => {
  const { rows, missing } = await fanOut(['a', 'b', 'c', 'd'], async (id) => {
    if (id === 'b') throw new ApiError(403, 'no', { code: 'FORBIDDEN' });
    if (id === 'c') throw new ApiError(403, 'off', { code: 'MODULE_OFF' });
    if (id === 'd') throw new Error('network');
    return [{ id: 'x' }];
  });
  assert.deepEqual(rows, [{ id: 'x', companyId: 'a' }]);
  assert.deepEqual(missing, [
    { companyId: 'b', reason: 'forbidden' },
    { companyId: 'c', reason: 'off' },
    { companyId: 'd', reason: 'error' },
  ]);
});

test('latest() lets only the newest request land', () => {
  const ticket = latest();
  const first = ticket.next();
  const second = ticket.next();
  assert.equal(ticket.isCurrent(first), false);
  assert.equal(ticket.isCurrent(second), true);
});

test('a company skipped up front is named without a request', async () => {
  const asked: string[] = [];
  const { rows, missing } = await fanOut(['a', 'b'], async (id) => { asked.push(id); return [{ id: 'x' }]; },
    { skip: (id) => (id === 'b' ? 'off' : null) });
  assert.deepEqual(asked, ['a']);
  assert.deepEqual(rows, [{ id: 'x', companyId: 'a' }]);
  assert.deepEqual(missing, [{ companyId: 'b', reason: 'off' }]);
});

