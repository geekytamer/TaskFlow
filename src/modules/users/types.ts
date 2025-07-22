export type UserRole = 'Admin' | 'Manager' | 'Employee';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  positionId?: string;
  avatar: string;
}
