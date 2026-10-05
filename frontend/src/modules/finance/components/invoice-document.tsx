'use client';

import type { Company } from '@/modules/companies/types';
import type { Client, Invoice, InvoiceTemplate } from '../types';
import { DocRenderer } from '../doc/doc-renderer';
import { templateToDoc } from '../doc/template-to-doc';
import { isInvoiceDoc } from '../doc/validation';

interface InvoiceDocumentProps {
  invoice: Invoice;
  client?: Client;
  company?: Company | null;
  template?: InvoiceTemplate;
  /** Where the QR code points; the public invoice page when omitted. */
  publicUrl?: string;
}

/**
 * Single invoice renderer. Every invoice is drawn by the document engine
 * (DocRenderer): a template that carries a hand-built visual `doc` renders it
 * directly, and any other template is converted from its settings on the fly.
 * One engine means the on-screen preview, the print page, and the server-side
 * PDF are always pixel-identical.
 */
export function InvoiceDocument({ invoice, client, company, template, publicUrl }: InvoiceDocumentProps) {
  const custom = template?.doc;
  const doc = isInvoiceDoc(custom) ? custom : templateToDoc(template);
  return (
    <DocRenderer doc={doc} invoice={invoice} client={client} company={company} template={template} publicUrl={publicUrl} />
  );
}
