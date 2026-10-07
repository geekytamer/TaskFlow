import type { DataStore } from '../data/store';
import type { Owner } from './workspace-store';

/**
 * What staff see of an influencer's own business, on that influencer's contact
 * page and nowhere else: their contacts, their deals, and totals per brand per
 * currency (no conversion).
 */
export function workspaceSummary(store: DataStore, o: Owner) {
  const ws = store.workspace;
  const contacts = ws.contacts(o, { includeArchived: true });
  const names = new Map(contacts.map((c) => [c.id, c.name]));
  const deals = ws.deals(o).map((d) => ({
    id: d.id, title: d.title, brandId: d.wsContactId, brandName: d.wsContactId ? names.get(d.wsContactId) ?? null : null,
    amount: d.amount, currency: d.currency, status: d.status, startDate: d.startDate, endDate: d.endDate,
  }));
  const byBrand = new Map<string, { brandId: string | null; brandName: string | null; currency: string; total: number; deals: number }>();
  for (const d of deals) {
    if (d.status === 'cancelled') continue;
    const key = `${d.brandId ?? ''}|${d.currency}`;
    const row = byBrand.get(key) ?? { brandId: d.brandId, brandName: d.brandName, currency: d.currency, total: 0, deals: 0 };
    row.total = Math.round((row.total + (d.amount ?? 0)) * 1000) / 1000;
    row.deals += 1;
    byBrand.set(key, row);
  }
  const stamps = [...contacts.map((c) => c.updatedAt), ...ws.deals(o).map((d) => d.updatedAt)].sort();
  return {
    contacts: contacts.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, company: c.company, email: c.email, phone: c.phone, peakContactId: c.peakContactId, archived: Boolean(c.archivedAt),
    })),
    deals,
    byBrand: [...byBrand.values()].sort((a, b) => b.total - a.total),
    lastActivityAt: stamps.at(-1) ?? null,
  };
}
