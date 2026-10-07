import { portalGet, portalGetOrNull } from './client-api';
import type { MediaKit, CalendarData, DealDetail, DealSummary, MoneySummary, WsContact, WsContactPage, WsExpense } from './workspace-types';

export * from './workspace-types';

export const getDeals = (source?: 'own' | 'peak') => portalGet<DealSummary[]>(`/workspace/deals${source ? `?source=${source}` : ''}`);
export const getDeal = (id: string) => portalGetOrNull<DealDetail>(`/workspace/deals/${encodeURIComponent(id)}`);
export const getContacts = () => portalGet<WsContact[]>('/workspace/contacts');
export const getContact = (id: string) => portalGetOrNull<WsContactPage>(`/workspace/contacts/${encodeURIComponent(id)}`);
export const getWorkspaceSettings = () => portalGet<{ defaultCurrency: string }>('/workspace/settings');
export const getMoney = (year: number) => portalGet<MoneySummary>(`/workspace/money?year=${year}`);
export const getExpenses = () => portalGet<WsExpense[]>('/workspace/expenses');
export const getCalendar = (from: string, to: string) => portalGet<CalendarData>(`/workspace/calendar?from=${from}&to=${to}`);
export const getMediaKit = () => portalGet<MediaKit>('/workspace/media-kit');
