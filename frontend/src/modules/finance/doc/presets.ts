import type { InvoiceTemplate } from '../types';
import type { Block, InvoiceDoc } from './types';
import { templateToDoc } from './template-to-doc';

/**
 * Starter layouts for the visual designer. Each preset builds a complete,
 * schema-valid InvoiceDoc from the template's current assets/colors, so picking
 * one gives an instant, fully-wired starting point the user can then tweak.
 */
export interface InvoicePreset {
  id: string;
  name: string;
  description: string;
  build: (template?: InvoiceTemplate) => InvoiceDoc;
}

const withTheme = (doc: InvoiceDoc, theme: Partial<InvoiceDoc['theme']>): InvoiceDoc => ({
  ...doc,
  theme: { ...doc.theme, ...theme },
});

/** A sales proposal (quotes only): heading, intro, scope, priced table with sections and extras, terms, acceptance. */
export function proposalDoc(template?: InvoiceTemplate): InvoiceDoc {
  const base = templateToDoc({ ...(template ?? ({} as InvoiceTemplate)), docType: 'quote' });
  const header = base.body.filter((b) => b.type === 'image' || b.type === 'container').slice(0, 1);
  const body: Block[] = [
    ...header,
    { id: 'p-title', type: 'heading', level: 1, content: 'QUOTATION', style: { margin: { top: 12, bottom: 4 } } },
    { id: 'p-meta', type: 'details', fields: [
      { label: 'Quotation no.', value: '{{doc.number}}' },
      { label: 'Issue date', value: '{{doc.date}}' },
      { label: 'Valid until', value: '{{fields.validUntil}}' },
      { label: 'Prepared for', value: '{{to.name}}' },
      { label: 'Attention', value: '{{contact.name}}' },
      { label: 'Prepared by', value: '{{owner.name}}' },
    ], style: { margin: { bottom: 16 } } },
    { id: 'p-intro', type: 'slot', slot: 'intro', fallback: 'Thank you for the opportunity. Please find our offer below.', style: { margin: { bottom: 12 } } },
    { id: 'p-scope', type: 'slot', slot: 'scope', title: 'Scope of work', fallback: '', style: { margin: { bottom: 12 } } },
    { id: 'p-lines', type: 'lineItems', columns: [
      { id: 'c-index', key: 'index', label: '#', visible: true, width: 6, align: 'left' },
      { id: 'c-desc', key: 'description', label: 'Description', visible: true, width: 46, align: 'left' },
      { id: 'c-unit', key: 'unit', label: 'Unit of measure', visible: true, width: 10, align: 'left' },
      { id: 'c-qty', key: 'quantity', label: 'Qty', visible: true, width: 10, align: 'right' },
      { id: 'c-price', key: 'unitPrice', label: 'Unit price', visible: true, width: 14, align: 'right' },
      { id: 'c-amount', key: 'amount', label: 'Amount', visible: true, width: 14, align: 'right' },
    ] },
    { id: 'p-totals', type: 'totals', style: { margin: { top: 12 } } },
    { id: 'p-terms', type: 'slot', slot: 'terms', title: 'Terms', fallback: template?.terms || 'Prices are valid until the date above.', style: { margin: { top: 20 } } },
    { id: 'p-notes', type: 'text', content: '{{invoice.notes}}', visibleWhen: 'hasNotes', style: { margin: { top: 12 } } },
    { id: 'p-accept', type: 'container', layout: 'row', gap: 32, style: { margin: { top: 32 } }, children: [
      { id: 'p-accept-text', type: 'text', content: 'Accepted by: ____________________   Date: ____________' },
      { id: 'p-sign', type: 'signature' },
    ] },
    { id: 'p-qr', type: 'qr', style: { align: 'center', margin: { top: 24 } } },
  ];
  return { ...base, body };
}

export const invoicePresets: InvoicePreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Balanced header, itemized table, payment + signature.',
    build: (template) => templateToDoc(template),
  },
  {
    id: 'modern-band',
    name: 'Modern band',
    description: 'Bold accent bar across the top of the page.',
    build: (template) => {
      const doc = templateToDoc(template);
      const band: Block = {
        id: 'preset-band',
        type: 'shape',
        height: 12,
        style: { background: doc.theme.accentColor, margin: { bottom: 20 } },
      };
      return { ...doc, body: [band, ...doc.body] };
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Lean monochrome layout with the QR code removed.',
    build: (template) => {
      const doc = templateToDoc(template);
      return withTheme(
        { ...doc, body: doc.body.filter((block) => block.type !== 'qr') },
        { primaryColor: '#0f172a', accentColor: '#334155' },
      );
    },
  },
  {
    id: 'letterhead',
    name: 'Letterhead',
    description: 'Leaves blank space at the top for pre-printed letterhead.',
    build: (template) => {
      const doc = templateToDoc(template);
      const spacer: Block = { id: 'preset-letterhead', type: 'spacer', height: 130 };
      return { ...doc, body: [spacer, ...doc.body] };
    },
  },
  { id: 'proposal', name: 'Proposal', description: 'Sales proposal: intro, scope, priced sections, optional extras, terms and acceptance.', build: (template) => proposalDoc(template) },
];
