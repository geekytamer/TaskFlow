import { apiFetch } from '@/lib/api-client';

export type EmploymentType = 'Full-time' | 'Part-time' | 'Contractor' | 'Intern';
export type EmployeeStatus = 'Active' | 'On Leave' | 'Terminated';
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface Department {
  id: string;
  companyId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Employee {
  id: string;
  companyId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  departmentId?: string;
  managerId?: string;
  employmentType?: EmploymentType;
  status: EmployeeStatus;
  hireDate?: Date;
  endDate?: Date;
  annualLeaveAllowance: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveType {
  id: string;
  companyId: string;
  name: string;
  paid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  leaveTypeId?: string;
  startDate: Date;
  endDate: Date;
  days: number;
  reason?: string;
  status: LeaveRequestStatus;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveBalance {
  employeeId: string;
  year: number;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
}

const toDate = (v: any) => (v ? new Date(v) : undefined);

const decodeEmployee = (r: any): Employee => ({
  ...r,
  hireDate: toDate(r.hireDate),
  endDate: toDate(r.endDate),
  annualLeaveAllowance: Number(r.annualLeaveAllowance ?? 0),
  createdAt: toDate(r.createdAt) ?? new Date(),
  updatedAt: toDate(r.updatedAt) ?? new Date(),
});

const decodeRequest = (r: any): LeaveRequest => ({
  ...r,
  startDate: toDate(r.startDate) ?? new Date(),
  endDate: toDate(r.endDate) ?? new Date(),
  days: Number(r.days ?? 0),
  reviewedAt: toDate(r.reviewedAt),
  createdAt: toDate(r.createdAt) ?? new Date(),
  updatedAt: toDate(r.updatedAt) ?? new Date(),
});

// ── Departments ──────────────────────────────────────────────────────────────
export async function getDepartments(companyId: string): Promise<Department[]> {
  return apiFetch<Department[]>(`/companies/${companyId}/departments`);
}
export async function createDepartment(companyId: string, name: string): Promise<Department> {
  return apiFetch<Department>(`/companies/${companyId}/departments`, { method: 'POST', body: JSON.stringify({ name }) });
}
export async function deleteDepartment(id: string): Promise<void> {
  await apiFetch(`/departments/${id}`, { method: 'DELETE' });
}

// ── Employees ────────────────────────────────────────────────────────────────
export async function getEmployees(companyId: string): Promise<Employee[]> {
  const data = await apiFetch<any[]>(`/companies/${companyId}/employees`);
  return data.map(decodeEmployee);
}
export async function createEmployee(companyId: string, input: Partial<Employee>): Promise<Employee> {
  const data = await apiFetch<any>(`/companies/${companyId}/employees`, {
    method: 'POST',
    body: JSON.stringify({ ...input, hireDate: input.hireDate instanceof Date ? input.hireDate.toISOString() : input.hireDate }),
  });
  return decodeEmployee(data);
}
export async function updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
  const data = await apiFetch<any>(`/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...updates, hireDate: updates.hireDate instanceof Date ? updates.hireDate.toISOString() : updates.hireDate }),
  });
  return decodeEmployee(data);
}
export async function deleteEmployee(id: string): Promise<void> {
  await apiFetch(`/employees/${id}`, { method: 'DELETE' });
}
export async function getLeaveBalance(employeeId: string, year?: number): Promise<LeaveBalance> {
  const q = year ? `?year=${year}` : '';
  return apiFetch<LeaveBalance>(`/employees/${employeeId}/leave-balance${q}`);
}

// ── Leave types ──────────────────────────────────────────────────────────────
export async function getLeaveTypes(companyId: string): Promise<LeaveType[]> {
  return apiFetch<LeaveType[]>(`/companies/${companyId}/leave-types`);
}
export async function createLeaveType(companyId: string, name: string, paid: boolean): Promise<LeaveType> {
  return apiFetch<LeaveType>(`/companies/${companyId}/leave-types`, { method: 'POST', body: JSON.stringify({ name, paid }) });
}
export async function deleteLeaveType(id: string): Promise<void> {
  await apiFetch(`/leave-types/${id}`, { method: 'DELETE' });
}

// ── Leave requests ───────────────────────────────────────────────────────────
export async function getLeaveRequests(companyId: string, filters?: { status?: string; employeeId?: string }): Promise<LeaveRequest[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.employeeId) params.set('employeeId', filters.employeeId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const data = await apiFetch<any[]>(`/companies/${companyId}/leave-requests${q}`);
  return data.map(decodeRequest);
}
export async function createLeaveRequest(
  companyId: string,
  input: { employeeId: string; leaveTypeId?: string; startDate: string; endDate: string; reason?: string },
): Promise<LeaveRequest> {
  const data = await apiFetch<any>(`/companies/${companyId}/leave-requests`, { method: 'POST', body: JSON.stringify(input) });
  return decodeRequest(data);
}
export async function setLeaveRequestStatus(id: string, status: LeaveRequestStatus, reviewNote?: string): Promise<LeaveRequest> {
  const data = await apiFetch<any>(`/leave-requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, reviewNote }) });
  return decodeRequest(data);
}
export async function deleteLeaveRequest(id: string): Promise<void> {
  await apiFetch(`/leave-requests/${id}`, { method: 'DELETE' });
}
