import type { DataStore } from '../data/store';
import type { Contact } from '../types';
import { companyCurrency } from '../portal/common';
import { peakDeals } from './peak-mirror';
import type { Owner } from './workspace-store';

/**
 * Every dated deliverable, the influencer's own and Peak's, in a date range,
 * plus everything still undone that was due before it. Peak work shows once
 * the influencer has accepted it; offers are not on the calendar yet.
 */

export interface CalendarItem {
  id: string; source: 'own' | 'peak'; title: string; dueDate: string; done: boolean; platform: string | null; dealId: string; dealTitle: string;
}

export function calendarItems(store: DataStore, companyId: string, contact: Contact, from: string, to: string) {
  const o: Owner = { companyId, ownerContactId: contact.id };
  const all: CalendarItem[] = [];
  for (const d of store.workspace.allDeliverables(o)) {
    if (!d.dueDate) continue;
    all.push({ id: d.id, source: 'own', title: d.title, dueDate: d.dueDate, done: d.status === 'done', platform: d.platform, dealId: d.dealId, dealTitle: d.dealTitle });
  }
  for (const deal of peakDeals(store, companyId, contact, companyCurrency(store, companyId))) {
    if (deal.status === 'lead') continue;
    for (const d of deal.assignment.deliverables) {
      if (!d.dueDate) continue;
      all.push({
        id: d.id, source: 'peak', title: d.title, dueDate: d.dueDate.slice(0, 10), done: d.status === 'approved' || d.status === 'published',
        platform: d.platform, dealId: deal.id, dealTitle: deal.title,
      });
    }
  }
  const byDate = (a: CalendarItem, b: CalendarItem) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title);
  return {
    from,
    to,
    items: all.filter((i) => i.dueDate >= from && i.dueDate <= to).sort(byDate),
    overdue: all.filter((i) => !i.done && i.dueDate < from).sort(byDate),
  };
}
