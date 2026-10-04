/**
 * Receipts and statements as self-contained HTML for PDF rendering. Everything
 * printed is escaped; there are no scripts, links, images or external styles.
 */

type Lang = 'en' | 'ar';

const LABELS = {
  en: {
    receipt: 'Payment receipt', number: 'Receipt number', date: 'Date', from: 'Received from', amount: 'Amount received',
    method: 'Method', invoice: 'For invoice', invoiceTotal: 'Invoice total', balance: 'Balance remaining',
    statement: 'Campaign statement', campaign: 'Campaign', client: 'Client', generated: 'Generated',
    issued: 'Issued', due: 'Due', total: 'Total', paid: 'Paid', credited: 'Credited', outstanding: 'Outstanding', totals: 'Totals',
    none: 'No invoices yet.',
  },
  ar: {
    receipt: 'إيصال دفع', number: 'رقم الإيصال', date: 'التاريخ', from: 'استُلم من', amount: 'المبلغ المستلم',
    method: 'طريقة الدفع', invoice: 'عن الفاتورة', invoiceTotal: 'إجمالي الفاتورة', balance: 'الرصيد المتبقي',
    statement: 'كشف حساب الحملة', campaign: 'الحملة', client: 'العميل', generated: 'تاريخ الإصدار',
    issued: 'الإصدار', due: 'الاستحقاق', total: 'الإجمالي', paid: 'المدفوع', credited: 'الدائن', outstanding: 'المتبقي', totals: 'المجموع',
    none: 'لا توجد فواتير بعد.',
  },
} as const;

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en');
const fmtMoney = (n: number, currency: string, lang: Lang) =>
  `${escapeHtml(currency)} ${new Intl.NumberFormat(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const fmtDate = (d: Date | string | null, lang: Lang) =>
  d ? new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeZone: process.env.PORTAL_TIME_ZONE ?? 'Asia/Muscat' }).format(new Date(d)) : '-';

const page = (lang: Lang, title: string, body: string) => `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: "Segoe UI", "Noto Sans Arabic", "Geeza Pro", Arial, sans-serif; color: #12151a; font-size: 12px; }
h1 { font-size: 22px; margin: 0 0 4px; } .muted { color: #4f5661; }
table { width: 100%; border-collapse: collapse; margin-top: 18px; }
th, td { text-align: start; padding: 8px 6px; border-bottom: 1px solid #dde0e5; vertical-align: top; }
th { color: #4f5661; font-weight: 600; } .num { text-align: end; white-space: nowrap; }
.head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #12151a; padding-bottom: 12px; }
.big { font-size: 20px; font-weight: 700; } tfoot td { font-weight: 700; border-bottom: 0; }
bdi { unicode-bidi: isolate; }
</style></head><body>${body}</body></html>`;

// Typed by a person, so its direction comes from the text, not the page (principle 14).
const companyBlock = (company: { name: string; address?: string | null }) =>
  `<div><div class="big" dir="auto">${escapeHtml(company.name)}</div>${company.address ? `<div class="muted" dir="auto">${escapeHtml(company.address)}</div>` : ''}</div>`;

export interface ReceiptInput {
  lang: Lang;
  company: { name: string; address?: string | null };
  clientName: string;
  receiptNumber: string;
  paidAt: Date | string;
  amount: number;
  method: string | null;
  currency: string;
  invoiceNumber: string;
  invoiceTotal: number;
  balanceAfter: number;
}

export function receiptHtml(r: ReceiptInput): string {
  const L = LABELS[r.lang];
  // One column of values, all on the same edge, so text and amounts line up.
  const row = (label: string, value: string) => `<tr><th>${label}</th><td class="num">${value}</td></tr>`;
  return page(r.lang, `${L.receipt} ${r.receiptNumber}`, `
<div class="head">${companyBlock(r.company)}<div><h1>${L.receipt}</h1><div class="muted"><bdi>${escapeHtml(r.receiptNumber)}</bdi></div></div></div>
<table>
${row(L.date, `<bdi>${fmtDate(r.paidAt, r.lang)}</bdi>`)}
${row(L.from, `<bdi dir="auto">${escapeHtml(r.clientName)}</bdi>`)}
${row(L.invoice, `<bdi>${escapeHtml(r.invoiceNumber)}</bdi>`)}
${r.method ? row(L.method, `<bdi>${escapeHtml(r.method)}</bdi>`) : ''}
${row(L.amount, `<bdi class="big">${fmtMoney(r.amount, r.currency, r.lang)}</bdi>`)}
${row(L.invoiceTotal, `<bdi>${fmtMoney(r.invoiceTotal, r.currency, r.lang)}</bdi>`)}
${row(L.balance, `<bdi>${fmtMoney(r.balanceAfter, r.currency, r.lang)}</bdi>`)}
</table>`);
}

export interface StatementInput {
  lang: Lang;
  company: { name: string; address?: string | null };
  clientName: string;
  campaignName: string;
  generatedAt: Date;
  invoices: Array<{ number: string; issueDate: string | null; dueDate: string | null; total: number; paid: number; credited: number; outstanding: number; currency: string }>;
  totals: Array<{ currency: string; invoiced: number; paid: number; credited: number; outstanding: number }>;
}

export function statementHtml(s: StatementInput): string {
  const L = LABELS[s.lang];
  const m = (n: number, c: string) => `<bdi>${fmtMoney(n, c, s.lang)}</bdi>`;
  const rows = s.invoices.map((i) => `<tr><td><bdi>${escapeHtml(i.number)}</bdi></td><td>${fmtDate(i.issueDate, s.lang)}</td><td>${fmtDate(i.dueDate, s.lang)}</td>
<td class="num">${m(i.total, i.currency)}</td><td class="num">${m(i.paid, i.currency)}</td><td class="num">${m(i.credited, i.currency)}</td><td class="num">${m(i.outstanding, i.currency)}</td></tr>`).join('');
  return page(s.lang, `${L.statement} ${s.campaignName}`, `
<div class="head">${companyBlock(s.company)}<div><h1>${L.statement}</h1><div class="muted">${L.generated}: ${fmtDate(s.generatedAt, s.lang)}</div></div></div>
<p><strong>${L.campaign}:</strong> <bdi dir="auto">${escapeHtml(s.campaignName)}</bdi><br><strong>${L.client}:</strong> <bdi dir="auto">${escapeHtml(s.clientName)}</bdi></p>
${s.invoices.length === 0 ? `<p class="muted">${L.none}</p>` : `<table>
<thead><tr><th>#</th><th>${L.issued}</th><th>${L.due}</th><th class="num">${L.total}</th><th class="num">${L.paid}</th><th class="num">${L.credited}</th><th class="num">${L.outstanding}</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot>${s.totals.map((t) => `<tr><td colspan="3">${L.totals}</td><td class="num">${m(t.invoiced, t.currency)}</td><td class="num">${m(t.paid, t.currency)}</td><td class="num">${m(t.credited, t.currency)}</td><td class="num">${m(t.outstanding, t.currency)}</td></tr>`).join('')}</tfoot>
</table>`}`);
}
