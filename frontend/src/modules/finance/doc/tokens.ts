import type { Company } from '@/modules/companies/types';
import type { Client, Invoice } from '../types';
import { getCurrentLocale } from '@/lib/locale';

export interface DocDataContext {
  invoice: Invoice;
  client?: Client | null;
  company?: Company | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Formats a numeric amount in the invoice currency. */
  formatMoney: (value: number) => string;
  publicUrl: string;
}

const fmtDate = (d?: Date) =>
  d
    ? new Date(d).toLocaleDateString(getCurrentLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

/** Available binding tokens shown in the editor's data picker. */
export const TOKEN_GROUPS: { group: string; tokens: { token: string; label: string }[] }[] = [
  {
    group: 'Invoice',
    tokens: [
      { token: 'invoice.number', label: 'Invoice number' },
      { token: 'invoice.status', label: 'Status' },
      { token: 'invoice.issueDate', label: 'Issue date' },
      { token: 'invoice.dueDate', label: 'Due date' },
      { token: 'invoice.currency', label: 'Currency' },
      { token: 'invoice.subtotal', label: 'Subtotal' },
      { token: 'invoice.tax', label: 'Tax amount' },
      { token: 'invoice.total', label: 'Total' },
      { token: 'invoice.notes', label: 'Notes' },
    ],
  },
  {
    group: 'Client',
    tokens: [
      { token: 'client.name', label: 'Client name' },
      { token: 'client.address', label: 'Client address' },
      { token: 'client.email', label: 'Client email' },
    ],
  },
  {
    group: 'Company',
    tokens: [
      { token: 'company.name', label: 'Company name' },
      { token: 'company.address', label: 'Company address' },
    ],
  },
];

export function resolveToken(token: string, ctx: DocDataContext): string {
  const { invoice, client, company } = ctx;
  switch (token.trim()) {
    case 'invoice.number': return invoice.invoiceNumber || '';
    case 'invoice.status': return invoice.status || '';
    case 'invoice.issueDate': return fmtDate(invoice.issueDate);
    case 'invoice.dueDate': return fmtDate(invoice.dueDate);
    case 'invoice.currency': return invoice.currency || 'USD';
    case 'invoice.subtotal': return ctx.formatMoney(ctx.subtotal);
    case 'invoice.tax': return ctx.formatMoney(ctx.taxAmount);
    case 'invoice.total': return ctx.formatMoney(ctx.total);
    case 'invoice.notes': return invoice.notes || '';
    case 'client.name': return client?.name || '';
    case 'client.address': return client?.address || '';
    case 'client.email': return client?.email || '';
    case 'company.name': return company?.name || '';
    case 'company.address': return company?.address || '';
    default: return '';
  }
}

/** Replaces every {{token}} in a string with its resolved value. */
export function resolveTokens(text: string, ctx: DocDataContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, token) => resolveToken(String(token), ctx));
}
