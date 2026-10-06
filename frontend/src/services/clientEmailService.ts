import { apiFetch } from '@/lib/api-client';

export interface ReminderSettings { enabled: boolean; days: number[]; emailConfigured: boolean }

export const emailInvoice = (invoiceId: string, data: { to?: string; message?: string }) =>
  apiFetch<{ sent: boolean; to: string }>(`/invoices/${invoiceId}/email`, { method: 'POST', body: JSON.stringify(data) });
export const getReminderSettings = (companyId: string) => apiFetch<ReminderSettings>(`/companies/${companyId}/client-reminders`);
export const setReminderSettings = (companyId: string, data: { enabled: boolean; days?: number[] }) =>
  apiFetch<ReminderSettings>(`/companies/${companyId}/client-reminders`, { method: 'PUT', body: JSON.stringify(data) });
