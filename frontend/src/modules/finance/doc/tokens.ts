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
  /** Values typed when a document was created, keyed `field.<name>` (and `document.notes`). */
  fields?: Record<string, string>;
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

export const GENERIC_TOKEN_GROUPS: typeof TOKEN_GROUPS = [
  {
    group: 'Document',
    tokens: [
      { token: 'document.number', label: 'Document number' },
      { token: 'document.date', label: 'Document date' },
      { token: 'document.status', label: 'Status' },
      { token: 'document.notes', label: 'Notes' },
    ],
  },
  ...TOKEN_GROUPS.filter((group) => group.group !== 'Invoice'),
  {
    // Any {{field.<name>}} in a template becomes a box to fill in when a
    // document is created from it. These are common ones; the designer can
    // type any other name the same way.
    group: 'Filled in per document',
    tokens: [
      { token: 'field.recipient', label: 'Recipient' },
      { token: 'field.subject', label: 'Subject' },
      { token: 'field.reference', label: 'Reference' },
      { token: 'field.date', label: 'Date' },
      { token: 'field.amount', label: 'Amount' },
      { token: 'field.body', label: 'Body text' },
    ],
  },
];

const FIELD_TOKEN = /\{\{\s*(field\.[\w.]+)\s*\}\}/g;

/** The fill-in fields a template asks for, in the order they first appear. */
export function templateFields(doc: unknown): string[] {
  const seen = new Set<string>();
  const text = JSON.stringify(doc ?? '');
  for (const match of text.matchAll(FIELD_TOKEN)) seen.add(match[1]);
  return [...seen];
}

/** "field.contract_start" → "Contract start". */
export function fieldLabel(token: string): string {
  const name = token.replace(/^field\./, '').replace(/[._]+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : token;
}

export function resolveToken(token: string, ctx: DocDataContext): string {
  const { invoice, client, company } = ctx;
  switch (token.trim()) {
    case 'document.number':
    case 'invoice.number': return invoice.invoiceNumber || '';
    case 'document.status':
    case 'invoice.status': return invoice.status || '';
    case 'document.date':
    case 'invoice.issueDate': return fmtDate(invoice.issueDate);
    case 'invoice.dueDate': return fmtDate(invoice.dueDate);
    case 'invoice.currency': return invoice.currency || 'USD';
    case 'invoice.subtotal': return ctx.formatMoney(ctx.subtotal);
    case 'invoice.tax': return ctx.formatMoney(ctx.taxAmount);
    case 'invoice.total': return ctx.formatMoney(ctx.total);
    case 'document.notes':
    case 'invoice.notes':
      // Notes may themselves use variables ("Dear {{field.recipient}}"); one
      // pass only, so a note can never expand itself.
      return (invoice.notes || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, inner) =>
        /^(document|invoice)\.notes$/.test(String(inner)) ? '' : resolveToken(String(inner), ctx));
    case 'client.name': return client?.name || '';
    case 'client.address': return client?.address || '';
    case 'client.email': return client?.email || '';
    case 'company.name': return company?.name || '';
    case 'company.address': return company?.address || '';
    case 'company.phone': return company?.phone || '';
    case 'company.email': return company?.email || '';
    case 'today': return fmtDate(new Date());
    default:
      return token.trim().startsWith('field.') ? ctx.fields?.[token.trim()] ?? '' : '';
  }
}

/** Replaces every {{token}} in a string with its resolved value. */
export function resolveTokens(text: string, ctx: DocDataContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, token) => resolveToken(String(token), ctx));
}
