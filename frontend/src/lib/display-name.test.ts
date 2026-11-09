import assert from 'node:assert/strict';
import test from 'node:test';
import { allNames, displayName } from './display-name';
import { matchesSearch, normalizeSearch } from './search-normalize';

test('a name shows in the screen language, then the other, then name', () => {
  const both = { name: 'تهيئة فردية', nameAr: 'تهيئة فردية', nameEn: 'Solo onboarding' };
  assert.equal(displayName(both, 'en'), 'Solo onboarding');
  assert.equal(displayName(both, 'ar'), 'تهيئة فردية');
  assert.equal(displayName({ name: 'x', nameAr: 'عربي' }, 'en'), 'عربي');
  assert.equal(displayName({ name: 'Old' }, 'ar'), 'Old');
  assert.equal(allNames(both), 'تهيئة فردية تهيئة فردية Solo onboarding');
});

test('search folds Arabic spelling and finds either name', () => {
  assert.equal(normalizeSearch('أحمد'), normalizeSearch('احمد'));
  assert.equal(normalizeSearch('مؤسسة'), normalizeSearch('موسسه'));
  assert.ok(matchesSearch('تهيئه', 'تهيئة فردية'));
  assert.ok(matchesSearch('SOLO', 'x', 'Solo onboarding'));
  assert.ok(!matchesSearch('reel', 'تهيئة فردية'));
});
