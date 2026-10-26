import assert from 'node:assert/strict';
import test from 'node:test';
import { navAllowed } from './nav-permissions';

test('M-11: Projects follows projects.view; Tasks stays open (own tasks are always visible)', () => {
  const none = () => false;
  assert.equal(navAllowed('/projects', none), false);
  assert.equal(navAllowed('/projects', (k) => k === 'projects.view'), true);
  assert.equal(navAllowed('/tasks', none), true);
});
