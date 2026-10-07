/** Safe in the browser: no server imports here. */
import type { Key } from './i18n';
import type { Assignment } from './influencer-types';

export const DEAL_STATUSES = ['lead', 'confirmed', 'delivered', 'paid', 'cancelled'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
export const CONTACT_KINDS = ['brand', 'agency', 'manager', 'other'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export interface DealSummary {
  id: string;
  source: 'own' | 'peak';
  title: string;
  amount: number | null;
  currency: string;
  status: DealStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  brand: { id: string | null; name: string; archived: boolean } | null;
  nextDue: { title: string; dueDate: string | null } | null;
  updatedAt: string;
}

export interface WsDeliverable {
  id: string;
  title: string;
  platform: string | null;
  dueDate: string | null;
  status: 'todo' | 'done';
  postUrl: string | null;
}

export interface WsFile { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }

export const EXPENSE_CATEGORIES = ['production', 'travel', 'agency_fee', 'manager_fee', 'equipment', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export interface WsPayment { id: string; dealId: string; amount: number; currency: string; receivedOn: string; note: string | null }
export interface WsExpense { id: string; dealId: string | null; category: ExpenseCategory; amount: number; currency: string; spentOn: string; note: string | null }

export interface OwnDeal extends DealSummary {
  source: 'own';
  deliverables: WsDeliverable[];
  files: WsFile[];
  payments: WsPayment[];
  expenses: WsExpense[];
  received: number;
}
export interface PeakDeal extends DealSummary { source: 'peak'; assignment: Assignment }
export type DealDetail = OwnDeal | PeakDeal;

export interface WsContact {
  id: string;
  name: string;
  kind: ContactKind;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archived: boolean;
}

export interface WsContactPage extends WsContact {
  log: Array<{ id: string; body: string; createdAt: string }>;
  deals: DealSummary[];
}

export const dealStatusKey = (s: DealStatus) => `deal.status.${s}` as Key;
export const contactKindKey = (k: ContactKind) => `wsc.kind.${k}` as Key;

/** A Peak offer that waits for the influencer's yes or no. */
export const isOffer = (d: DealSummary) => d.source === 'peak' && d.status === 'lead';
const closed = (d: DealSummary) => d.status === 'paid' || d.status === 'cancelled';

/**
 * The order of the deals list: Peak offers waiting for an answer, then live
 * work by its soonest due date (undated after dated), then paid and cancelled.
 */
export function dealSort(deals: DealSummary[]): DealSummary[] {
  const rank = (d: DealSummary) => (isOffer(d) ? 0 : closed(d) ? (d.status === 'paid' ? 2 : 3) : 1);
  const due = (d: DealSummary) => d.nextDue?.dueDate ?? '9999-12-31';
  return [...deals].sort((a, b) => rank(a) - rank(b) || due(a).localeCompare(due(b)) || b.updatedAt.localeCompare(a.updatedAt));
}

export interface MoneySummary {
  year: number;
  currencies: Array<{ currency: string; received: number; owed: number; expenses: number; profit: number }>;
  months: Array<{ month: string; currency: string; received: number; expenses: number }>;
  byBrand: Array<{ brand: string | null; source: 'own' | 'peak'; currency: string; received: number }>;
  ledger: Array<{
    id: string; date: string; kind: 'payment' | 'expense' | 'peak_payout'; label: string; detail: string | null;
    amount: number; currency: string; dealId: string | null; deletable: boolean; status?: 'pending' | 'approved' | 'paid';
  }>;
  owedItems: Array<{ dealId: string; title: string; currency: string; owed: number; source: 'own' | 'peak' }>;
}

export interface CalendarItem {
  id: string; source: 'own' | 'peak'; title: string; dueDate: string; done: boolean; platform: string | null; dealId: string; dealTitle: string;
}
export interface CalendarData { from: string; to: string; items: CalendarItem[]; overdue: CalendarItem[] }

export const expenseCategoryKey = (c: ExpenseCategory) => `money.cat.${c}` as Key;

export const KIT_PLATFORMS = ['Instagram', 'TikTok', 'Snapchat', 'Facebook', 'YouTube', 'X', 'Other'] as const;
export interface KitStat { platform: string; handle: string | null; followers: number | null; engagementRate: number | null; verified: boolean; asOf: string | null }
export interface MediaKit {
  slug: string; published: boolean; headline: string | null; bio: string | null; contactEmail: string | null;
  featuredContactIds: string[]; manualStats: Array<{ platform: string; handle: string | null; followers: number | null; engagementRate: number | null }>;
  updatedAt: string | null; stats: KitStat[];
}
export interface PublicKit { name: string; headline: string | null; bio: string | null; contactEmail: string | null; brands: string[]; stats: KitStat[] }
