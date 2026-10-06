import { apiFetch } from '@/lib/api-client';

export type RecurringKind = 'invoice' | 'bill';
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringMode = 'draft' | 'issue';

export interface RecurringLine { itemType: 'Manual'; description: string; quantity: number; unitPrice: number; amount: number }
export interface RecurringInvoiceContent { lineItems: RecurringLine[]; taxRate?: number; currency?: string; notes?: string; templateId?: string }
export interface RecurringBillContent { amount: number; taxRate?: number; expenseAccountId?: string; notes?: string }

export interface RecurringRun { runDate: string; documentId: string | null; status: 'created' | 'held' | 'failed'; message: string | null }

export interface RecurringDocument {
  id: string;
  companyId: string;
  kind: RecurringKind;
  name: string;
  partyId: string;
  content: RecurringInvoiceContent | RecurringBillContent;
  frequency: RecurringFrequency;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  mode: RecurringMode;
  paymentTermsDays: number;
  active: boolean;
  lastRuns?: RecurringRun[];
}

export type RecurringInput = Pick<RecurringDocument, 'kind' | 'name' | 'partyId' | 'content' | 'frequency' | 'startDate' | 'endDate' | 'mode' | 'paymentTermsDays'>;

export const getRecurringDocuments = (companyId: string) =>
  apiFetch<RecurringDocument[]>(`/companies/${companyId}/recurring-documents`);

export const createRecurringDocument = (companyId: string, data: RecurringInput) =>
  apiFetch<RecurringDocument>(`/companies/${companyId}/recurring-documents`, { method: 'POST', body: JSON.stringify(data) });

export const updateRecurringDocument = (id: string, data: Partial<RecurringInput> & { active?: boolean }) =>
  apiFetch<RecurringDocument>(`/recurring-documents/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteRecurringDocument = (id: string) =>
  apiFetch<void>(`/recurring-documents/${id}`, { method: 'DELETE' });
