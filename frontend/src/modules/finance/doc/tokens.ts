import type { Company } from '@/modules/companies/types';
import type { Client, Invoice } from '../types';
import { getCurrentLocale } from '@/lib/locale';
import { localizeStatus } from './strings';
import { displayName } from '@/lib/display-name';
import type { RichNode } from './types';

/** Record data beyond the invoice shape, keyed by final token name (spec 2026-11-19 §4.3). */
export type DocExtras = Record<string, { type: 'text' | 'date'; value: string }>;

const isArabic = (locale: string) => locale.toLowerCase().startsWith('ar');

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
  /** The document's own language for dates; unset follows the interface. */
  locale?: string;
  /** Quote data and other kind fields, by token name ("contact.name", "fields.validUntil"). */
  extras?: DocExtras;
  /** Text written for this document, by slot. */
  content?: Record<string, RichNode | string>;
}

const fmtDate = (d?: Date, locale?: string) =>
  d
    ? new Date(d).toLocaleDateString(locale || getCurrentLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
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

const AR_TOKEN_LABELS: Record<string, string> = {
  Document: 'المستند', Client: 'العميل', Company: 'الشركة', 'Filled in per document': 'يُملأ لكل مستند',
  'Document number': 'رقم المستند', 'Document date': 'تاريخ المستند', Status: 'الحالة', Notes: 'الملاحظات',
  'Client name': 'اسم العميل', 'Client address': 'عنوان العميل', 'Client email': 'بريد العميل',
  'Company name': 'اسم الشركة', 'Company address': 'عنوان الشركة',
  Recipient: 'المستلم', Subject: 'الموضوع', Reference: 'المرجع', Date: 'التاريخ', Amount: 'المبلغ', 'Body text': 'نص المستند',
  Quotation: 'عرض السعر', 'Valid until': 'صالح حتى', Salesperson: 'مسؤول المبيعات', 'Salesperson email': 'بريد مسؤول المبيعات',
  'Contact person': 'الشخص المسؤول', 'Contact phone': 'هاتف المسؤول', 'Client phone': 'هاتف العميل',
  'Client tax number': 'الرقم الضريبي للعميل', 'Total discount': 'إجمالي الخصم', 'Optional extras total': 'إجمالي الإضافات الاختيارية',
};

/** Quote data in the designer's picker (quote templates only). */
export const QUOTE_TOKEN_GROUP: (typeof TOKEN_GROUPS)[number] = {
  group: 'Quotation',
  tokens: [
    { token: 'fields.validUntil', label: 'Valid until' },
    { token: 'owner.name', label: 'Salesperson' },
    { token: 'owner.email', label: 'Salesperson email' },
    { token: 'contact.name', label: 'Contact person' },
    { token: 'contact.phone', label: 'Contact phone' },
    { token: 'to.phone', label: 'Client phone' },
    { token: 'to.taxId', label: 'Client tax number' },
    { token: 'doc.discount', label: 'Total discount' },
    { token: 'doc.optionalTotal', label: 'Optional extras total' },
  ],
};
export const quoteTokenGroups = (base: typeof TOKEN_GROUPS): typeof TOKEN_GROUPS => [...base, QUOTE_TOKEN_GROUP];

/** Token groups with their labels in the reader's language. */
export function localizedTokenGroups(groups: typeof TOKEN_GROUPS, language: string): typeof TOKEN_GROUPS {
  const tr = (label: string) => (language === 'ar' ? AR_TOKEN_LABELS[label] ?? label : label);
  return groups.map((group) => ({ group: tr(group.group), tokens: group.tokens.map((t) => ({ ...t, label: tr(t.label) })) }));
}

/**
 * What a fill-in field shows when it was never filled in. Certificates made
 * before fill-in fields existed printed the client's name and a fixed line;
 * they keep doing so.
 */
const FIELD_FALLBACKS: Record<string, (ctx: DocDataContext) => string> = {
  'field.recipient': (ctx) => ctx.client?.name || '',
  'field.achievement': () => 'For outstanding achievement and completion.',
};

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
    case 'invoice.status': return localizeStatus(invoice.status || '', ctx.locale);
    case 'document.date':
    case 'invoice.issueDate': return fmtDate(invoice.issueDate, ctx.locale);
    case 'invoice.dueDate': return fmtDate(invoice.dueDate, ctx.locale);
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
    // A two-language client prints in the document's language (spec 2026-11-10).
    case 'client.name': return client ? displayName(client, isArabic(ctx.locale ?? getCurrentLocale()) ? 'ar' : 'en') : '';
    case 'client.address': return client?.address || '';
    case 'client.email': return client?.email || '';
    case 'company.name': return company?.name || '';
    case 'company.address': return company?.address || '';
    case 'company.phone': return company?.phone || '';
    case 'company.email': return company?.email || '';
    case 'today': return fmtDate(new Date(), ctx.locale);
    case 'doc.number': return invoice.invoiceNumber || '';
    case 'doc.date': return fmtDate(invoice.issueDate, ctx.locale);
    case 'doc.status': return localizeStatus(invoice.status || '', ctx.locale);
    case 'doc.currency': return invoice.currency || 'USD';
    case 'doc.total': return ctx.formatMoney(ctx.total);
    case 'to.name': return resolveToken('client.name', ctx);
    case 'to.address': return client?.address || '';
    case 'to.email': return client?.email || '';
    case 'from.name': return company?.name || '';
    case 'from.address': return company?.address || '';
    default: {
      const key = token.trim();
      const extra = ctx.extras?.[key];
      if (extra) return extra.type === 'date' ? fmtDate(new Date(extra.value), ctx.locale) : extra.value;
      if (!key.startsWith('field.')) return '';
      return ctx.fields?.[key] || FIELD_FALLBACKS[key]?.(ctx) || '';
    }
  }
}

/** Replaces every {{token}} in a string with its resolved value. */
export function resolveTokens(text: string, ctx: DocDataContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, token) => resolveToken(String(token), ctx));
}
