import type { DataStore } from '../data/store';
import type { Contact } from '../types';
import { payoutsFor } from '../portal/payouts';
import { companyCurrency } from '../portal/common';
import type { Owner } from './workspace-store';

/**
 * The influencer's money for a year, per currency (never converted):
 * received (own payments and Peak payouts paid in that year), owed (as of
 * today: own confirmed or delivered deals not yet paid in full, and Peak
 * payouts not yet paid), expenses in that year, and profit = received − expenses.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const OWED_STATUSES = new Set(['confirmed', 'delivered']);

export function moneySummary(store: DataStore, companyId: string, contact: Contact, year: number) {
  const o: Owner = { companyId, ownerContactId: contact.id };
  const ws = store.workspace;
  const inYear = (date: string | null | undefined) => Boolean(date) && date!.slice(0, 4) === String(year);

  const deals = ws.deals(o);
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const brandName = (wsContactId: string | null) => (wsContactId ? ws.contact(o, wsContactId)?.name ?? null : null);
  const payments = ws.allPayments(o);
  const expenses = ws.expenses(o);
  const peak = payoutsFor(store, companyId, contact.id, companyCurrency(store, companyId));

  const totals = new Map<string, { received: number; owed: number; expenses: number }>();
  const bucket = (currency: string) => {
    const t = totals.get(currency) ?? { received: 0, owed: 0, expenses: 0 };
    totals.set(currency, t);
    return t;
  };
  const months = new Map<string, { month: string; currency: string; received: number; expenses: number }>();
  const month = (date: string, currency: string) => {
    const key = `${date.slice(0, 7)}|${currency}`;
    const m = months.get(key) ?? { month: date.slice(0, 7), currency, received: 0, expenses: 0 };
    months.set(key, m);
    return m;
  };
  const brands = new Map<string, { brand: string | null; source: 'own' | 'peak'; currency: string; received: number }>();
  const brandRow = (brand: string | null, source: 'own' | 'peak', currency: string) => {
    const key = `${source}|${brand ?? ''}|${currency}`;
    const b = brands.get(key) ?? { brand, source, currency, received: 0 };
    brands.set(key, b);
    return b;
  };
  const ledger: Array<{
    id: string; date: string; kind: 'payment' | 'expense' | 'peak_payout'; label: string; detail: string | null;
    amount: number; currency: string; dealId: string | null; deletable: boolean; status?: 'pending' | 'approved' | 'paid';
  }> = [];

  // Own payments.
  for (const p of payments) {
    if (!inYear(p.receivedOn)) continue;
    const deal = dealById.get(p.dealId);
    bucket(p.currency).received += p.amount;
    month(p.receivedOn, p.currency).received += p.amount;
    brandRow(deal ? brandName(deal.wsContactId) : null, 'own', p.currency).received += p.amount;
    ledger.push({ id: p.id, date: p.receivedOn, kind: 'payment', label: deal?.title ?? '', detail: deal ? brandName(deal.wsContactId) : null, amount: p.amount, currency: p.currency, dealId: p.dealId, deletable: true });
  }

  // Own deals still owed, as of today.
  const paidOn = new Map<string, number>();
  for (const p of payments) paidOn.set(p.dealId, (paidOn.get(p.dealId) ?? 0) + p.amount);
  const owedItems: Array<{ dealId: string; title: string; currency: string; owed: number; source: 'own' | 'peak' }> = [];
  for (const d of deals) {
    if (!OWED_STATUSES.has(d.status) || d.amount === null) continue;
    const owed = r3(Math.max(0, d.amount - (paidOn.get(d.id) ?? 0)));
    if (owed <= 0) continue;
    bucket(d.currency).owed += owed;
    owedItems.push({ dealId: d.id, title: d.title, currency: d.currency, owed, source: 'own' });
  }

  // Expenses.
  for (const e of expenses) {
    if (!inYear(e.spentOn)) continue;
    bucket(e.currency).expenses += e.amount;
    month(e.spentOn, e.currency).expenses += e.amount;
    ledger.push({ id: e.id, date: e.spentOn, kind: 'expense', label: e.category, detail: e.note, amount: e.amount, currency: e.currency, dealId: e.dealId, deletable: true });
  }

  // Peak payouts: paid ones in the year are received; the rest are owed.
  for (const p of peak) {
    // A campaign can be paid by several bills; what each covers tells them apart.
    const label = p.kind === 'referral' ? `Referral: ${p.label}` : p.items.length ? `${p.label}: ${p.items.join(', ')}` : p.label;
    if (p.status === 'paid') {
      if (!inYear(p.paidAt)) continue;
      bucket(p.currency).received += p.amount;
      month(p.paidAt!, p.currency).received += p.amount;
      brandRow('Peak', 'peak', p.currency).received += p.amount;
      ledger.push({ id: p.id, date: p.paidAt!.slice(0, 10), kind: 'peak_payout', label, detail: p.number, amount: p.amount, currency: p.currency, dealId: null, deletable: false, status: 'paid' });
    } else {
      bucket(p.currency).owed += p.amount;
      owedItems.push({ dealId: '', title: label, currency: p.currency, owed: p.amount, source: 'peak' });
      ledger.push({ id: p.id, date: (p.dueDate ?? new Date().toISOString()).slice(0, 10), kind: 'peak_payout', label, detail: p.number, amount: p.amount, currency: p.currency, dealId: null, deletable: false, status: p.status });
    }
  }

  return {
    year,
    currencies: [...totals.entries()]
      .map(([currency, t]) => ({ currency, received: r3(t.received), owed: r3(t.owed), expenses: r3(t.expenses), profit: r3(t.received - t.expenses) }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    months: [...months.values()].map((m) => ({ ...m, received: r3(m.received), expenses: r3(m.expenses) }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency)),
    byBrand: [...brands.values()].map((b) => ({ ...b, received: r3(b.received) })).sort((a, b) => b.received - a.received),
    ledger: ledger.sort((a, b) => b.date.localeCompare(a.date)),
    owedItems,
  };
}

export type MoneySummary = ReturnType<typeof moneySummary>;
