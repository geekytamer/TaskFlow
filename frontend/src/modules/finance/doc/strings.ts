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
  sku: string;
  description: string;
  quantity: string;
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
  sku: 'SKU',
  description: 'Description',
  quantity: 'Quantity',
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
  sku: 'الرمز',
  description: 'الوصف',
  quantity: 'الكمية',
};

export function isRtlLocale(locale: string = getCurrentLocale()): boolean {
  return locale.toLowerCase().startsWith('ar');
}

export function docStrings(locale: string = getCurrentLocale()): DocStrings {
  return isRtlLocale(locale) ? AR : EN;
}
