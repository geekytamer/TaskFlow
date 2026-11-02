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

/** A business area of company modules, as the owner chooses them. */
export interface ModuleArea {
  key: string;
  modules: string[];
}

/** A starting set of modules for a kind of company, as the modules it leaves off. */
export interface ModulePreset {
  key: string;
  disabledModules: string[];
}

/** What the signed-in person may do in a company (GET /me/permissions). */
export function fetchMyPermissions(companyId: string) {
  return apiFetch<MyPermissions>(`/me/permissions?companyId=${encodeURIComponent(companyId)}`);
}

/** GET /permissions/catalogue: areas and keys (full shape: services/authzService.ts), plus the legacy modules the company-modules field still reads. */
export interface PermissionCatalogue {
  areas: Array<{ key: string; label: Label; actions: Array<{ key: string; action: string; label: Label }> }>;
  fields: Array<{ key: string; label: Label; area: string }>;
  modules: PermissionModule[];
  alwaysOnModules?: string[];
  featureModules?: string[];
  moduleAreas?: ModuleArea[];
  modulePresets?: ModulePreset[];
}

export function fetchCatalogue() {
  return apiFetch<PermissionCatalogue>('/permissions/catalogue');
}
