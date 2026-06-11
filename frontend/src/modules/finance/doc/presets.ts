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
];
