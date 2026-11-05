import type { Recipe, RecipeContext } from './types';
import { argsOf, co, dateArg, dayOf, norm, round, say } from './util';

interface InvoiceRow { id: string; invoiceNumber: string; clientId: string; status: string; total: number; outstandingAmount?: number; currency?: string; exchangeRate?: number; issueDate?: string; dueDate?: string }

const STATUS_WORDS = ['unpaid', 'overdue', 'paid', 'draft', 'all'] as const;
const listInvoices = (ctx: RecipeContext) => ctx.get<InvoiceRow[]>(co(ctx, '/invoices'));

/** An invoice as people talk about it: who owes what, by when, and whether it is late. */
function rowOf(ctx: RecipeContext, i: InvoiceRow) {
  const unpaid = i.status === 'Sent' || i.status === 'Overdue';
  const outstanding = round(unpaid ? Number(i.outstandingAmount ?? i.total) : 0);
  const due = dayOf(i.dueDate);
  const overdue = unpaid && outstanding > 0 && (i.status === 'Overdue' || (due !== undefined && due < ctx.today));
  return {
    id: i.id, invoiceNumber: i.invoiceNumber, client: ctx.names.client(i.clientId) ?? i.clientId, clientId: i.clientId,
    status: i.status, total: round(Number(i.total)), outstanding, currency: i.currency ?? ctx.currency,
    /** Outstanding in the company's own currency, for totals across currencies. */
    outstandingBase: round(outstanding * Number(i.exchangeRate ?? 1)),
    issueDate: dayOf(i.issueDate), dueDate: due, overdue,
    ...(overdue && due ? { daysOverdue: Math.max(0, Math.round((Date.parse(ctx.today) - Date.parse(due)) / 86_400_000)) } : {}),
  };
}

export const invoices: Recipe = {
  name: 'invoices',
  signature: "invoices({ status?: 'unpaid'|'overdue'|'paid'|'draft'|'all', client?: name })",
  returns: 'invoices [{ id, invoiceNumber, client, status, total, outstanding, currency, dueDate, overdue, daysOverdue }], unpaid by default, oldest due first; .length is how many',
  example: "const late = await tf.invoices({ status: 'overdue' }); await show(late); return { count: late.length };",
  words: ['invoice', 'invoices', 'unpaid', 'overdue', 'outstanding', 'bill', 'billing', 'paid', 'client'],
  async run(ctx, args) {
    const a = argsOf(args);
    const textIsStatus = typeof a.text === 'string' && (STATUS_WORDS as readonly string[]).includes(norm(a.text));
    const status = String(a.status ?? (textIsStatus ? norm(a.text) : 'unpaid'));
    if (!(STATUS_WORDS as readonly string[]).includes(status)) throw new Error(`status must be one of ${STATUS_WORDS.join('|')}`);
    const client = norm(a.client ?? (textIsStatus ? '' : a.text));
    return (await listInvoices(ctx))
      .map((i) => rowOf(ctx, i))
      .filter((r) => !client || norm(r.client).includes(client))
      .filter((r) => status === 'all' || (status === 'unpaid' ? r.outstanding > 0 : status === 'overdue' ? r.overdue : status === 'paid' ? r.status === 'Paid' : r.status === 'Draft'))
      .sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''))
      .map(({ outstandingBase: _b, ...r }) => r);
  },
};

export const receivables: Recipe = {
  name: 'receivables',
  signature: 'receivables()',
  returns: '{ currency, totalOwed, overdueAmount, unpaidInvoices (count), overdueInvoices (count), byClient: [{ client, owed, overdue }] largest first }, amounts in the company currency',
  example: "const r = await tf.receivables(); return { owed: r.totalOwed, currency: r.currency, topClient: r.byClient[0] };",
  words: ['owe', 'owed', 'receivable', 'receivables', 'debt', 'debtor', 'outstanding', 'collect', 'total', 'money'],
  async run(ctx) {
    const rows = (await listInvoices(ctx)).map((i) => rowOf(ctx, i)).filter((r) => r.outstanding > 0);
    const byClient = new Map<string, { client: string; owed: number; overdue: number }>();
    for (const r of rows) {
      const c = byClient.get(r.clientId) ?? { client: r.client, owed: 0, overdue: 0 };
      c.owed = round(c.owed + r.outstandingBase);
      if (r.overdue) c.overdue = round(c.overdue + r.outstandingBase);
      byClient.set(r.clientId, c);
    }
    return {
      currency: ctx.currency,
      totalOwed: round(rows.reduce((s, r) => s + r.outstandingBase, 0)),
      overdueAmount: round(rows.filter((r) => r.overdue).reduce((s, r) => s + r.outstandingBase, 0)),
      unpaidInvoices: rows.length,
      overdueInvoices: rows.filter((r) => r.overdue).length,
      byClient: [...byClient.values()].sort((x, y) => y.owed - x.owed).slice(0, 10),
    };
  },
};

