import { apiFetch } from '@/lib/api-client';

/** An influencer's own business, as staff see it on their contact page. */
export interface InfluencerWorkspace {
  contacts: Array<{ id: string; name: string; kind: 'brand' | 'agency' | 'manager' | 'other'; company: string | null; email: string | null; phone: string | null; peakContactId: string | null; archived: boolean }>;
  deals: Array<{ id: string; title: string; brandId: string | null; brandName: string | null; amount: number | null; currency: string; status: 'lead' | 'confirmed' | 'delivered' | 'paid' | 'cancelled'; startDate: string | null; endDate: string | null }>;
  byBrand: Array<{ brandId: string | null; brandName: string | null; currency: string; total: number; deals: number }>;
  lastActivityAt: string | null;
}

export const getInfluencerWorkspace = (contactId: string) => apiFetch<InfluencerWorkspace>(`/contacts/${contactId}/workspace`);
export const makePeakContact = (contactId: string, wsContactId: string) =>
  apiFetch<{ peakContactId: string }>(`/contacts/${contactId}/workspace/contacts/${wsContactId}/peak-contact`, { method: 'POST' });
