import { apiFetch } from '@/lib/api-client';

/** Everyone in a group (stage 3 of the group-as-company spec). */
export interface GroupPerson {
  id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  email: string;
  avatar?: string;
  memberships: Array<{ companyId: string; role: string; positionId?: string }>;
  /** The HR record the login is linked to, within the group; null when none. */
  employer: { companyId: string; employeeId: string } | null;
}

export interface GroupPeople {
  companies: Array<{ id: string; name: string }>;
  /** Companies of the group where I may change people's access. */
  manageable: string[];
  people: GroupPerson[];
}

export const getGroupPeople = (groupCompanyId: string) =>
  apiFetch<GroupPeople>(`/companies/${encodeURIComponent(groupCompanyId)}/group-people`);

/** Gives, changes (a role) or ends (null) a person's access in one company of the group. */
export const setGroupAccess = (groupCompanyId: string, userId: string, companyId: string, role: string | null) =>
  apiFetch(`/companies/${encodeURIComponent(groupCompanyId)}/group-people/${encodeURIComponent(userId)}/access`, {
    method: 'PUT',
    body: JSON.stringify({ companyId, role }),
  });

/** Ends a person's access in every company of the group I manage. */
export const removeFromGroup = (groupCompanyId: string, userId: string) =>
  apiFetch(`/companies/${encodeURIComponent(groupCompanyId)}/group-people/${encodeURIComponent(userId)}/remove`, { method: 'POST' });
