export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Accountant';

export interface Company {
  id: string;
  name: string;
  website?: string;
  address?: string;
}

export interface Position {
  id: string;
  title: string;
  // Positions are global; companyId is kept only for backward compatibility during migration.
  companyId?: string;
}

export interface CompanyRoleAssignment {
  companyId: string;
  role: UserRole;
  positionId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyIds: string[];
  positionId?: string;
  companyRoles?: CompanyRoleAssignment[];
  avatar: string;
  password: string;
}

export type TaskStatus = 'To Do' | 'In Progress' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';
export type ProjectVisibility = 'Public' | 'Private';

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  companyId: string;
  visibility: ProjectVisibility;
  memberIds?: string[];
  clientId?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  dueDate?: Date;
  assignedUserIds?: string[];
  tags: string[];
  companyId: string;
  projectId: string;
  color?: string;
  dependencies?: string[];
  parentTaskId?: string;
  invoiceImage?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceDate?: Date;
  generatedInvoiceId?: string;
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
  companyId: string;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

export interface InvoiceLineItem {
  taskId: string;
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  clientId: string;
  issueDate: Date;
  dueDate: Date;
  lineItems: InvoiceLineItem[];
  total: number;
  status: InvoiceStatus;
  notes?: string;
  currency?: string;
  taxRate?: number;
  sentAt?: Date;
  paidAt?: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method?: string;
  note?: string;
  paidAt: Date;
}

export interface SanitizedUser extends Omit<User, 'password'> {}
