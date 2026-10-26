import assert from 'node:assert/strict';
import test from 'node:test';
import { adminCandidates, adminsChanged, companyChoices } from './holding-groups';

const groups = [
  { id: 'g1', name: 'North', companyIds: ['c1'], adminUserIds: [] },
  { id: 'g2', name: 'South', nameAr: 'الجنوب', companyIds: ['c2'], adminUserIds: [] },
];
const companies = [
  { id: 'c3', name: 'Zeta' },
  { id: 'c2', name: 'Beta' },
  { id: 'c1', name: 'Alpha' },
  { id: 'c4', name: 'Gamma' },
];

test('companyChoices leaves out the group own companies and marks those in another group', () => {
  const choices = companyChoices(companies, groups, 'g1');
  assert.deepEqual(choices.map((c) => c.id), ['c4', 'c3', 'c2']);
  assert.equal(choices[0].inGroup, null);
  assert.deepEqual(choices[2].inGroup, { id: 'g2', name: 'South', nameAr: 'الجنوب' });
});

test('companyChoices for a new empty group lists every company', () => {
  const choices = companyChoices(companies, groups, 'g3');
  assert.equal(choices.length, 4);
  assert.deepEqual(choices.filter((c) => !c.inGroup).map((c) => c.name), ['Gamma', 'Zeta']);
});

test('adminCandidates keeps members of the group companies and current admins outside it', () => {
  const users = [
    { id: 'u1', name: 'Sara', email: 's@x', companyIds: ['c1'] },
    { id: 'u2', name: 'Omar', email: 'o@x', companyIds: ['c9'] },
    { id: 'u3', name: 'Ali', email: 'a@x', companyIds: ['c9'] },
    { id: 'u4', name: 'Huda', email: 'h@x', companyIds: ['c9', 'c2'] },
  ];
  const got = adminCandidates(users, { companyIds: ['c1', 'c2'], adminUserIds: ['u2'] });
  assert.deepEqual(got.map((u) => [u.id, u.member]), [['u4', true], ['u2', false], ['u1', true]]);
});

test('adminsChanged ignores order', () => {
  assert.equal(adminsChanged(['a', 'b'], ['b', 'a']), false);
  assert.equal(adminsChanged(['a'], ['a', 'b']), true);
  assert.equal(adminsChanged(['a', 'b'], ['a', 'c']), true);
});
