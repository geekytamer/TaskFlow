import assert from 'node:assert/strict';
import test from 'node:test';
import { employerAction } from './employer';

const person = { id: 'u1', name: 'Sara', email: 'Sara@x.com' };

test('an HR record with the same email and no login is linked, not duplicated', () => {
  const employees = [{ id: 'e1', email: 'sara@x.com', userId: null }, { id: 'e2', email: 'omar@x.com', userId: null }];
  assert.deepEqual(employerAction(employees, person), { link: 'e1' });
});

test('a record already linked to someone else is left alone; a new one is made', () => {
  assert.deepEqual(employerAction([{ id: 'e1', email: 'sara@x.com', userId: 'other' }], person), { create: { name: 'Sara', email: 'Sara@x.com', userId: 'u1' } });
});

test('no record at all: a new one carrying the login', () => {
  assert.deepEqual(employerAction([], person), { create: { name: 'Sara', email: 'Sara@x.com', userId: 'u1' } });
});

test('an ended HR record is not brought back by email', () => {
  const employees = [{ id: 'e1', email: 'sara@x.com', userId: null, status: 'Terminated' }];
  assert.deepEqual(employerAction(employees, person), { create: { name: 'Sara', email: 'Sara@x.com', userId: 'u1' } });
});
