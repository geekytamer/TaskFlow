import { apiFetch } from '@/lib/api-client';
import type { FlexiBalance, StaffFlexiApplication } from '@/services/portalAccessService';

export type FlexiState = 'active' | 'frozen' | 'closed';

export interface FlexiAccount {
  contactId: string;
  name: string;
  currency: string;
  balance: number;
  used: number;
  available: number;
  usedPct: number;
  upfrontPct: number;
  maxMonths: number;
  state: FlexiState | null;
  since: string | null;
}

export interface FlexiEvent {
  id: string;
  kind: 'applied' | 'approved' | 'rejected' | 'withdrawn' | 'adjusted' | 'frozen' | 'unfrozen' | 'closed' | 'terms_accepted';
  amountBefore: number | null;
  amountAfter: number | null;
  upfrontPct: number | null;
  maxMonths: number | null;
  note: string | null;
  actorUserId: string | null;
  actorPortalUserId: string | null;
  actorName: string | null;
  applicationId: string | null;
  createdAt: string;
}

export interface FlexiRequest {
  id: string;
  contactId: string;
  clientName: string;
  title: string;
  budget: number | null;
  payWith: 'full' | 'flexi';
  currency: string;
  available: number;
  accountState: FlexiState | null;
  flag: 'over_budget' | 'no_account' | null;
  createdAt: string;
}

export interface FlexiOverview {
  currency: string;
  totals: { balance: number; used: number; available: number; active: number; frozen: number; waiting: number };
  alerts: {
    staleApplications: Array<{ id: string; contactId: string; contactName: string; kind: 'activation' | 'increase'; createdAt: string }>;
    nearLimit: FlexiAccount[];
    frozen: FlexiAccount[];
    overBudgetRequests: FlexiRequest[];
  };
}

export interface FlexiAccountFile {
  account: FlexiAccount;
  currency: string;
  events: FlexiEvent[];
  applications: StaffFlexiApplication[];
  openInvoices: Array<{ id: string; number: string; outstanding: number; dueDate: string }>;
  requests: FlexiRequest[];
}

export interface FlexiLead {
  contactId: string;
  company: string;
  person: string | null;
  phone: string | null;
  email: string | null;
  crNumber: string | null;
  services: string | null;
  role: string | null;
  createdAt: string;
}

export interface FlexiSettings {
  standardAmount: number;
  defaultUpfrontPct: number;
  allowedMonths: number[];
  activationMonths: number;
  increaseMonths: number;
  termsVersion: number;
  termsAr: string;
  termsEn: string;
  updatedAt: string | null;
}

const base = (companyId: string) => `/companies/${companyId}/flexi`;
const post = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const getFlexiOverview = (companyId: string) => apiFetch<FlexiOverview>(`${base(companyId)}/overview`);
export const listFlexiAccounts = (companyId: string, state?: FlexiState) =>
  apiFetch<FlexiAccount[]>(`${base(companyId)}/accounts${state ? `?state=${state}` : ''}`);
export const getFlexiAccount = (companyId: string, contactId: string) =>
  apiFetch<FlexiAccountFile>(`${base(companyId)}/accounts/${encodeURIComponent(contactId)}`);
export const adjustFlexiAccount = (companyId: string, contactId: string, body: { amount?: number; upfrontPct?: number; maxMonths?: number; reason: string }) =>
  post<FlexiAccount>(`${base(companyId)}/accounts/${encodeURIComponent(contactId)}/adjust`, body);
export const setFlexiAccountState = (companyId: string, contactId: string, action: 'freeze' | 'unfreeze' | 'close', reason: string) =>
  post<FlexiAccount>(`${base(companyId)}/accounts/${encodeURIComponent(contactId)}/${action}`, { reason });
export const listFlexiRequests = (companyId: string) => apiFetch<FlexiRequest[]>(`${base(companyId)}/requests`);
export const listFlexiLeads = (companyId: string) => apiFetch<FlexiLead[]>(`${base(companyId)}/leads`);
export const inviteFlexiLead = (companyId: string, contactId: string) =>
  post<{ userId: string; emailSent: boolean; inviteLink: string }>(`${base(companyId)}/leads/${encodeURIComponent(contactId)}/invite`, {});
export const getFlexiSettings = (companyId: string) => apiFetch<FlexiSettings>(`${base(companyId)}/settings`);
export const saveFlexiSettings = (companyId: string, body: Partial<Omit<FlexiSettings, 'termsVersion' | 'updatedAt'>>) =>
  apiFetch<FlexiSettings>(`${base(companyId)}/settings`, { method: 'PUT', body: JSON.stringify(body) });

export type { FlexiBalance };
