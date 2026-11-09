import { portalGet, portalGetOrNull } from './client-api';

/** Browser safe types; the fetchers run on the server. */
export type PaymentMethod = 'cheque' | 'transfer';
export type RecordStatus = 'received' | 'deposited' | 'cleared' | 'bounced' | 'returned' | 'pending' | 'confirmed' | 'rejected';

/** A cheque Peak holds or a transfer the client reported, as the client may see it. */
export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  method: PaymentMethod;
  status: RecordStatus;
  amount: number;
  currency: string | null;
  chequeNumber: string | null;
  bankName: string | null;
  dueDate: string | null;
  reference: string | null;
  paidOn: string | null;
  /** Only for a rejected transfer. */
  reason: string | null;
  fromYou: boolean;
  files: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
}

export const getPaymentRecords = () => portalGet<PaymentRecord[]>('/payments');
export const getInvoicePaymentRecords = (invoiceId: string) =>
  portalGetOrNull<{ records: PaymentRecord[]; room: number }>(`/invoices/${encodeURIComponent(invoiceId)}/payments`);

export const paymentFileHref = (fileId: string) => `/api/payment-files/${encodeURIComponent(fileId)}`;

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(date: string, now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${date}T00:00:00Z`) - today) / 86_400_000);
}

/** Cheques still to be deposited, soonest first. */
export const upcomingCheques = (records: PaymentRecord[]) =>
  records.filter((r) => r.method === 'cheque' && r.status === 'received' && r.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
