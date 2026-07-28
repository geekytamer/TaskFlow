import type { TemplateDocumentType } from '@/modules/finance/types';

export const DOCUMENT_TEMPLATE_TYPES: Array<{
  value: TemplateDocumentType;
  label: string;
  labelAr: string;
}> = [
  { value: 'invoice', label: 'Invoice', labelAr: 'فاتورة' },
  { value: 'delivery', label: 'Delivery note', labelAr: 'إشعار تسليم' },
  { value: 'quote', label: 'Quotation', labelAr: 'عرض سعر' },
  { value: 'letter', label: 'Business letter', labelAr: 'خطاب عمل' },
  { value: 'memo', label: 'Internal memo', labelAr: 'مذكرة داخلية' },
  { value: 'certificate', label: 'Certificate', labelAr: 'شهادة' },
  { value: 'statement', label: 'Account statement', labelAr: 'كشف حساب' },
  { value: 'custom', label: 'Custom document', labelAr: 'مستند مخصص' },
];

const FINANCIAL_DOCUMENT_TYPES = new Set<TemplateDocumentType>([
  'invoice',
  'quote',
  'statement',
]);

export function isFinancialDocumentType(type: TemplateDocumentType): boolean {
  return FINANCIAL_DOCUMENT_TYPES.has(type);
}

export function getDocumentTemplateType(type: TemplateDocumentType) {
  return DOCUMENT_TEMPLATE_TYPES.find((item) => item.value === type)
    ?? DOCUMENT_TEMPLATE_TYPES[0];
}
