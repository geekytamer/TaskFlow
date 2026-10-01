import { API_BASE_URL, apiFetch, getStoredToken } from '@/lib/api-client';

export type PortalAudience = 'client' | 'influencer';
export type PortalRole = 'client_admin' | 'client_member' | 'influencer';
export type PortalUserStatus = 'invited' | 'active' | 'disabled';

export interface PortalUser {
  id: string;
  companyId: string;
  audience: PortalAudience;
  contactId: string;
  email: string;
  name: string;
  role: PortalRole;
  status: PortalUserStatus;
  lastLoginAt?: string;
  createdAt: string;
}

export interface PortalInviteResult {
  user: PortalUser;
  inviteLink: string;
  emailSent: boolean;
  emailError?: string;
}

const base = (companyId: string) => `/companies/${companyId}/portal-users`;

export const listPortalUsers = (companyId: string, params: { audience: PortalAudience; contactId: string }) =>
  apiFetch<PortalUser[]>(`${base(companyId)}?${new URLSearchParams(params)}`);

export const invitePortalUser = (
  companyId: string,
  body: { audience: PortalAudience; contactId: string; email: string; name: string; role?: PortalRole },
) => apiFetch<PortalInviteResult>(base(companyId), { method: 'POST', body: JSON.stringify(body) });

export const reinvitePortalUser = (companyId: string, id: string) =>
  apiFetch<PortalInviteResult>(`${base(companyId)}/${id}/reinvite`, { method: 'POST' });

export const setPortalUserDisabled = (companyId: string, id: string, disabled: boolean) =>
  apiFetch<PortalUser>(`${base(companyId)}/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' });

export type PricingMode = 'markup' | 'retainer';

export interface PricingProfile {
  contactId: string;
  mode: PricingMode;
  markupPercent: number | null;
  updatedAt: string;
}

export const listPortalCatalogue = (companyId: string) =>
  apiFetch<string[]>(`/companies/${companyId}/portal-catalogue`);

export const setPortalListing = (companyId: string, contactId: string, listed: boolean) =>
  apiFetch<{ contactId: string; listed: boolean }>(`/companies/${companyId}/portal-catalogue/${contactId}`, {
    method: listed ? 'PUT' : 'DELETE',
  });

export const getPricingProfile = (companyId: string, contactId: string) =>
  apiFetch<PricingProfile | null>(`/companies/${companyId}/pricing-profiles/${contactId}`);

export const savePricingProfile = (
  companyId: string,
  contactId: string,
  body: { mode: PricingMode; markupPercent?: number },
) =>
  apiFetch<PricingProfile>(`/companies/${companyId}/pricing-profiles/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export interface PortalFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface PortalMessage {
  id: string;
  body: string;
  author: { type: 'staff' | 'portal'; name: string | null };
  files: PortalFile[];
  createdAt: string;
}

const thread = (companyId: string, contactId: string) => `/companies/${companyId}/contacts/${contactId}`;

export const getPortalThread = (companyId: string, contactId: string) =>
  apiFetch<{ messages: PortalMessage[]; files: PortalFile[] }>(`${thread(companyId, contactId)}/messages`);

export const sendPortalMessage = (companyId: string, contactId: string, body: { body: string; fileIds: string[] }) =>
  apiFetch<PortalMessage>(`${thread(companyId, contactId)}/messages`, { method: 'POST', body: JSON.stringify(body) });

export const uploadPortalFile = (companyId: string, contactId: string, body: { fileName: string; contentBase64: string }) =>
  apiFetch<PortalFile>(`${thread(companyId, contactId)}/files`, { method: 'POST', body: JSON.stringify(body) });

/**
 * Saves a portal file to disk. The bytes come from someone outside the
 * company, so they are never opened in a tab: the blob is only ever the target
 * of a download link.
 */
export async function downloadPortalFile(companyId: string, file: Pick<PortalFile, 'id' | 'fileName'>) {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}/portal-files/${file.id}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export type ReferralStatus = 'submitted' | 'converted' | 'declined';
export type CommissionBasis = 'percent' | 'fixed';
export type PayoutType = 'vendor_bill' | 'credit_note';

export interface CommissionTerms {
  basis: CommissionBasis;
  ratePercent?: number | null;
  fixedAmount?: number | null;
  payoutType: PayoutType;
}

export interface StaffReferral {
  id: string;
  prospectName: string;
  prospectContact: string;
  description: string;
  estimatedValue: number | null;
  currency: string;
  status: ReferralStatus;
  staffNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  referrer: { id: string; name: string | null; roles: string[] };
  submittedBy: string | null;
  reviewedBy: string | null;
  opportunity: { id: string; title: string; stage: string; expectedRevenue: number } | null;
  commission: (Required<CommissionTerms> & {
    status: 'pending' | 'approved' | 'paid' | 'voided';
    amount: number | null;
    payoutRefId: string | null;
  }) | null;
}

const referrals = (companyId: string) => `/companies/${companyId}/portal-referrals`;
const post = <T>(path: string, body: unknown = {}) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const listReferrals = (companyId: string) => apiFetch<StaffReferral[]>(referrals(companyId));

export const declineReferral = (companyId: string, id: string, staffNote: string) =>
  post<StaffReferral>(`${referrals(companyId)}/${id}/decline`, { staffNote });

export const convertReferral = (
  companyId: string,
  id: string,
  body: { expectedRevenue?: number; title?: string; staffNote?: string; commission?: CommissionTerms },
) => post<StaffReferral>(`${referrals(companyId)}/${id}/convert`, body);

export const setReferralCommission = (companyId: string, id: string, terms: CommissionTerms) =>
  apiFetch<StaffReferral>(`${referrals(companyId)}/${id}/commission`, { method: 'PUT', body: JSON.stringify(terms) });

export const approveReferralCommission = (companyId: string, id: string) =>
  post<StaffReferral>(`${referrals(companyId)}/${id}/commission/approve`);

export const voidReferralCommission = (companyId: string, id: string) =>
  post<StaffReferral>(`${referrals(companyId)}/${id}/commission/void`);

export const linkCommissionCreditNote = (companyId: string, id: string, creditNoteNumber: string) =>
  post<StaffReferral>(`${referrals(companyId)}/${id}/commission/credit-note`, { creditNoteNumber });
