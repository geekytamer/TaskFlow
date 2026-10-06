import { apiFetch } from '@/lib/api-client';

export type SearchType = 'contacts' | 'invoices' | 'salesOrders' | 'purchaseOrders' | 'items' | 'batches' | 'shipments' | 'projects' | 'tasks' | 'employees';
export interface SearchGroup { type: SearchType; items: Array<{ id: string; title: string; subtitle?: string; route: string }> }

export const searchCompany = (companyId: string, q: string) =>
  apiFetch<SearchGroup[]>(`/companies/${companyId}/search?q=${encodeURIComponent(q)}`);
