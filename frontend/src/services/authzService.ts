'use client';

/**
 * Roles, people and holding groups (backend authz/routes.ts and
 * authz/holding-routes.ts). Shapes follow the API as it answers; see the
 * Task 8 and Task 9 reports for the rules behind each refusal.
 */
import { apiFetch } from '@/lib/api-client';
import type { Label } from '@/lib/forbidden-message';
import type { Scope } from '@/lib/permissions';

export type { Label, Scope };
export type Level = 'none' | 'view' | 'edit' | 'full';
export type AreaGroup = 'operations' | 'finance' | 'crm' | 'hr' | 'core';

export interface CatalogueAction {
  /** Permission key, e.g. 'sales.view'. */
  key: string;
  /** The action part, e.g. 'view'. */
  action: string;
  label: Label;
  scoped: boolean;
  limit: 'amount' | 'percent' | null;
}

export interface CatalogueArea {
  key: string;
  label: Label;
  group: AreaGroup;
  scopes: Scope[];
  ownership: Label | null;
  actions: CatalogueAction[];
  /** Permission keys each preset level means in this area. */
  levels: Record<Level, string[]>;
}

export interface CatalogueField { key: string; label: Label; area: string }

export interface Catalogue {
  scopes: Array<{ key: Scope; label: Label }>;
  areas: CatalogueArea[];
  fields: CatalogueField[];
  templates: Array<{ key: string; label: Label }>;
}

export interface RoleGrant { key: string; scope?: Scope; limit?: number }
export interface RoleField { key: string; view: boolean; edit: boolean }

export type RoleKind = 'system' | 'group' | 'custom';

export interface Role {
  id: string;
  companyId: string | null;
  holdingGroupId: string | null;
  key: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  needsReview: boolean;
  templateKey: string | null;
  grants: RoleGrant[];
  fields: RoleField[];
  kind: RoleKind;
  readOnly: boolean;
  peopleCount: number;
}

export interface RoleHolder {
  userId: string;
  name: string | null;
  email: string | null;
  isMain: boolean;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface RoleDetail extends Role { people: RoleHolder[] }

export interface RoleInput {
  name: string;
  nameAr?: string | null;
  description?: string | null;
  templateKey?: string | null;
  grants: RoleGrant[];
  fields: RoleField[];
}

export interface RoleRef { id: string; key: string; name: string; nameAr: string | null; needsReview: boolean }

export interface Person {
  userId: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  mainRole: RoleRef | null;
  addOns: Array<RoleRef & { isActive: boolean }>;
  temporary: Array<RoleRef & { isActive: boolean; startsAt: string | null; endsAt: string | null; delegatedBy: string | null; reason: string | null }>;
  groupRoles: Array<{ holdingGroupId: string; groupName: string; key: string; name: string; isMain: boolean; startsAt: string | null; endsAt: string | null }>;
  viaGroup: { id: string; name: string } | null;
  readOnly: boolean;
  linkedToHr: boolean;
  summary: Label[];
}

export interface GrantSource {
  kind: 'main' | 'addon' | 'holding' | 'temporary';
  roleId: string;
  roleName: string;
  until?: string;
}

export interface PersonDetail extends Person {
  superAdmin?: boolean;
  grants: Array<{ key: string; label: Label; scope?: Scope; limit?: number; sources: GrantSource[] }>;
  fields: Array<{ key: string; label: Label; view: boolean; edit: boolean; sources: GrantSource[] }>;
}

export function fetchAuthzCatalogue() {
  return apiFetch<Catalogue>('/permissions/catalogue');
}

const company = (companyId: string) => `/companies/${encodeURIComponent(companyId)}`;

export const listRoles = (companyId: string) => apiFetch<Role[]>(`${company(companyId)}/roles`);
export const getRole = (companyId: string, id: string) =>
  apiFetch<RoleDetail>(`${company(companyId)}/roles/${encodeURIComponent(id)}`);
export const saveRole = (companyId: string, id: string, input: RoleInput) =>
  apiFetch<Role>(`${company(companyId)}/roles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
export const deleteRole = (companyId: string, id: string) =>
  apiFetch<void>(`${company(companyId)}/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const duplicateRole = (companyId: string, id: string, body: { name?: string; nameAr?: string } = {}) =>
  apiFetch<Role>(`${company(companyId)}/roles/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: JSON.stringify(body) });
export const activateRole = (companyId: string, id: string) =>
  apiFetch<Role>(`${company(companyId)}/roles/${encodeURIComponent(id)}/activate`, { method: 'POST' });

export const listPeople = (companyId: string) => apiFetch<Person[]>(`${company(companyId)}/people`);
export const getPerson = (companyId: string, userId: string) =>
  apiFetch<PersonDetail>(`${company(companyId)}/people/${encodeURIComponent(userId)}`);
export const setPersonRoles = (companyId: string, userId: string, body: { mainRoleId: string; addOnRoleIds: string[] }) =>
  apiFetch<Person>(`${company(companyId)}/people/${encodeURIComponent(userId)}/roles`, { method: 'PUT', body: JSON.stringify(body) });

// ── Holding groups ────────────────────────────────────────────────────

export interface HoldingGroup {
  id: string;
  name: string;
  nameAr: string | null;
  createdAt: string;
  companyIds: string[];
  adminUserIds: string[];
}

export interface HoldingTemplate {
  key: string;
  /** 'system': a standard template the group has not edited; 'group': the group's own version. */
  source: 'system' | 'group';
  roleId: string | null;
  name: string;
  nameAr: string | null;
  description: string | null;
  grants: RoleGrant[];
  fields: RoleField[];
}

export interface HoldingPerson { id: string; name: string | null; email: string | null }

export interface HoldingAssignment {
  holdingGroupId: string;
  userId: string;
  roleKey: string;
  isMain: boolean;
  startsAt: string | null;
  endsAt: string | null;
  user: HoldingPerson;
}

export interface HoldingGroupDetail extends HoldingGroup {
  companies: Array<{ id: string; name: string | null }>;
  admins: HoldingPerson[];
  assignments: HoldingAssignment[];
  templates: HoldingTemplate[];
}

export interface PushRow { companyId: string; roleId: string; roleKey: string; roleName: string; message?: string }
export interface PushResult { updated: PushRow[]; customised: PushRow[]; standard: PushRow[] }

const holding = (id: string) => `/holding-groups/${encodeURIComponent(id)}`;

export const listHoldingGroups = () => apiFetch<HoldingGroup[]>('/holding-groups');
export const getHoldingGroup = (id: string) => apiFetch<HoldingGroupDetail>(holding(id));
export const setHoldingAssignment = (
  id: string,
  userId: string,
  body: { roleKey: string | null; addOnKeys: string[]; startsAt?: string | null; endsAt?: string | null },
) => apiFetch<HoldingGroupDetail>(`${holding(id)}/assignments/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify(body) });
export const getHoldingTemplate = (id: string, key: string) =>
  apiFetch<HoldingTemplate>(`${holding(id)}/templates/${encodeURIComponent(key)}`);
export const saveHoldingTemplate = (id: string, key: string, input: RoleInput) =>
  apiFetch<HoldingTemplate>(`${holding(id)}/templates/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) });
export const pushHoldingTemplate = (id: string, key: string) =>
  apiFetch<PushResult>(`${holding(id)}/templates/${encodeURIComponent(key)}/push`, { method: 'POST' });
