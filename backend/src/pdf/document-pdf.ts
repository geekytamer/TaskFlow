/**
 * The PDF of a quotation or an invoice: the headless browser prints the same
 * public page a customer opens from the share link, so the file matches print
 * exactly. Shared by the download routes and "send by WhatsApp".
 */

import type { DataStore } from '../data/store';
import type { Invoice, Quotation } from '../types';
import { renderInvoicePdf, type InvoicePdfOptions } from './invoice-pdf';

type Renderer = (opts: InvoicePdfOptions) => Promise<Buffer>;
let render: Renderer = renderInvoicePdf;
/** Tests replace the browser with a fake. */
export function setDocumentPdfRenderer(fn: Renderer | null): void {
  render = fn ?? renderInvoicePdf;
}

export class PdfUnavailableError extends Error {}

const appUrl = () => (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const pageOf = (doc: unknown): { format: 'A4' | 'Letter'; landscape: boolean } => {
  const page = (doc as any)?.doc?.page as { size?: string; orientation?: string } | undefined;
  return { format: page?.size === 'Letter' ? 'Letter' : 'A4', landscape: page?.orientation === 'landscape' };
};
const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, '-');
const cleanLang = (lang: unknown) => (typeof lang === 'string' && /^[a-z-]{2,8}$/i.test(lang) ? lang : '');

async function print(url: string, geometry: { format: 'A4' | 'Letter'; landscape: boolean }): Promise<Buffer> {
  try {
    return await render({ url, ...geometry });
  } catch {
    throw new PdfUnavailableError('PDF rendering is unavailable. Ensure APP_PUBLIC_URL points to the running app and Chromium is installed.');
  }
}

/** The quote's own language wins; `asked` is used only for a quote without one. */
export async function quotationPdf(store: DataStore, quote: Quotation, asked?: unknown): Promise<{ pdf: Buffer; fileName: string; language: string }> {
  const templates = store.listInvoiceTemplates(quote.companyId, 'quote');
  const tpl =
    (quote.templateId ? store.getInvoiceTemplateById(quote.templateId) : undefined)
    || templates.find((t) => t.isDefault)
    || templates[0];
  const lang = quote.language || cleanLang(asked);
  const url = `${appUrl()}/quotation/${quote.id}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
  return { pdf: await print(url, pageOf(tpl)), fileName: `Quotation-${safe(quote.quoteNumber)}.pdf`, language: lang };
}

/** Page geometry follows the frozen template; the caller's language sets the text direction. */
export async function invoicePdf(invoice: Invoice, asked?: unknown): Promise<{ pdf: Buffer; fileName: string; language: string }> {
  const lang = cleanLang(asked);
  const url = `${appUrl()}/invoice/${invoice.id}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
  return { pdf: await print(url, pageOf(invoice.templateSnapshot)), fileName: `Invoice-${safe(invoice.invoiceNumber)}.pdf`, language: lang };
}
