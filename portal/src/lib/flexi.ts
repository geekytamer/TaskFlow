import { portalGet } from './client-api';
import type { PortalFile } from './files';

/**
 * The client's Peak Flexi balance and their latest application. The balance
 * is what PEAK approved; used is what the client owes today.
 */

export type FlexiKind = 'activation' | 'increase';
export type FlexiStatus = 'new' | 'approved' | 'rejected' | 'withdrawn';

export interface FlexiApplication {
  id: string;
  kind: FlexiKind;
  status: FlexiStatus;
  requestedAmount: number | null;
  approvedAmount: number | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  files: PortalFile[];
}

export interface FlexiData {
  balance: { enabled: boolean; state: 'active' | 'frozen' | 'closed' | null; balance: number; used: number; available: number; upfrontPct: number; maxMonths: number };
  currency: string;
  open: FlexiApplication | null;
  last: FlexiApplication | null;
  /** The terms the client must accept to apply; the version goes back with the application. */
  terms: { version: number; ar: string; en: string };
  standardAmount: number;
}

export type FlexiCardState = 'none' | 'pending' | 'enabled' | 'frozen' | 'rejected';

export const FLEXI_STANDARD = 850;

/** Which face of the home card to show. An enabled balance always wins; an open increase shows inside it. */
export function flexiCardState(data: FlexiData): FlexiCardState {
  if (data.balance.enabled) return data.balance.state === 'frozen' ? 'frozen' : 'enabled';
  if (data.open) return 'pending';
  if (data.last?.status === 'rejected') return 'rejected';
  return 'none';
}

export const getFlexi = () => portalGet<FlexiData>('/flexi');
