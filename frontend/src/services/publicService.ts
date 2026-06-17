import type { Invoice, InvoiceTemplate, Client } from '@/modules/finance/types';
import type { Company } from '@/modules/companies/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

const toDate = (v: any) => (v ? new Date(v) : undefined);

export interface PublicInvoicePayload {
  invoice: Invoice;
  template?: InvoiceTemplate;
  company?: Company;
  client?: Client;
}

/** Origin used to build the public invoice URL encoded in the QR code. */
export function publicAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function publicInvoiceUrl(invoiceId: string): string {
  return `${publicAppOrigin()}/invoice/${invoiceId}`;
}

export function publicDeliveryUrl(deliveryId: string): string {
  return `${publicAppOrigin()}/delivery/${deliveryId}`;
}

/**
 * Fetches a delivery note and maps it into the invoice-shaped payload the
 * shared document engine renders. Delivery lines carry quantities only, so
 * unit price/amount are zero — delivery templates hide the money columns.
 */
export async function getPublicDelivery(id: string): Promise<PublicInvoicePayload & { deliveryNumber: string }> {
  const res = await fetch(`${API_BASE}/public/deliveries/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Delivery not found.' : 'Could not load delivery.');
  }
  const data = await res.json();
  const d = data.delivery;
  const so = data.salesOrder;
  const notes = [
    d.notes,
    so ? `Sales order: ${so.orderNumber}` : '',
    d.carrier ? `Carrier: ${d.carrier}` : '',
    d.trackingNumber ? `Tracking: ${d.trackingNumber}` : '',
  ].filter(Boolean).join('  ·  ');
  const invoice = {
    id: d.id,
    invoiceNumber: d.deliveryNumber,
    companyId: d.companyId,
    clientId: data.client?.id || so?.clientId || '',
    issueDate: toDate(d.createdAt) || new Date(),
    dueDate: toDate(d.scheduledFor) || toDate(d.createdAt) || new Date(),
    status: d.status || 'Pending',
    lineItems: (d.items || []).map((it: any) => ({
      itemType: 'Manual' as const,
      sku: it.sku,
      description: it.description,
      quantity: it.quantity,
      unitPrice: 0,
      amount: 0,
    })),
    total: 0,
    notes,
  } as unknown as Invoice;
  const template: InvoiceTemplate | undefined = data.template
    ? { ...data.template, createdAt: toDate(data.template.createdAt) || new Date(), updatedAt: toDate(data.template.updatedAt) || new Date() }
    : undefined;
  return { invoice, template, company: data.company, client: data.client, deliveryNumber: d.deliveryNumber };
}

/** Fetches the public, read-only invoice payload (no authentication). */
export async function getPublicInvoice(id: string): Promise<PublicInvoicePayload> {
  const res = await fetch(`${API_BASE}/public/invoices/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Invoice not found.' : 'Could not load invoice.');
  }
  const data = await res.json();
  const invoice: Invoice = {
    ...data.invoice,
    issueDate: toDate(data.invoice.issueDate) || new Date(),
    dueDate: toDate(data.invoice.dueDate) || new Date(),
    sentAt: toDate(data.invoice.sentAt),
    paidAt: toDate(data.invoice.paidAt),
  };
  const template: InvoiceTemplate | undefined = data.template
    ? { ...data.template, createdAt: toDate(data.template.createdAt) || new Date(), updatedAt: toDate(data.template.updatedAt) || new Date() }
    : undefined;
  return { invoice, template, company: data.company, client: data.client };
}
