import type { SanitizedUser, UserRole } from './types';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const getAccessibleCompanyIds = (user: SanitizedUser): string[] => {
  if (user.companyRoles && user.companyRoles.length > 0) {
    return Array.from(new Set(user.companyRoles.map((role) => role.companyId)));
  }
  return Array.from(new Set(user.companyIds || []));
};

export const getEffectiveRole = (
  user: SanitizedUser,
  companyId?: string,
): UserRole | undefined => {
  if (!companyId) return user.role;
  const companyRole = user.companyRoles?.find(
    (assignment) => assignment.companyId === companyId,
  )?.role;
  if (companyRole) return companyRole;
  return (user.companyIds || []).includes(companyId) ? user.role : undefined;
};

export const canAccessCompany = (user: SanitizedUser, companyId: string): boolean =>
  getAccessibleCompanyIds(user).includes(companyId);

export const requireCompanyRole = (
  user: SanitizedUser,
  companyId: string,
  roles: UserRole[],
): boolean => {
  const effectiveRole = getEffectiveRole(user, companyId);
  return Boolean(effectiveRole && roles.includes(effectiveRole));
};
