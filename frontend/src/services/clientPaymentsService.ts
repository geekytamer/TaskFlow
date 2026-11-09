import { API_BASE_URL, apiFetch, getStoredToken } from '@/lib/api-client';

/** Cheques and transfers a client promised or reported, before they are invoice payments (backend finance/client-payments). */
export type PaymentMethod = 'cheque' | 'transfer';
export type RecordStatus = 'received' | 'deposited' | 'cleared' | 'bounced' | 'returned' | 'pending' | 'confirmed' | 'rejected';

export interface ClientPaymentRecord {
  id: string;
  companyId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  method: PaymentMethod;
  status: RecordStatus;
  amount: number;
  currency: string | null;
  chequeNumber: string | null;
  bankName: string | null;
  dueDate: string | null;
  reference: string | null;
  paidOn: string | null;
  note: string | null;
  reason: string | null;
  paymentId: string | null;
  createdByName: string | null;
  fromPortal: boolean;
  statusAt: string;
  createdAt: string;
  files: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }>;
  messages: Array<{ stage: string; channel: 'whatsapp' | 'email'; status: 'sending' | 'sent' | 'skipped' | 'failed'; error: string | null; sentAt: string }>;
}

export interface ClientPaymentSettings { remindersEnabled: boolean; daysBefore: number; onTheDay: boolean }

export const listCompanyClientPayments = (companyId: string) =>
  apiFetch<{ records: ClientPaymentRecord[]; settings: ClientPaymentSettings }>(`/companies/${companyId}/client-payments`);

export const listInvoiceClientPayments = (invoiceId: string) =>
  apiFetch<{ records: ClientPaymentRecord[]; room: number }>(`/invoices/${invoiceId}/client-payments`);

export interface NewCheque {
  amount: number; chequeNumber: string; bankName?: string; dueDate: string; note?: string;
  fileName?: string; contentBase64?: string;
}

export const recordCheque = (invoiceId: string, input: NewCheque) =>
  apiFetch<ClientPaymentRecord>(`/invoices/${invoiceId}/client-payments`, {
    method: 'POST', body: JSON.stringify({ method: 'cheque', ...input }), refusal: 'inline',
  });

export const setClientPaymentStatus = (id: string, status: RecordStatus, extra: { reason?: string; on?: string } = {}) =>
  apiFetch<ClientPaymentRecord>(`/client-payments/${id}/status`, { method: 'POST', body: JSON.stringify({ status, ...extra }), refusal: 'inline' });

export const updateCheque = (id: string, input: Partial<Pick<NewCheque, 'amount' | 'chequeNumber' | 'bankName' | 'dueDate' | 'note'>>) =>
  apiFetch<ClientPaymentRecord>(`/client-payments/${id}`, { method: 'PATCH', body: JSON.stringify(input), refusal: 'inline' });

export const removeClientPayment = (id: string) => apiFetch<void>(`/client-payments/${id}`, { method: 'DELETE' });

export const saveClientPaymentSettings = (companyId: string, input: Partial<ClientPaymentSettings>) =>
  apiFetch<ClientPaymentSettings>(`/companies/${companyId}/client-payment-settings`, { method: 'PUT', body: JSON.stringify(input) });

/** Opens a cheque image or receipt in a new tab (the API needs the bearer token, so it is fetched first). */
export async function openClientPaymentFile(fileId: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE_URL}/client-payment-files/${fileId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Could not open the file.');
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const readFileBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});
