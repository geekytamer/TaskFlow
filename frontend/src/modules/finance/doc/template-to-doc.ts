import type { InvoiceTemplate, InvoiceSectionKey } from '../types';
import type { Block, InvoiceDoc } from './types';
import { docStrings } from './strings';

let n = 0;
const id = (p: string) => `${p}-${n++}`;

/**
 * Produces a default document from a legacy InvoiceTemplate so existing
 * templates render through the new engine without a hand-built layout. Once a
 * template has its own saved `doc`, that takes precedence.
 */
export function templateToDoc(template?: InvoiceTemplate): InvoiceDoc {
  n = 0;
  const s = docStrings();
  const primary = template?.primaryColor || '#111827';
  const accent = template?.accentColor || '#2563eb';
  const breaks = new Set<InvoiceSectionKey>(template?.sectionBreaks ?? []);
  const pageBreak = (): Block => ({ id: id('pb'), type: 'pageBreak' });

  const body: Block[] = [];

  // Full-bleed header image (renders only when the template has one).
  body.push({ id: id('headerImg'), type: 'image', binding: 'header', fit: 'cover', style: { width: '100%', fullBleed: true, margin: { bottom: 16 } } });

  // Header: logo + company name on the left, INVOICE + number on the right.
  body.push({
    id: id('header'),
    type: 'container',
    layout: 'row',
    style: { margin: { bottom: 24 } },
    children: [
      {
        id: id('hl'),
        type: 'container',
        layout: 'stack',
        children: [
          { id: id('logo'), type: 'image', binding: 'logo', height: 56, visibleWhen: 'hasLogo', style: { margin: { bottom: 12 } } },
          { id: id('cn'), type: 'text', content: '{{company.name}}', style: { fontWeight: 600, color: primary, fontSize: 16 } },
          ...(template?.showCompanyAddress ? [{ id: id('ca'), type: 'text', content: '{{company.address}}', style: { fontSize: 13, color: '#64748b', margin: { top: 4 } } } as Block] : []),
        ],
      },
      {
        id: id('hr'),
        type: 'container',
        layout: 'stack',
        style: { align: 'right' },
        children: [
          { id: id('inv'), type: 'heading', level: 1, content: s.invoice, style: { align: 'right', color: primary } },
          { id: id('num'), type: 'text', content: '{{invoice.number}}', style: { align: 'right', fontSize: 13, color: '#64748b', margin: { top: 8 } } },
          { id: id('st'), type: 'text', content: '{{invoice.status}}', style: { align: 'right', fontSize: 13, color: '#64748b' } },
        ],
      },
    ],
  });

  // Bill-to + dates
  if (breaks.has('billing')) body.push(pageBreak());
  body.push({
    id: id('billing'),
    type: 'container',
    layout: 'row',
    style: { margin: { top: 16, bottom: 8 } },
    children: [
      { id: id('billto'), type: 'details', title: s.billTo, fields: [
        { label: '', value: '{{client.name}}' },
        { label: '', value: '{{client.address}}' },
        { label: '', value: '{{client.email}}' },
      ] },
      { id: id('dates'), type: 'details', title: '', style: { align: 'right' }, fields: [
        { label: s.issueDate, value: '{{invoice.issueDate}}' },
        { label: s.dueDate, value: '{{invoice.dueDate}}' },
        { label: s.currency, value: '{{invoice.currency}}' },
      ] },
    ],
  });

  // Line items + totals
  if (breaks.has('items')) body.push(pageBreak());
  body.push({ id: id('items'), type: 'lineItems', style: { margin: { top: 24 } } });
  body.push({ id: id('totals'), type: 'totals', style: { margin: { top: 24 } } });

  // Payment + terms
  if (breaks.has('payment')) body.push(pageBreak());
  body.push({ id: id('payment'), type: 'payment', style: { margin: { top: 32 } } });
  if (breaks.has('terms')) body.push(pageBreak());
  if (template?.terms) {
    body.push({
      id: id('terms'),
      type: 'container',
      layout: 'stack',
      style: { margin: { top: 24 } },
      children: [
        { id: id('tt'), type: 'text', content: s.terms, style: { fontWeight: 600, color: primary } },
        { id: id('tv'), type: 'text', content: template.terms, style: { margin: { top: 8 }, color: '#475569' } },
      ],
    });
  }

  // Notes (conditional)
  if (breaks.has('notes')) body.push(pageBreak());
  body.push({
    id: id('notes'),
    type: 'container',
    layout: 'stack',
    visibleWhen: 'hasNotes',
    style: { margin: { top: 24 }, border: { width: 1, color: '#e5e7eb' }, borderRadius: 6, padding: { top: 16, right: 16, bottom: 16, left: 16 } },
    children: [
      { id: id('nt'), type: 'text', content: s.notes, style: { fontWeight: 600, color: primary } },
      { id: id('nv'), type: 'text', content: '{{invoice.notes}}', style: { margin: { top: 8 } } },
    ],
  });

  // Signature / stamp
  if (breaks.has('signature')) body.push(pageBreak());
  body.push({ id: id('sig'), type: 'signature', style: { margin: { top: 40 } } });

  // QR
  if (template?.qrEnabled !== false) {
    if (breaks.has('qr')) body.push(pageBreak());
    body.push({ id: id('qr'), type: 'qr', style: { margin: { top: 32 }, align: template?.qrPosition ?? 'center' } });
  }

  // Footer note
  body.push({ id: id('foot'), type: 'text', content: template?.footerNote || '', style: { margin: { top: 24 }, align: 'center', fontSize: 12, color: '#64748b', border: { width: 1, color: '#e5e7eb', sides: ['top'] }, padding: { top: 16 } } });

  // Full-bleed footer image (renders only when the template has one).
  body.push({ id: id('footerImg'), type: 'image', binding: 'footer', fit: 'cover', style: { width: '100%', fullBleed: true, margin: { top: 16 } } });

  return {
    version: 1,
    page: { size: 'A4', orientation: 'portrait', margin: { top: 10, right: 10, bottom: 10, left: 10 } },
    theme: { fontFamily: 'inherit', primaryColor: primary, accentColor: accent, textColor: '#0f172a' },
    body,
  };
}
