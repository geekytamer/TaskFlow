import { apiFetch } from '@/lib/api-client';

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
