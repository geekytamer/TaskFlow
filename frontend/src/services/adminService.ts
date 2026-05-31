import { apiFetch, setStoredToken } from '@/lib/api-client';

export interface AdminOverview {
  companies: number;
  users: number;
  usersByRole: Array<{ role: string; c: number }>;
  contacts: number;
  openOpportunities: number;
  invoices: number;
  openReceivables: number;
  openPayables: number;
  revenueMtd: number;
  revenueYtd: number;
  whatsappInstances: number;
  whatsappActive: number;
  tasksOpen: number;
  followupsOpen: number;
  followupsOverdue: number;
  commissionsDraft: number;
  commissionsApproved: number;
  commissionsPaid: number;
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  website?: string | null;
  address?: string | null;
  userCount: number;
  contactCount: number;
  invoiceCount: number;
  revenue: number;
  taskCount: number;
  lastActivityAt: string | null;
  whatsappLinked: boolean;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  companyIds: string[];
  commissionEligible?: boolean;
  lastActivityAt: string | null;
}

export interface AdminActivityRow {
  id: string;
  companyId: string;
  actorUserId?: string;
  actorName?: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface AdminActivityResponse {
  total: number;
  offset: number;
  limit: number;
  rows: AdminActivityRow[];
}

export interface AdminHealth {
  version: string;
  nodeVersion: string;
  uptimeSeconds: number;
  dbSizeBytes: number;
  migrationsApplied: string[];
  rowCounts: Array<{ table: string; rows: number }>;
}

export const adminService = {
  overview: () => apiFetch<AdminOverview>('/admin/overview'),
  companies: () => apiFetch<AdminCompanyRow[]>('/admin/companies'),
  users: () => apiFetch<AdminUserRow[]>('/admin/users'),
  activity: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const s = qs.toString();
    return apiFetch<AdminActivityResponse>(`/admin/activity${s ? `?${s}` : ''}`);
  },
  health: () => apiFetch<AdminHealth>('/admin/health'),

  sweepOverdueAll: () =>
    apiFetch<{ created: number }>('/admin/tools/sweep-overdue-all', { method: 'POST' }),
  recomputeCommissionsAll: () =>
    apiFetch<{ recomputed: number }>('/admin/tools/recompute-commissions-all', { method: 'POST' }),
  refreshInvoiceStatuses: () =>
    apiFetch<{ refreshed: number }>('/admin/tools/refresh-invoice-statuses', { method: 'POST' }),

  backupUrl: (baseUrl: string, token: string) =>
    `${baseUrl}/admin/tools/backup`,

  impersonate: async (userId: string) => {
    const { token } = await apiFetch<{ token: string; user: any }>(`/admin/impersonate/${userId}`, { method: 'POST' });
    return token;
  },
};

/** Saves the current admin token under a separate key, swaps in an
 * impersonation token, and reloads the app as the target user. */
export function startImpersonation(impersonationToken: string, originalToken: string) {
  try {
    localStorage.setItem('taskflow_admin_token', originalToken);
    setStoredToken(impersonationToken);
    window.location.href = '/';
  } catch {
    /* no-op */
  }
}

/** Restore the admin's original token. */
export function endImpersonation() {
  try {
    const original = localStorage.getItem('taskflow_admin_token');
    if (original) {
      setStoredToken(original);
      localStorage.removeItem('taskflow_admin_token');
    }
    window.location.href = '/admin';
  } catch {
    /* no-op */
  }
}

export function isImpersonating() {
  try {
    return Boolean(localStorage.getItem('taskflow_admin_token'));
  } catch {
    return false;
  }
}
