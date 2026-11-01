import type { DataStore } from '../data/store';
import type { FlexiApplication } from '../finance/flexi';
import { companyCurrency } from './common';

/**
 * The Peak Flexi overview's figures, all derived from data already kept:
 * the account timeline (balances over time), invoices and payments (what
 * clients owed over time, what is overdue), applications (approval rate,
 * decision time) and website leads (the conversion funnel).
 */

export const OVERVIEW_PERIODS = [30, 90, 365] as const;
const DAY = 86_400_000;
const BUCKETS = [
  { key: '0-25', min: 0, max: 25 },
  { key: '25-50', min: 25, max: 50 },
  { key: '50-80', min: 50, max: 80 },
  { key: '80-100', min: 80, max: 100.0001 },
  { key: 'over-100', min: 100.0001, max: Infinity },
];

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (part: number, whole: number) => (whole > 0 ? r1((part / whole) * 100) : 0);
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export function flexiOverview(store: DataStore, companyId: string, days: number, nowMs = Date.now()) {
  const start = nowMs - days * DAY;
  const prevStart = start - days * DAY;
  const accountIds = store.flexi.accountContactIds(companyId);
  const balances = new Map(accountIds.map((id) => [id, store.flexi.balanceOf(id)]));
  const live = accountIds.filter((id) => balances.get(id)!.enabled);
  const events = new Map(accountIds.map((id) => [id, store.flexi.events(id)]));

  /** The balance an account had at a moment: the last amount its timeline set before then. */
  const balanceAt = (contactId: string, t: number) => {
    const e = events.get(contactId)!.find((ev) => ev.kind !== 'applied' && ev.amountAfter !== null && Date.parse(ev.createdAt) <= t);
    return e ? Number(e.amountAfter) : 0;
  };

  // What each account owed at a moment: issued invoices less payments made by then.
  const invoices = store.listInvoices(companyId).filter((i) => i.status !== 'Draft');
  const clientOf = new Map(accountIds.map((id) => [id, balances.get(id)!.clientId]));
  const invoicesOf = (contactId: string) => invoices.filter((i) => i.clientId === clientOf.get(contactId));
  const paymentsOf = new Map<string, Array<{ amount: number; at: number }>>();
  const payments = (invoiceId: string) => {
    if (!paymentsOf.has(invoiceId)) paymentsOf.set(invoiceId, store.listPayments(invoiceId).map((p) => ({ amount: p.amount, at: new Date(p.paidAt).getTime() })));
    return paymentsOf.get(invoiceId)!;
  };
  const usedAt = (contactId: string, t: number) => invoicesOf(contactId)
    .filter((i) => new Date(i.issueDate).getTime() <= t)
    .reduce((sum, i) => {
      const paid = payments(i.id).filter((p) => p.at <= t).reduce((n, p) => n + p.amount, 0);
      return sum + Math.max(0, i.total - paid) * (i.exchangeRate || 1);
    }, 0);

  const sumLive = (fn: (id: string) => number) => r3(live.reduce((n, id) => n + fn(id), 0));
  const balanceNow = sumLive((id) => balances.get(id)!.balance);
  const usedNow = sumLive((id) => balances.get(id)!.used);
  const balancePrev = r3(accountIds.reduce((n, id) => n + balanceAt(id, start), 0));
  const usedPrev = r3(accountIds.reduce((n, id) => n + (balanceAt(id, start) > 0 ? usedAt(id, start) : 0), 0));

  // Overdue: anything a Flexi client owes past its due date.
  const overdue = accountIds.flatMap((id) => invoicesOf(id)
    .filter((i) => (i.outstandingAmount ?? 0) > 0 && new Date(i.dueDate).getTime() < nowMs)
    .map((i) => ({ contactId: id, amount: (i.outstandingAmount ?? 0) * (i.exchangeRate || 1) })));

  // Applications decided in a window, and how long the decision took.
  const apps = store.flexi.list(companyId);
  const decidedIn = (from: number, to: number) => apps.filter((a) => (a.status === 'approved' || a.status === 'rejected') && a.reviewedAt && Date.parse(a.reviewedAt) > from && Date.parse(a.reviewedAt) <= to);
  const rate = (list: FlexiApplication[]) => pct(list.filter((a) => a.status === 'approved').length, list.length);
  const avgDays = (list: FlexiApplication[]) => list.length ? r1(list.reduce((n, a) => n + (Date.parse(a.reviewedAt!) - Date.parse(a.createdAt)) / DAY, 0) / list.length) : null;
  const decided = decidedIn(start, nowMs);
  const decidedPrev = decidedIn(prevStart, start);

  // Monthly points: the last 6 months (12 for a year), the last point is now.
  const months = days >= 365 ? 12 : 6;
  const now = new Date(nowMs);
  const points = Array.from({ length: months }, (_, i) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    const end = i === months - 1 ? nowMs : Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1) - 1;
    return { month: monthKey(first), end };
  });
  const trend = points.map(({ month, end }) => ({
    month,
    approved: r3(accountIds.reduce((n, id) => n + balanceAt(id, end), 0)),
    used: r3(accountIds.reduce((n, id) => n + (balanceAt(id, end) > 0 ? usedAt(id, end) : 0), 0)),
  }));
  const applicationsByMonth = points.map(({ month }) => {
    const inMonth = apps.filter((a) => monthKey(new Date(a.createdAt)) === month);
    const count = (s: FlexiApplication['status']) => inMonth.filter((a) => a.status === s).length;
    return { month, approved: count('approved'), rejected: count('rejected'), withdrawn: count('withdrawn'), pending: count('new') };
  });

  const usage = live.map((id) => {
    const b = balances.get(id)!;
    return { contactId: id, name: store.getContactById(id)?.name ?? '', balance: b.balance, used: b.used, usedPct: pct(b.used, b.balance) };
  });
  const utilisation = BUCKETS.map((bucket) => ({ bucket: bucket.key, count: usage.filter((u) => u.balance > 0 && u.usedPct >= bucket.min && u.usedPct < bucket.max).length }));
  const biggest = [...usage].sort((x, y) => y.balance - x.balance)[0];

  // Website funnel: applied on /join → invited to the portal → applied for a balance → activated.
  const website = store.listContacts(companyId).filter((c) => (c.tags ?? []).includes('peak-flexi'));
  const invited = website.filter((c) => store.portal.listUsers(companyId, { contactId: c.id }).length > 0);
  const applied = invited.filter((c) => apps.some((a) => a.contactId === c.id));
  const activated = applied.filter((c) => store.flexi.balanceOf(c.id).state !== null);

  return {
    days,
    currency: companyCurrency(store, companyId),
    kpis: {
      balance: { value: balanceNow, previous: balancePrev },
      used: { value: usedNow, previous: usedPrev },
      utilisation: { value: pct(usedNow, balanceNow), previous: pct(usedPrev, balancePrev) },
      available: { value: sumLive((id) => balances.get(id)!.available) },
      accounts: {
        active: live.filter((id) => balances.get(id)!.state === 'active').length,
        frozen: live.filter((id) => balances.get(id)!.state === 'frozen').length,
      },
      overdue: { amount: r3(overdue.reduce((n, o) => n + o.amount, 0)), invoices: overdue.length, clients: new Set(overdue.map((o) => o.contactId)).size },
      approvalRate: { value: rate(decided), previous: rate(decidedPrev), approved: decided.filter((a) => a.status === 'approved').length, decided: decided.length },
      avgDecisionDays: { value: avgDays(decided), previous: avgDays(decidedPrev) },
      waiting: apps.filter((a) => a.status === 'new').length,
    },
    trend,
    applicationsByMonth,
    utilisation,
    funnel: { website: website.length, invited: invited.length, applied: applied.length, activated: activated.length },
    topClients: [...usage].sort((x, y) => y.used - x.used || y.balance - x.balance).slice(0, 5),
    concentration: biggest ? { contactId: biggest.contactId, name: biggest.name, share: pct(biggest.balance, balanceNow) } : null,
    recentEvents: store.flexi.recentEvents(companyId, 10).map((e) => ({ ...e, contactName: store.getContactById(e.contactId)?.name ?? '' })),
  };
}
