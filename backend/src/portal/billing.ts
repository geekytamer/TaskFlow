import type { DataStore } from '../data/store';
import type { Contact, Invoice, Payment } from '../types';

const iso = (value: Date | string | undefined | null) => (value ? new Date(value).toISOString() : null);
const money = (n: number | undefined) => Number((n ?? 0).toFixed(2));

/** Whether an invoice belongs to this client: by contact, or by the legacy client link. */
export function isClientInvoice(invoice: Invoice, contact: Contact): boolean {
  return invoice.contactId === contact.id
    || invoice.clientId === contact.id
    || (Boolean(contact.clientId) && invoice.clientId === contact.clientId);
}

/** The client's invoices, never drafts. */
export const clientInvoices = (store: DataStore, companyId: string, contact: Contact) =>
  store.listInvoices(companyId)
    .filter((i) => i.status !== 'Draft' && isClientInvoice(i, contact))
    .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

export function clientInvoiceStatus(invoice: Invoice, now = new Date()): 'paid' | 'overdue' | 'partly_paid' | 'due' {
  if ((invoice.outstandingAmount ?? invoice.total) <= 0.004) return 'paid';
  if (new Date(invoice.dueDate).getTime() < now.getTime()) return 'overdue';
  return (invoice.paidAmount ?? 0) > 0 ? 'partly_paid' : 'due';
}

/** Stable without a table: derived from the invoice number and the payment id. */
export const receiptNumber = (invoice: Invoice, payment: Payment) =>
  `R-${invoice.invoiceNumber}-${payment.id.replace(/-/g, '').slice(0, 6)}`;

export function toInvoiceSummary(store: DataStore, invoice: Invoice) {
  const campaign = invoice.campaignId ? store.getCrmCampaignById(invoice.campaignId) : undefined;
  return {
    id: invoice.id,
    number: invoice.invoiceNumber,
    issueDate: iso(invoice.issueDate),
    dueDate: iso(invoice.dueDate),
    status: clientInvoiceStatus(invoice),
    currency: invoice.currency ?? 'USD',
    total: money(invoice.total),
    paid: money(invoice.paidAmount),
    credited: money(invoice.creditedAmount),
    outstanding: money(invoice.outstandingAmount ?? invoice.total),
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
  };
}

/** Allowlisted: line items without task ids or SKUs, payments without staff notes. */
export function toInvoiceDetail(store: DataStore, invoice: Invoice) {
  return {
    ...toInvoiceSummary(store, invoice),
    taxRate: invoice.taxRate ?? 0,
    notes: invoice.notes ?? null,
    lineItems: invoice.lineItems.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount ?? null,
      discountType: l.discountType ?? null,
      amount: l.amount,
    })),
    payments: store.listPayments(invoice.id).map((p) => ({
      id: p.id,
      receiptNumber: receiptNumber(invoice, p),
      paidAt: iso(p.paidAt),
      amount: money(p.amount),
      method: p.method ?? null,
    })),
    creditNotes: store.listCreditNotes(invoice.companyId)
      .filter((n) => n.invoiceId === invoice.id && n.status === 'Issued')
      .map((n) => ({ number: n.creditNoteNumber, issueDate: iso(n.issueDate), total: money(n.total) })),
  };
}

/** The balance left on the invoice after this payment, taking payments in date order. */
export function balanceAfter(store: DataStore, invoice: Invoice, payment: Payment): number {
  let paid = 0;
  for (const p of store.listPayments(invoice.id)) {
    paid += p.amount;
    if (p.id === payment.id) break;
  }
  return money(Math.max(0, invoice.total - (invoice.creditedAmount ?? 0) - paid));
}

export function statementTotals(invoices: ReturnType<typeof toInvoiceSummary>[]) {
  const sum = (key: 'total' | 'paid' | 'credited' | 'outstanding') => money(invoices.reduce((s, i) => s + i[key], 0));
  return { invoiced: sum('total'), paid: sum('paid'), credited: sum('credited'), outstanding: sum('outstanding') };
}
