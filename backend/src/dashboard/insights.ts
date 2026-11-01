import type { DataStore } from '../data/store';
import type { UserRole } from '../types';
import { companyCurrency } from '../portal/common';

/**
 * The dashboard's period figures: what changed over the chosen window,
 * against the window before it, plus the trends and forecasts behind them.
 * Everything is derived from records already kept (invoices, payments,
 * expenses, vendor bills, deals, tasks and their activity trail).
 *
 * The variant follows the dashboard's own (server.ts): Admin sees all,
 * Accountant the money, Manager the work and the sales, Employee their own
 * tasks. A section whose module is switched off is left out.
 */

export const INSIGHT_PERIODS = [30, 90, 365] as const;
const DAY = 86_400_000;
const OPEN_STAGES = ['New', 'Qualified', 'Proposal', 'Negotiation'] as const;
const STALE_DAYS = 14;

export interface InsightKpi {
  id: string;
  value: number;
  /** The same figure over the window before; null when it has no meaning. */
  previous: number | null;
  format: 'currency' | 'number' | 'percent' | 'days';
  /** One point a month, oldest first, for the card's small line. */
  spark?: number[];
  /** A second figure shown under the value. */
  sub?: { kind: 'dso' | 'winRate' | 'count'; value: number | null };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (part: number, whole: number) => (whole > 0 ? r1((part / whole) * 100) : 0);
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const endOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY - 1;

export function dashboardInsights(
  store: DataStore,
  companyId: string,
  viewer: { userId: string; variant: UserRole },
  days: number,
  nowMs = Date.now(),
) {
  const disabled = new Set(store.getDisabledModules(companyId));
  const on = (module: string) => !disabled.has(module);
  const finance = viewer.variant === 'Admin' || viewer.variant === 'Accountant';
  const operations = viewer.variant === 'Admin' || viewer.variant === 'Manager';
  const personal = viewer.variant === 'Employee';

  const start = nowMs - days * DAY;
  const prevStart = start - days * DAY;
  const within = (t: number, from: number, to: number) => t > from && t <= to;

  // Monthly points: the last 6 months (12 for a year); the last one ends now.
  const months = days >= 365 ? 12 : 6;
  const now = new Date(nowMs);
  const points = Array.from({ length: months }, (_, i) => {
    const first = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1);
    const end = i === months - 1 ? nowMs : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 2 - i), 1) - 1;
    return { month: monthKey(new Date(first)), from: first - 1, end };
  });

  const kpis: InsightKpi[] = [];
  const result: Record<string, unknown> = { days, currency: companyCurrency(store, companyId), variant: viewer.variant };

  if (finance && on('invoices')) {
    const invoices = store.listInvoices(companyId).filter((i) => i.status !== 'Draft');
    const rateOf = new Map(invoices.map((i) => [i.id, i.exchangeRate || 1]));
    const payments = store.listCompanyPayments(companyId).filter((p) => rateOf.has(p.invoiceId));
    const expenses = on('finance')
      ? store.listExpenses(companyId).filter((e) => e.approvalStatus !== 'pending' && e.approvalStatus !== 'rejected')
      : [];
    const vendorPayments = on('vendor-bills') ? store.listCompanyVendorPayments(companyId) : [];

    const billedIn = (from: number, to: number) => r3(invoices
      .filter((i) => within(new Date(i.issueDate).getTime(), from, to))
      .reduce((n, i) => n + i.total * (i.exchangeRate || 1), 0));
    const collectedIn = (from: number, to: number) => r3(payments
      .filter((p) => within(p.paidAt.getTime(), from, to))
      .reduce((n, p) => n + p.amount * rateOf.get(p.invoiceId)!, 0));
    const spentIn = (from: number, to: number) => r3(
      expenses.filter((e) => within(new Date(e.expenseDate).getTime(), from, to)).reduce((n, e) => n + e.amount, 0)
      + vendorPayments.filter((p) => within(p.paidAt.getTime(), from, to)).reduce((n, p) => n + p.amount, 0));

    const cashflow = points.map((p) => ({
      month: p.month,
      billed: billedIn(p.from, p.end),
      collected: collectedIn(p.from, p.end),
      spent: spentIn(p.from, p.end),
    }));
    result.cashflow = cashflow;

    const receivables = r3(invoices.reduce((n, i) => n + Math.max(0, i.outstandingAmount ?? 0) * (i.exchangeRate || 1), 0));
    // Days sales outstanding: what clients owe against what was billed a day over the last 90 days.
    const billed90 = billedIn(nowMs - 90 * DAY, nowMs);
    const dso = billed90 > 0 ? Math.round(receivables / (billed90 / 90)) : null;

    kpis.push(
      { id: 'revenue', value: billedIn(start, nowMs), previous: billedIn(prevStart, start), format: 'currency', spark: cashflow.map((c) => c.billed) },
      { id: 'collected', value: collectedIn(start, nowMs), previous: collectedIn(prevStart, start), format: 'currency', spark: cashflow.map((c) => c.collected) },
      {
        id: 'net-cash',
        value: r3(collectedIn(start, nowMs) - spentIn(start, nowMs)),
        previous: r3(collectedIn(prevStart, start) - spentIn(prevStart, start)),
        format: 'currency',
        spark: cashflow.map((c) => r3(c.collected - c.spent)),
      },
      { id: 'receivables', value: receivables, previous: null, format: 'currency', sub: { kind: 'dso', value: dso } },
    );

    // The next 30 days, a week at a time: what clients are due to pay and what is due to suppliers.
    // Anything already overdue is shown apart, not folded into the first week.
    const bills = on('vendor-bills') ? store.listVendorBills(companyId).filter((b) => b.status !== 'Draft' && b.status !== 'Paid') : [];
    const weekStart = (k: number) => nowMs + k * 7 * DAY;
    const dueIn = (at: Date | string, k: number) => {
      const t = new Date(at).getTime();
      return t >= weekStart(k) - DAY && t < (k === 3 ? nowMs + 30 * DAY : weekStart(k + 1) - DAY);
    };
    const owed = (i: (typeof invoices)[number]) => Math.max(0, i.outstandingAmount ?? 0) * (i.exchangeRate || 1);
    const payable = (b: (typeof bills)[number]) => Math.max(0, b.outstandingAmount ?? b.amount);
    result.forecast = {
      weeks: [0, 1, 2, 3].map((k) => ({
        from: new Date(weekStart(k)).toISOString().slice(0, 10),
        incoming: r3(invoices.filter((i) => owed(i) > 0 && dueIn(i.dueDate, k)).reduce((n, i) => n + owed(i), 0)),
        outgoing: r3(bills.filter((b) => payable(b) > 0 && dueIn(b.dueDate, k)).reduce((n, b) => n + payable(b), 0)),
      })),
      overdueIncoming: r3(invoices.filter((i) => owed(i) > 0 && new Date(i.dueDate).getTime() < nowMs - DAY).reduce((n, i) => n + owed(i), 0)),
      overdueOutgoing: r3(bills.filter((b) => payable(b) > 0 && new Date(b.dueDate).getTime() < nowMs - DAY).reduce((n, b) => n + payable(b), 0)),
    };

    // Who brought in the most over the window.
    const byClient = new Map<string, number>();
    for (const i of invoices) {
      if (!within(new Date(i.issueDate).getTime(), start, nowMs)) continue;
      byClient.set(i.clientId, (byClient.get(i.clientId) ?? 0) + i.total * (i.exchangeRate || 1));
    }
    const total = [...byClient.values()].reduce((n, v) => n + v, 0);
    result.topClients = [...byClient.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([clientId, billed]) => ({ clientId, name: store.getClientById(clientId)?.name ?? '', billed: r3(billed), share: pct(billed, total) }));
  }

  if (operations && on('crm')) {
    const deals = store.listOpportunities(companyId);
    const closedIn = (stage: string, from: number, to: number) => deals.filter((d) => d.stage === stage && d.closedAt && within(d.closedAt.getTime(), from, to));
    const won = closedIn('Won', start, nowMs);
    const wonPrev = closedIn('Won', prevStart, start);
    const lost = closedIn('Lost', start, nowMs);
    const sum = (list: typeof deals) => r3(list.reduce((n, d) => n + (d.expectedRevenue || 0), 0));
    kpis.push({
      id: 'won-deals',
      value: sum(won),
      previous: sum(wonPrev),
      format: 'currency',
      spark: points.map((p) => sum(closedIn('Won', p.from, p.end))),
      sub: { kind: 'winRate', value: won.length + lost.length > 0 ? pct(won.length, won.length + lost.length) : null },
    });
    const open = deals.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage));
    result.pipeline = OPEN_STAGES.map((stage) => {
      const list = open.filter((d) => d.stage === stage);
      return { stage, count: list.length, value: sum(list), weighted: r3(list.reduce((n, d) => n + (d.expectedRevenue || 0) * (d.probability || 0) / 100, 0)) };
    });
    result.staleDeals = open.filter((d) => nowMs - d.updatedAt.getTime() > STALE_DAYS * DAY).length;
  }

  if ((operations || personal) && on('tasks')) {
    const all = store.listTasks().filter((t) => t.companyId === companyId);
    const tasks = personal ? all.filter((t) => t.assignedUserIds?.includes(viewer.userId)) : all;
    const doneAt = store.taskCompletionTimes(companyId);
    const completedIn = (from: number, to: number) => tasks.filter((t) => {
      const at = t.status === 'Done' ? doneAt.get(t.id) : undefined;
      return at && within(at.getTime(), from, to);
    });
    const onTimeRate = (list: typeof tasks) => {
      const dated = list.filter((t) => t.dueDate);
      return dated.length ? pct(dated.filter((t) => doneAt.get(t.id)!.getTime() <= endOfDay(t.dueDate!)).length, dated.length) : null;
    };
    const done = completedIn(start, nowMs);
    const donePrev = completedIn(prevStart, start);
    kpis.push(
      { id: 'tasks-done', value: done.length, previous: donePrev.length, format: 'number', spark: points.map((p) => completedIn(p.from, p.end).length) },
      { id: 'on-time', value: onTimeRate(done) ?? 0, previous: onTimeRate(donePrev), format: 'percent', sub: { kind: 'count', value: done.filter((t) => t.dueDate).length } },
    );

    // Created against finished, a week at a time over the last 8 weeks.
    result.throughput = Array.from({ length: 8 }, (_, i) => {
      const to = nowMs - (7 - i) * 7 * DAY;
      const from = to - 7 * DAY;
      return {
        week: new Date(from + DAY).toISOString().slice(0, 10),
        created: tasks.filter((t) => within(t.createdAt.getTime(), from, to)).length,
        completed: completedIn(from, to).length,
      };
    });

    if (operations) {
      // Open work per person, and how much of it is late.
      const load = new Map<string, { open: number; overdue: number }>();
      for (const t of all) {
        if (t.status === 'Done') continue;
        for (const uid of t.assignedUserIds ?? []) {
          const row = load.get(uid) ?? { open: 0, overdue: 0 };
          row.open += 1;
          if (t.dueDate && endOfDay(t.dueDate) < nowMs) row.overdue += 1;
          load.set(uid, row);
        }
      }
      result.team = [...load.entries()]
        .map(([userId, row]) => ({ userId, name: store.getUserById(userId)?.name ?? '', ...row }))
        .filter((row) => row.name)
        .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
        .slice(0, 8);
    }
  }

  result.kpis = kpis;
  return result;
}
