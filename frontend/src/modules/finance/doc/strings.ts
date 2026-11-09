import { getCurrentLocale } from '@/lib/locale';

/**
 * Localized labels for the invoice document. The document is rendered in the
 * active app language (and mirrored for RTL) so the printed/PDF/public invoice
 * matches the rest of the product instead of being English-only.
 */
export interface DocStrings {
  invoice: string;
  billTo: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  terms: string;
  notes: string;
  subtotal: string;
  beforeDiscount: string;
  discount: string;
  afterDiscount: string;
  tax: string;
  total: string;
  payment: string;
  accountHolder: string;
  accountNo: string;
  iban: string;
  swift: string;
  signature: string;
  scan: string;
  deliveryNote: string;
  vatZero: string;
  vatExempt: string;
  vatOutOfScope: string;
  vendorBill: string;
  billedBy: string;
  sku: string;
  description: string;
  quantity: string;
  quotation: string;
  quoteFor: string;
  validUntil: string;
  statement: string;
  qty: string;
  unit: string;
  amount: string;
}

const EN: DocStrings = {
  invoice: 'INVOICE',
  billTo: 'Bill To',
  issueDate: 'Issue date',
  dueDate: 'Due date',
  currency: 'Currency',
  terms: 'Terms',
  notes: 'Notes',
  subtotal: 'Subtotal',
  beforeDiscount: 'Total before discount',
  discount: 'Discount',
  afterDiscount: 'Total after discount',
  tax: 'Tax',
  total: 'Total',
  payment: 'Payment',
  accountHolder: 'Account holder',
  accountNo: 'Account no.',
  iban: 'IBAN',
  swift: 'SWIFT/BIC',
  signature: 'Authorized signature',
  scan: 'Scan to view & download',
  deliveryNote: 'Delivery Note',
  vatZero: 'zero-rated',
  vatExempt: 'VAT exempt',
  vatOutOfScope: 'outside the scope of VAT',
  vendorBill: 'VENDOR BILL',
  billedBy: 'Billed By',
  sku: 'SKU',
  description: 'Description',
  quantity: 'Quantity',
  quotation: 'QUOTATION',
  quoteFor: 'Prepared for',
  validUntil: 'Valid until',
  statement: 'ACCOUNT STATEMENT',
  qty: 'Qty',
  unit: 'Unit',
  amount: 'Amount',
};

const AR: DocStrings = {
  invoice: 'فاتورة',
  billTo: 'فاتورة إلى',
  issueDate: 'تاريخ الإصدار',
  dueDate: 'تاريخ الاستحقاق',
  currency: 'العملة',
  terms: 'الشروط والأحكام',
  notes: 'ملاحظات',
  subtotal: 'المجموع الفرعي',
  beforeDiscount: 'الإجمالي قبل الخصم',
  discount: 'الخصم',
  afterDiscount: 'الإجمالي بعد الخصم',
  tax: 'الضريبة',
  total: 'الإجمالي',
  payment: 'الدفع',
  accountHolder: 'صاحب الحساب',
  accountNo: 'رقم الحساب',
  iban: 'الآيبان',
  swift: 'سويفت/BIC',
  signature: 'التوقيع المعتمد',
  scan: 'امسح للعرض والتحميل',
  deliveryNote: 'إشعار تسليم',
  vatZero: 'خاضع لنسبة صفرية',
  vatExempt: 'معفى من الضريبة',
  vatOutOfScope: 'خارج نطاق الضريبة',
  vendorBill: 'فاتورة مورّد',
  billedBy: 'الفاتورة من',
  sku: 'الرمز',
  description: 'الوصف',
  quantity: 'الكمية',
  quotation: 'عرض سعر',
  quoteFor: 'مُعدّ لـ',
  validUntil: 'صالح حتى',
  statement: 'كشف حساب',
  qty: 'الكمية',
  unit: 'سعر الوحدة',
  amount: 'المبلغ',
};

export function isRtlLocale(locale: string = getCurrentLocale()): boolean {
  return locale.toLowerCase().startsWith('ar');
}

