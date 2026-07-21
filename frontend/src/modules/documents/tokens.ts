// Merge-field resolution for documents. Builds a flat token map from the
// bound record + company + manual field values, and substitutes {{token}}.

import type { DocumentDataSource } from './types';

export interface TokenGroup {
  group: string;
  source: DocumentDataSource | 'company' | 'manual' | 'general';
  tokens: { token: string; label: string }[];
}

/** Field catalog per data source — drives the "Insert field" menu. */
export const SOURCE_TOKENS: Record<DocumentDataSource, { token: string; label: string }[]> = {
  none: [],
  client: [
    { token: 'client.name', label: 'Client name' },
    { token: 'client.email', label: 'Client email' },
    { token: 'client.phone', label: 'Client phone' },
    { token: 'client.address', label: 'Client address' },
    { token: 'client.vatNumber', label: 'Client VAT number' },
  ],
  invoice: [
    { token: 'invoice.number', label: 'Invoice number' },
    { token: 'invoice.total', label: 'Invoice total' },
    { token: 'invoice.outstanding', label: 'Outstanding amount' },
    { token: 'invoice.issueDate', label: 'Issue date' },
    { token: 'invoice.dueDate', label: 'Due date' },
    { token: 'invoice.status', label: 'Status' },
  ],
  contact: [
    { token: 'contact.name', label: 'Contact name' },
    { token: 'contact.email', label: 'Contact email' },
    { token: 'contact.phone', label: 'Contact phone' },
    { token: 'contact.company', label: 'Contact company' },
    { token: 'contact.role', label: 'Contact role' },
  ],
  delivery_note: [
    { token: 'deliveryNote.number', label: 'Delivery note number' },
    { token: 'deliveryNote.date', label: 'Delivery date' },
    { token: 'deliveryNote.reference', label: 'Reference' },
  ],
  opportunity: [
    { token: 'opportunity.title', label: 'Opportunity title' },
    { token: 'opportunity.value', label: 'Value' },
    { token: 'opportunity.stage', label: 'Stage' },
  ],
  sales_order: [
    { token: 'salesOrder.number', label: 'Order number' },
    { token: 'salesOrder.total', label: 'Order total' },
    { token: 'salesOrder.date', label: 'Order date' },
  ],
};

export const COMPANY_TOKENS = [
  { token: 'company.name', label: 'Company name' },
  { token: 'company.address', label: 'Company address' },
  { token: 'company.email', label: 'Company email' },
  { token: 'company.phone', label: 'Company phone' },
  { token: 'company.vatNumber', label: 'Company VAT number' },
];

export const GENERAL_TOKENS = [
  { token: 'today', label: "Today's date" },
];

export type TokenContext = Record<string, string>;

/** Replace {{ token }} occurrences using the flat context map. Unknown → ''. */
export function resolveTokens(text: string, ctx: TokenContext): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const val = ctx[key];
    return val === undefined || val === null ? '' : String(val);
  });
}
