'use client';

import { apiFetch } from '@/lib/api-client';

export interface PermissionModule {
  key: string;
  labelKey: string;
  group: 'operations' | 'finance' | 'crm' | 'hr' | 'core';
  actions: string[];
}

export interface PermissionGroup {
  id: string;
  companyId: string;
  key: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  impliedGroupIds: string[];
  memberCount: number;
}

export interface PermissionFeed {
  /** The engine that decides access. The UI follows `permissions` only under openfga. */
  engine?: 'legacy' | 'shadow' | 'openfga';
  version: number;
  companyId: string;
  permissions: string[];
}

export function fetchMyPermissions(companyId: string) {
  return apiFetch<PermissionFeed>(`/auth/permissions?companyId=${encodeURIComponent(companyId)}`);
}

export function fetchCatalogue() {
  return apiFetch<{ modules: PermissionModule[] }>('/permissions/catalogue');
}

export function fetchPermissionGroups(companyId: string) {
  return apiFetch<PermissionGroup[]>(`/companies/${companyId}/permission-groups`);
}

export function createPermissionGroup(
  companyId: string,
  body: { name: string; nameAr?: string; description?: string },
) {
  return apiFetch<PermissionGroup>(`/companies/${companyId}/permission-groups`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePermissionGroup(
  groupId: string,
  body: { name?: string; nameAr?: string; description?: string },
) {
  return apiFetch<PermissionGroup>(`/permission-groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deletePermissionGroup(groupId: string) {
  return apiFetch<void>(`/permission-groups/${groupId}`, {
    method: 'DELETE',
  });
}

export function setGroupPermissions(groupId: string, permissions: string[]) {
  return apiFetch<{ permissions: string[] }>(`/permission-groups/${groupId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
}

export function setGroupImplications(groupId: string, impliedGroupIds: string[]) {
  return apiFetch<{ impliedGroupIds: string[] }>(`/permission-groups/${groupId}/implications`, {
    method: 'PUT',
    body: JSON.stringify({ impliedGroupIds }),
  });
}

export function fetchUserGroups(companyId: string, userId: string) {
  return apiFetch<{ groups: PermissionGroup[]; effectivePermissions: string[] }>(
    `/companies/${companyId}/users/${userId}/groups`,
  );
}

export function setUserGroups(companyId: string, userId: string, groupIds: string[]) {
  return apiFetch<{ groups: PermissionGroup[] }>(`/companies/${companyId}/users/${userId}/groups`, {
    method: 'PUT',
    body: JSON.stringify({ groupIds }),
  });
}
