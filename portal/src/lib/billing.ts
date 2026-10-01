import { portalGet, portalGetOrNull } from './client-api';

export type InvoiceStatus = 'due' | 'overdue' | 'partly_paid' | 'paid';

export interface InvoiceSummary {
  id: string;
  number: string;
  issueDate: string | null;
  dueDate: string | null;
  status: InvoiceStatus;
  currency: string;
  total: number;
  paid: number;
  credited: number;
  outstanding: number;
  campaign: { id: string; name: string } | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  taxRate: number;
  notes: string | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; discount: number | null; discountType: string | null; amount: number }>;
  payments: Array<{ id: string; receiptNumber: string; paidAt: string | null; amount: number; method: string | null }>;
  creditNotes: Array<{ number: string; issueDate: string | null; total: number }>;
}

export interface Statement {
  campaign: { id: string; name: string };
  currency: string;
  invoices: InvoiceSummary[];
  totals: { invoiced: number; paid: number; credited: number; outstanding: number };
}

export const getInvoices = () => portalGet<InvoiceSummary[]>('/invoices');
export const getInvoice = (id: string) => portalGetOrNull<InvoiceDetail>(`/invoices/${encodeURIComponent(id)}`);
export const getStatement = (campaignId: string) => portalGetOrNull<Statement>(`/campaigns/${encodeURIComponent(campaignId)}/statement`);

/** Download links on this host; each proxies one document after the backend checks ownership. */
export const invoicePdfHref = (id: string) => `/api/invoices/${encodeURIComponent(id)}/pdf`;
export const receiptHref = (paymentId: string) => `/api/payments/${encodeURIComponent(paymentId)}/receipt`;
export const statementHref = (campaignId: string) => `/api/campaigns/${encodeURIComponent(campaignId)}/statement`;
