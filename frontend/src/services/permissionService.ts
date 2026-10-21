'use client';

import { apiFetch } from '@/lib/api-client';
import type { MyPermissions } from '@/lib/permissions';
import type { Label } from '@/lib/forbidden-message';

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

/** What the signed-in person may do in a company (GET /me/permissions). */
export function fetchMyPermissions(companyId: string) {
  return apiFetch<MyPermissions>(`/me/permissions?companyId=${encodeURIComponent(companyId)}`);
}

/** GET /permissions/catalogue: the new areas and keys, plus the legacy modules today's permissions page still reads. */
export interface PermissionCatalogue {
  areas: Array<{ key: string; label: Label; actions: Array<{ key: string; action: string; label: Label }> }>;
  fields: Array<{ key: string; label: Label; area: string }>;
  modules: PermissionModule[];
  alwaysOnModules?: string[];
}

export function fetchCatalogue() {
  return apiFetch<PermissionCatalogue>('/permissions/catalogue');
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
