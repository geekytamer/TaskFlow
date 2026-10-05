import { apiFetch } from '@/lib/api-client';
import type { Invoice, Quotation, QuotationStatus, SalesOrder, SalesOrderLineItem } from '@/modules/finance/types';
import { mapSalesOrderLineItem } from '@/services/financeService';

const toDate = (value: any) => (value ? new Date(value) : undefined);

export const mapQuotation = (quote: any): Quotation => ({
  ...quote,
  issueDate: toDate(quote.issueDate) || new Date(),
  validUntil: toDate(quote.validUntil) || new Date(),
  items: Array.isArray(quote.items) ? quote.items.map(mapSalesOrderLineItem) : [],
  subtotal: Number(quote.subtotal || 0),
  taxRate: Number(quote.taxRate || 0),
  taxAmount: Number(quote.taxAmount || 0),
  totalAmount: Number(quote.totalAmount || 0),
  exchangeRate: Number(quote.exchangeRate || 1),
  sentAt: toDate(quote.sentAt),
  acceptedAt: toDate(quote.acceptedAt),
  declinedAt: toDate(quote.declinedAt),
  createdAt: toDate(quote.createdAt) || new Date(),
  updatedAt: toDate(quote.updatedAt) || new Date(),
});

export interface QuotationInput {
  clientId?: string;
  contactId?: string;
  opportunityId?: string;
  issueDate: Date;
  validUntil: Date;
  items: SalesOrderLineItem[];
  taxRate?: number;
  currency?: string;
  exchangeRate?: number;
  notes?: string;
  templateId?: string;
}

export async function getQuotations(companyId: string, filter: { opportunityId?: string } = {}): Promise<Quotation[]> {
  if (!companyId) return [];
  const query = filter.opportunityId ? `?opportunityId=${encodeURIComponent(filter.opportunityId)}` : '';
  const quotes = await apiFetch<any[]>(`/companies/${companyId}/quotations${query}`);
  return quotes.map(mapQuotation);
}

export async function createQuotation(companyId: string, data: QuotationInput): Promise<Quotation> {
  return mapQuotation(await apiFetch(`/companies/${companyId}/quotations`, { method: 'POST', body: JSON.stringify(data) }));
}

export async function updateQuotation(id: string, data: Partial<QuotationInput>): Promise<Quotation> {
  return mapQuotation(await apiFetch(`/quotations/${id}`, { method: 'PUT', body: JSON.stringify(data) }));
}

export async function setQuotationStatus(id: string, status: QuotationStatus): Promise<Quotation> {
  return mapQuotation(await apiFetch(`/quotations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
}

export async function deleteQuotation(id: string): Promise<void> {
  await apiFetch(`/quotations/${id}`, { method: 'DELETE' });
}

export async function convertQuotationToSalesOrder(id: string): Promise<SalesOrder> {
  return apiFetch<SalesOrder>(`/quotations/${id}/sales-order`, { method: 'POST', body: '{}' });
}

export async function convertQuotationToInvoice(id: string, data: { templateId?: string } = {}): Promise<Invoice> {
  return apiFetch<Invoice>(`/quotations/${id}/invoice`, { method: 'POST', body: JSON.stringify(data) });
}
