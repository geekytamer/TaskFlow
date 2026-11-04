import { apiFetch } from '@/lib/api-client';
import type { ApprovalHold } from '@/services/approvalService';

/** Intercompany (spec 2026-11-04-intercompany-design). */
export interface Sister { id: string; name: string; parentCompanyId: string | null; currency: string; clientId: string | null; supplierId: string | null }
export interface ExplainItem { kind: 'unmirrored_invoice' | 'draft_bill' | 'unmatched_payment'; companyId: string; documentId: string; number: string; amount: number }
export interface Balance { sisterId: string; ours: number; theirs: number; currency: string; theirCurrency: string; difference: number | null; explain: ExplainItem[] }
export interface ToMatch {
  kind: 'invoice_payment' | 'bill_payment'; paymentId: string; amount: number; paidAt: string;
  fromCompanyId: string; fromDocument: string; targetId: string; targetNumber: string; targetStatus: string;
}
export interface IntercompanyView { sisters: Sister[]; balances: Balance[]; toMatch: ToMatch[] }

export const getIntercompany = (companyId: string) => apiFetch<IntercompanyView>(`/companies/${companyId}/intercompany`);
export const setUpPartner = (companyId: string, sisterId: string, kind: 'client' | 'supplier') =>
  apiFetch<{ id: string; name: string }>(`/companies/${companyId}/intercompany/partners`, { method: 'POST', body: JSON.stringify({ sisterId, kind }) });
/** Seller records the receipt for a sister's bill payment; buyer records the payment for a sister's receipt (may wait for approval). */
export const matchPayment = (companyId: string, item: ToMatch) =>
  apiFetch<{ payment?: unknown; hold?: ApprovalHold }>(
    `/companies/${companyId}/intercompany/${item.kind === 'bill_payment' ? 'match-receipt' : 'match-payment'}`,
    { method: 'POST', body: JSON.stringify({ paymentId: item.paymentId }) },
  );
export const makeIntercompanyBill = (invoiceId: string) => apiFetch(`/invoices/${invoiceId}/intercompany-bill`, { method: 'POST' });
