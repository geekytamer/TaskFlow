export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Accountant';

export interface CompanyRoleAssignment {
  companyId: string;
  role: UserRole;
  positionId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole; // primary/default; company-specific role may differ per companyRoles
  companyIds: string[];
  positionId?: string; // legacy
  companyRoles?: CompanyRoleAssignment[];
  avatar: string;
}
