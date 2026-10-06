/**
 * Mirrors backend/src/finance/vat.ts: only standard-rated lines carry the
 * invoice's VAT rate. A line without a treatment is standard.
 */
export type VatTreatment = 'standard' | 'zero' | 'exempt' | 'out_of_scope';
export const VAT_TREATMENTS: VatTreatment[] = ['standard', 'zero', 'exempt', 'out_of_scope'];

const r2 = (n: number) => Number(n.toFixed(2));

export function invoiceVat(lines: Array<{ amount: number; vatTreatment?: VatTreatment }>, taxRate?: number) {
  const rate = Number(taxRate) > 0 ? Number(taxRate) : 0;
  const net = r2(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
  const standard = r2(lines.filter((l) => !l.vatTreatment || l.vatTreatment === 'standard').reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
  const tax = r2(standard * (rate / 100));
  return { net, standard, tax, gross: r2(net + tax) };
}

export const vatTreatmentLabel = (t: VatTreatment, tr: (en: string, ar: string) => string) => ({
  standard: tr('Standard', 'قياسي'),
  zero: tr('Zero-rated', 'نسبة صفرية'),
  exempt: tr('Exempt', 'معفى'),
  out_of_scope: tr('Out of scope', 'خارج النطاق'),
}[t]);
