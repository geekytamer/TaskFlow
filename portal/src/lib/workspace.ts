import { portalGet, portalGetOrNull } from './client-api';
import type { DealDetail, DealSummary, WsContact, WsContactPage } from './workspace-types';

export * from './workspace-types';

export const getDeals = (source?: 'own' | 'peak') => portalGet<DealSummary[]>(`/workspace/deals${source ? `?source=${source}` : ''}`);
export const getDeal = (id: string) => portalGetOrNull<DealDetail>(`/workspace/deals/${encodeURIComponent(id)}`);
export const getContacts = () => portalGet<WsContact[]>('/workspace/contacts');
export const getContact = (id: string) => portalGetOrNull<WsContactPage>(`/workspace/contacts/${encodeURIComponent(id)}`);
export const getWorkspaceSettings = () => portalGet<{ defaultCurrency: string }>('/workspace/settings');
