export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Accountant';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyIds: string[];
  positionId?: string;
  avatar: string;
}
