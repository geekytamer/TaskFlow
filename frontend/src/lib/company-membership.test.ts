import assert from 'node:assert/strict';
import test from 'node:test';
import { isCompanyMember } from './company-membership';

test('a person with company roles belongs only to those companies', () => {
  const user = { companyRoles: [{ companyId: 'peak', role: 'Admin' as const }], companyIds: ['peak', 'old'] };
  assert.equal(isCompanyMember(user, 'peak'), true);
  // companyRoles wins over the legacy list, same as the server.
  assert.equal(isCompanyMember(user, 'old'), false);
});

test('without company roles the company list decides', () => {
  assert.equal(isCompanyMember({ companyIds: ['gig'] }, 'gig'), true);
  assert.equal(isCompanyMember({ companyIds: ['gig'] }, 'peak'), false);
});

test('no person or no company is never a member', () => {
  assert.equal(isCompanyMember(null, 'peak'), false);
  assert.equal(isCompanyMember({ companyIds: ['peak'] }, undefined), false);
});
