import type { DataStore } from '../data/store';
import type { VatBreakdown } from '../types';

/**
 * VAT on documents. Each invoice line has a treatment: standard-rated lines
 * carry the invoice's VAT rate; zero-rated, exempt and out-of-scope lines carry
 * none, and are told apart only for the VAT return. A line without one is
 * standard, which is how every invoice was taxed before treatments existed.
 * This is the one place the rule lives: the document total, the ledger posting
 * and the return all use it.
 */
export type VatTreatment = 'standard' | 'zero' | 'exempt' | 'out_of_scope';
export const VAT_TREATMENTS: VatTreatment[] = ['standard', 'zero', 'exempt', 'out_of_scope'];

export const treatmentOf = (line: { vatTreatment?: VatTreatment | null }): VatTreatment =>
  line.vatTreatment && VAT_TREATMENTS.includes(line.vatTreatment) ? line.vatTreatment : 'standard';

const r2 = (n: number) => Number(n.toFixed(2));

export interface InvoiceVat {
  net: number;
  tax: number;
  gross: number;
  /** Net amount per treatment. */
  byTreatment: Record<VatTreatment, number>;
}

export function invoiceVat(lines: Array<{ amount: number; vatTreatment?: VatTreatment | null }>, taxRate?: number): InvoiceVat {
  const rate = Number(taxRate) > 0 ? Number(taxRate) : 0;
  const byTreatment: Record<VatTreatment, number> = { standard: 0, zero: 0, exempt: 0, out_of_scope: 0 };
  for (const line of lines) byTreatment[treatmentOf(line)] += Number(line.amount) || 0;
  (Object.keys(byTreatment) as VatTreatment[]).forEach((k) => { byTreatment[k] = r2(byTreatment[k]); });
  const net = r2(Object.values(byTreatment).reduce((a, b) => a + b, 0));
  const tax = r2(byTreatment.standard * (rate / 100));
  return { net, tax, gross: r2(net + tax), byTreatment };
}


const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/**
 * What the period's documents say about VAT: invoices issued in the period
 * (less credit notes), by treatment, and approved bills. Amounts are in the
 * company currency. The gaps against the ledger show VAT that was posted some
 * other way, which a return should be checked for before filing.
 */
export function vatBreakdown(store: DataStore, companyId: string, from: Date, to: Date, ledger: { outputVat: number; inputVat: number }): VatBreakdown {
  const start = day(from);
  const end = day(to);
  const inPeriod = (d: Date | string) => { const x = day(d); return x >= start && x <= end; };
  const sales: Record<VatTreatment, number> = { standard: 0, zero: 0, exempt: 0, out_of_scope: 0 };
  let salesVat = 0;

  const invoices = new Map(store.listInvoices(companyId).map((i) => [i.id, i]));
  for (const invoice of invoices.values()) {
    if (invoice.status === 'Draft' || !inPeriod(invoice.issueDate)) continue;
    const rate = invoice.exchangeRate || 1;
    const vat = invoiceVat(invoice.lineItems || [], invoice.taxRate);
    (Object.keys(sales) as VatTreatment[]).forEach((k) => { sales[k] += vat.byTreatment[k] * rate; });
    salesVat += vat.tax * rate;
  }
  for (const note of store.listCreditNotes(companyId)) {
    if (note.status !== 'Issued' || !inPeriod(note.issueDate)) continue;
    const invoice = note.invoiceId ? invoices.get(note.invoiceId) : undefined;
    const rate = invoice?.exchangeRate || 1;
    if (!invoice) { sales.standard -= note.total; continue; }
    const vat = invoiceVat(invoice.lineItems || [], invoice.taxRate);
    if (!(vat.gross > 0)) continue;
    const net = note.total * (vat.net / vat.gross);
    (Object.keys(sales) as VatTreatment[]).forEach((k) => { sales[k] -= (vat.net > 0 ? net * (vat.byTreatment[k] / vat.net) : 0) * rate; });
    salesVat -= (note.total - net) * rate;
  }

  const purchases: Record<VatTreatment | 'unstated', number> = { standard: 0, zero: 0, exempt: 0, out_of_scope: 0, unstated: 0 };
  let purchasesVat = 0;
  for (const bill of store.listVendorBills(companyId)) {
    if (bill.status === 'Draft' || !inPeriod(bill.issueDate)) continue;
    const rate = Number(bill.taxRate) > 0 ? Number(bill.taxRate) : 0;
    const net = bill.amount / (1 + rate / 100);
    const bucket = bill.vatTreatment ?? (rate > 0 ? 'standard' : 'unstated');
    purchases[bucket] += net;
    if (bucket === 'standard') purchasesVat += bill.amount - net;
  }

  (Object.keys(sales) as VatTreatment[]).forEach((k) => { sales[k] = r2(sales[k]); });
  (Object.keys(purchases) as Array<VatTreatment | 'unstated'>).forEach((k) => { purchases[k] = r2(purchases[k]); });
  return {
    sales, salesVat: r2(salesVat), purchases, purchasesVat: r2(purchasesVat),
    outputVatGap: r2(ledger.outputVat - salesVat), inputVatGap: r2(ledger.inputVat - purchasesVat),
  };
}