const LABEL_KEYS: Map<string, keyof DocStrings> = (() => {
  const map = new Map<string, keyof DocStrings>();
  // A word both languages share (الكمية) keeps the first key it was found under.
  for (const dict of [EN, AR]) {
    for (const key of Object.keys(dict) as (keyof DocStrings)[]) {
      const norm = normalizeLabel(dict[key]);
      if (norm && !map.has(norm)) map.set(norm, key);
    }
  }
  // Common variants people type in the designer.
  map.set('bill to', 'billTo');
  map.set('quote', 'quotation');
  map.set('unit price', 'unit');
  map.set('price', 'unit');
  map.set('total amount', 'total');
  return map;
})();

function normalizeLabel(text: string): string {
  return text.trim().replace(/[:：]\s*$/, '').replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The sentences the system's own starter templates (Classic, Modern, Compact)
 * fill in, and their Arabic. A company that never changed them gets them in the
 * document's language; anything it rewrote is its own text and stays as written.
 */
const DEFAULT_SENTENCES: Array<[string, string]> = [
  ['Payment is due within 30 days.', 'يُستحق الدفع خلال 30 يومًا.'],
  ['Thank you for your business.', 'شكرًا لتعاملكم معنا.'],
  ['Please include the invoice number with your payment.', 'يرجى ذكر رقم الفاتورة عند الدفع.'],
  ['Payment terms are shown on the invoice.', 'شروط الدفع موضحة في الفاتورة.'],
  ['We appreciate your business.', 'نقدّر تعاملكم معنا.'],
  ['Payment due on receipt unless otherwise agreed.', 'يُستحق الدفع عند الاستلام ما لم يُتفق على غير ذلك.'],
  ['All amounts are shown in the invoice currency.', 'جميع المبالغ معروضة بعملة الفاتورة.'],
];
const SENTENCES = new Map<string, [string, string]>();
for (const pair of DEFAULT_SENTENCES) {
  SENTENCES.set(normalizeLabel(pair[0]), pair);
  SENTENCES.set(normalizeLabel(pair[1]), pair);
}

/** A document status in the document's language (Draft → مسودة). */
const STATUS_AR: Record<string, string> = {
  draft: 'مسودة', sent: 'مُرسل', paid: 'مدفوعة', overdue: 'متأخرة', accepted: 'مقبول',
  declined: 'مرفوض', expired: 'منتهي الصلاحية', cancelled: 'ملغي', pending: 'قيد الانتظار',
  shipped: 'تم الشحن', delivered: 'تم التسليم', partial: 'جزئي', confirmed: 'مؤكد',
};
export function localizeStatus(status: string, locale: string = getCurrentLocale()): string {
  if (!status || !isRtlLocale(locale)) return status;
  return STATUS_AR[status.trim().toLowerCase()] ?? status;
}

/**
 * A label typed into a template ("Bill To", "Due date", "الإجمالي") is shown in
 * the document's language, and a quotation says "Prepared for" / "Valid until"
 * where an invoice template says "Bill To" / "Due date". Anything that is not
 * one of the standard labels is returned exactly as written.
 */
export function localizeLabel(text: string, s: DocStrings, opts: { quote?: boolean } = {}): string {
  if (!text || text.includes('{{')) return text;
  const sentence = SENTENCES.get(normalizeLabel(text));
  if (sentence) return s === AR ? sentence[1] : sentence[0];
  let key = LABEL_KEYS.get(normalizeLabel(text));
  if (!key) return text;
  if (opts.quote) {
    if (key === 'billTo') key = 'quoteFor';
    else if (key === 'dueDate') key = 'validUntil';
    else if (key === 'invoice') key = 'quotation';
  }
  const value = s[key];
  // Keep the writer's capitalisation style for headings typed in capitals.
  return text === text.toUpperCase() && /[a-z]/i.test(text) ? value.toUpperCase() : value;
}

export function docStrings(locale: string = getCurrentLocale()): DocStrings {
  return isRtlLocale(locale) ? AR : EN;
}