export const salesSummary: Recipe = {
  name: 'salesSummary',
  signature: "salesSummary({ from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' })",
  returns: '{ from, to, currency, invoiced, collected, outstanding, invoices } for invoices issued in the period (drafts left out); this month by default',
  example: "return await tf.salesSummary({ from: '2026-01-01', to: '2026-03-31' });",
  words: ['sales', 'revenue', 'invoiced', 'income', 'turnover', 'month', 'year', 'period', 'sold'],
  async run(ctx, args) {
    const a = argsOf(args);
    const from = dateArg(ctx, a.from, 'from') ?? `${ctx.today.slice(0, 8)}01`;
    const to = dateArg(ctx, a.to, 'to') ?? ctx.today;
    const rows = (await listInvoices(ctx))
      .filter((i) => i.status !== 'Draft')
      .filter((i) => { const d = dayOf(i.issueDate); return d !== undefined && d >= from && d <= to; });
    const invoiced = round(rows.reduce((s, i) => s + Number(i.total) * Number(i.exchangeRate ?? 1), 0));
    const outstanding = round(rows.reduce((s, i) => s + rowOf(ctx, i).outstandingBase, 0));
    return { from, to, currency: ctx.currency, invoiced, collected: round(invoiced - outstanding), outstanding, invoices: rows.length };
  },
};

export const recordPayment: Recipe = {
  name: 'recordPayment',
  signature: "recordPayment({ invoice: invoice number|id|client name, amount?: number (default: all that is owed), date?: 'YYYY-MM-DD'|'today', method?, note? })",
  returns: 'one proposal recording the payment on that invoice (give the client\'s name when the person names no invoice number)',
  example: "return await tf.recordPayment({ invoice: 'Gulf Star Trading', amount: 250 });",
  words: ['payment', 'paid', 'pay', 'received', 'receipt', 'collected', 'cash', 'transfer', 'cheque'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const amountArg = a.amount === undefined ? undefined : Number(a.amount);
    if (amountArg !== undefined && !(amountArg > 0)) throw new Error('amount must be a positive number');
    const unpaid = (await listInvoices(ctx)).map((i) => rowOf(ctx, i)).filter((r) => r.outstanding > 0);
    const ref = a.invoice ?? a.text;
    const want = norm(ref);
    if (!want) throw new Error('say which invoice: its number, or the client');
    let target = unpaid.find((r) => r.id === String(ref) || norm(r.invoiceNumber) === want);
    if (!target) {
      const ofClient = unpaid.filter((r) => norm(r.client).includes(want));
      const sameAmount = amountArg !== undefined ? ofClient.filter((r) => Math.abs(r.outstanding - amountArg) < 0.001) : [];
      target = ofClient.length === 1 ? ofClient[0] : sameAmount.length === 1 ? sameAmount[0] : undefined;
      if (!target) {
        throw new Error(ofClient.length
          ? `${ofClient.length} unpaid invoices of "${String(ref)}": ${ofClient.map((r) => `${r.invoiceNumber} (${r.outstanding} ${r.currency} owed)`).join('; ')}. Ask the person which one.`
          : `no unpaid invoice matches "${String(ref)}"`);
      }
    }
    const amount = amountArg ?? target.outstanding;
    if (amount - target.outstanding > 0.001) throw new Error(`${target.invoiceNumber} has only ${target.outstanding} ${target.currency} outstanding`);
    const paidAt = dateArg(ctx, a.date ?? 'today', 'date');
    return ctx.propose(
      'POST', `/invoices/${encodeURIComponent(target.id)}/payments`,
      { amount, paidAt, ...(a.method ? { method: String(a.method) } : {}), ...(a.note ? { note: String(a.note) } : {}) },
      say(ctx, `Record a payment of ${amount} ${target.currency} on ${target.invoiceNumber} (${target.client})`, `تسجيل دفعة ${amount} ${target.currency} على الفاتورة ${target.invoiceNumber} (${target.client})`),
    );
  },
};
