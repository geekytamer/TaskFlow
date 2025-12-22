import { apiFetch } from '@/lib/api-client';
import type { Client, Invoice } from '@/modules/finance/types';

const toDate = (value: any) => (value ? new Date(value) : undefined);

const mapInvoice = (invoice: any): Invoice => ({
  ...invoice,
  issueDate: toDate(invoice.issueDate) || new Date(),
  dueDate: toDate(invoice.dueDate) || new Date(),
  sentAt: toDate(invoice.sentAt),
  paidAt: toDate(invoice.paidAt),
});

export async function getClients(companyId: string): Promise<Client[]> {
  if (!companyId) return [];
  return apiFetch<Client[]>(`/companies/${companyId}/clients`);
}

export async function createClient(clientData: Omit<Client, 'id'>): Promise<Client> {
  return apiFetch<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify(clientData),
  });
}

export async function getInvoices(companyId: string): Promise<Invoice[]> {
  if (!companyId) return [];
  const invoices = await apiFetch<Invoice[]>(`/companies/${companyId}/invoices`);
  return invoices.map(mapInvoice);
}

export async function createInvoice(invoiceData: Omit<Invoice, 'id'>): Promise<Invoice> {
  const invoice = await apiFetch<Invoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  });
  return mapInvoice(invoice);
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: Invoice['status'],
): Promise<void> {
  await apiFetch(`/invoices/${invoiceId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateInvoice(invoiceId: string, data: Partial<Invoice>): Promise<Invoice> {
  const invoice = await apiFetch<Invoice>(`/invoices/${invoiceId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return mapInvoice(invoice);
}

export interface PaymentInput {
  amount: number;
  method?: string;
  note?: string;
  paidAt?: Date;
}

export interface Payment extends PaymentInput {
  id: string;
  invoiceId: string;
  paidAt: Date;
}

export async function getPayments(invoiceId: string): Promise<Payment[]> {
  const payments = await apiFetch<Payment[]>(`/invoices/${invoiceId}/payments`);
  return payments.map((p) => ({ ...p, paidAt: toDate(p.paidAt) || new Date() }));
}

export async function createPayment(invoiceId: string, data: PaymentInput): Promise<Payment> {
  const payment = await apiFetch<Payment>(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return { ...payment, paidAt: toDate(payment.paidAt) || new Date() };
}
