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

export interface OwnDeal extends DealSummary { source: 'own'; deliverables: WsDeliverable[]; files: WsFile[] }
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
