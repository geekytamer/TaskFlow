export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Accountant';

export interface CompanyRoleAssignment {
  companyId: string;
  role: UserRole;
  positionId?: string;
}

export type CommissionBasis = 'Revenue' | 'Paid Amount' | 'Profit';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole; // primary/default; company-specific role may differ per companyRoles
  companyIds: string[];
  positionId?: string; // legacy
  companyRoles?: CompanyRoleAssignment[];
  avatar: string;
  // Platform super-admin flag
  isSuperAdmin?: boolean;
  // Commission profile
  commissionEligible?: boolean;
  defaultCommissionRate?: number;
  defaultCommissionBasis?: CommissionBasis;
  costRatePerHour?: number;
}
