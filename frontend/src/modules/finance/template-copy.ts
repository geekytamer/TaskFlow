import type { InvoiceTemplateInput } from '@/services/financeService';
import { docStrings } from './doc/strings';
import type { InvoiceTemplate, TemplateDocumentType } from './types';

/**
 * Copy a template under a new name, optionally as another kind of document
 * (an invoice's look reused for a quotation). Everything is kept — colours,
 * logo, letterhead, stamp, bank accounts, terms, the visual design — except
 * that the copy is never the default, and a heading that is exactly the old
 * type's word ("INVOICE" / "فاتورة") becomes the new type's.
 */

const MONEY: TemplateDocumentType[] = ['invoice', 'quote', 'bill', 'statement', 'delivery'];
const LETTERS: TemplateDocumentType[] = ['letter', 'memo', 'certificate', 'custom'];

/** The kinds a template of this kind can be copied as (its own first). */
export function copyTargets(type: TemplateDocumentType): TemplateDocumentType[] {
  const family = MONEY.includes(type) ? MONEY : LETTERS;
  return [type, ...family.filter((t) => t !== type)];
}

/** The heading word(s) of a document type, English and Arabic. */
function headingWords(type: TemplateDocumentType): { en?: string; ar?: string } {
  const en = docStrings('en');
  const ar = docStrings('ar');
  switch (type) {
    case 'invoice': return { en: en.invoice, ar: ar.invoice };
    case 'quote': return { en: en.quotation, ar: ar.quotation };
    case 'bill': return { en: en.vendorBill, ar: ar.vendorBill };
    case 'statement': return { en: en.statement, ar: ar.statement };
    case 'delivery': return { en: en.deliveryNote, ar: ar.deliveryNote };
    case 'memo': return { en: 'MEMORANDUM', ar: 'مذكرة داخلية' };
    case 'certificate': return { en: 'CERTIFICATE', ar: 'شهادة' };
    case 'custom': return { en: 'CUSTOM DOCUMENT', ar: 'مستند مخصص' };
    default: return {};
  }
}

function swapHeadings(doc: unknown, from: TemplateDocumentType, to: TemplateDocumentType): unknown {
  if (from === to || !doc || typeof doc !== 'object') return doc;
  const a = headingWords(from);
  const b = headingWords(to);
  const swap = (content: string): string => {
    const t = content.trim();
    if (a.en && b.en && t.toLowerCase() === a.en.toLowerCase()) {
      // Keep the writer's casing style: INVOICE → QUOTATION, Invoice → Quotation.
      return t === t.toUpperCase() ? b.en.toUpperCase() : b.en.charAt(0).toUpperCase() + b.en.slice(1).toLowerCase();
    }
    if (a.ar && b.ar && t === a.ar) return b.ar;
    return content;
  };
  const walk = (blocks: unknown): void => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks as Array<Record<string, unknown>>) {
      if (block?.type === 'heading' && typeof block.content === 'string') block.content = swap(block.content);
      walk(block?.children);
    }
  };
  walk((doc as { body?: unknown }).body);
  return doc;
}

export function copyTemplateInput(
  template: InvoiceTemplate,
  target: { name: string; docType: TemplateDocumentType },
): InvoiceTemplateInput {
  const from = (template.docType ?? 'invoice') as TemplateDocumentType;
  if (!copyTargets(from).includes(target.docType)) {
    throw new Error(`A ${from} template cannot become a ${target.docType} template.`);
  }
  const name = target.name.trim();
  if (!name) throw new Error('Give the copy a name.');
  const { id: _id, companyId: _company, createdAt: _created, updatedAt: _updated, ...rest } = template;
  // Deep copies: editing the copy must never change the original.
  const clone = <T,>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
  return {
    ...rest,
    name,
    docType: target.docType,
    isDefault: false,
    columns: clone(template.columns),
    bankAccounts: clone(template.bankAccounts),
    sectionBreaks: clone(template.sectionBreaks),
    doc: swapHeadings(clone(template.doc), from, target.docType),
  } as InvoiceTemplateInput;
}
