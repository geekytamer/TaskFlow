import type { User } from '@/modules/users/types';

/**
 * Mirrors backend/src/http.ts getAccessibleCompanyIds: the companies a person
 * belongs to. A super admin can open the company app only for these, because
 * every company route on the server checks membership, super admin or not.
 */
export function isCompanyMember(user: Pick<User, 'companyRoles' | 'companyIds'> | null | undefined, companyId: string | null | undefined): boolean {
  if (!user || !companyId) return false;
  if (user.companyRoles && user.companyRoles.length > 0) {
    return user.companyRoles.some((role) => role.companyId === companyId);
  }
  return (user.companyIds || []).includes(companyId);
}
