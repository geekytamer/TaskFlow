import type { ClientAnalytics, InfluencerAnalytics } from './analytics-types';
import { portalGet } from './client-api';

export const RANGES = ['30d', '90d', 'year', 'all'] as const;
export type Range = (typeof RANGES)[number];

export const parseRange = (value: unknown): Range => (RANGES as readonly string[]).includes(String(value)) ? (value as Range) : '90d';

/** The `from` date (YYYY-MM-DD) for a preset, counted back from `now`; null for all time. */
export function rangeFrom(range: Range, now = new Date()): string | null {
  if (range === 'all') return null;
  if (range === 'year') return `${now.getUTCFullYear()}-01-01`;
  const days = range === '30d' ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

const query = (range: Range, campaign?: string) => {
  const q = new URLSearchParams();
  const from = rangeFrom(range);
  if (from) q.set('from', from);
  if (campaign && /^[\w-]{1,64}$/.test(campaign)) q.set('campaign', campaign);
  const text = q.toString();
  return text ? `?${text}` : '';
};

export const getClientAnalytics = (range: Range, campaign?: string) => portalGet<ClientAnalytics>(`/analytics${query(range, campaign)}`);
export const getInfluencerAnalytics = (range: Range) => portalGet<InfluencerAnalytics>(`/analytics${query(range)}`);
