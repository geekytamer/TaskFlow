/**
 * The canonical list of grantable permissions.
 *
 * GENERATED from docs/superpowers/plans/gate-matrix.csv, which is extracted
 * from the gates in server.ts. Regenerate rather than editing by hand.
 *
 * It lives in code, not the database, on purpose: if administrators could
 * invent permissions they would create ones no route enforces, and the UI
 * would promise security it does not deliver. The database stores *grants*;
 * this file owns what is *grantable*.
 *
 * Some actions are qualified with a sub-resource, e.g. `settings:users.read`
 * beside `settings:read`. That happens where the underlying routes disagree
 * about which roles may use them: granting the union would widen access and
 * the intersection would revoke it, so the permission is split instead. See
 * splitConflictingPermissions in scripts/extract-gates.ts.
 *
 * projects and tasks have no plain read action. Their reads are decided per
 * record by requireProjectViewAccess / canViewTask; `all.read` (a record rule)
 * decides whether someone sees every record or only their own.
 */

import { RECORD_RULES } from './record-rules';

export type ModuleGroup = 'operations' | 'finance' | 'crm' | 'hr' | 'core';

export interface PermissionModule {
  key: string;
  labelKey: string;
  group: ModuleGroup;
  actions: readonly string[];
}

const GATE_MODULES: readonly PermissionModule[] = [
  // ── Operations ───────────────────────────────────────
  {
    key: 'dashboard',
    labelKey: 'perm.module.dashboard',
    group: 'operations',
    actions: ["read"],
  },
  {
    key: 'inventory',
    labelKey: 'perm.module.inventory',
    group: 'operations',
    actions: ["create","delete","post","read","stock-counts.delete","stock-counts.write","warehouses.create","write"],
  },
  {
    key: 'manufacturing',
    labelKey: 'perm.module.manufacturing',
    group: 'operations',
    actions: ["cancel","create","delete","read","write"],
  },
  {
    key: 'projects',
    labelKey: 'perm.module.projects',
    group: 'operations',
    actions: ["create","delete","write"],
  },
  {
    key: 'purchasing',
    labelKey: 'perm.module.purchasing',
    group: 'operations',
    actions: ["approve","create","delete","purchase-orders.reject.create","purchase-requisitions.reject.create","read","write"],
  },
  {
    key: 'sales',
    labelKey: 'perm.module.sales',
    group: 'operations',
    actions: ["cancel","create","deliveries.pdf.read","read","write"],
  },
  {
    key: 'tasks',
    labelKey: 'perm.module.tasks',
    group: 'operations',
    actions: ["tasks.create","write"],
  },
  // ── Finance ───────────────────────────────────────
  {
    key: 'commissions',
    labelKey: 'perm.module.commissions',
    group: 'finance',
    actions: ["approve","create","delete","read","void","write"],
  },
  {
    key: 'finance',
    labelKey: 'perm.module.finance',
    group: 'finance',
    actions: ["create","delete","finance.settings.read","finance.settings.write","read","write"],
  },
  {
    key: 'invoices',
    labelKey: 'perm.module.invoices',
    group: 'finance',
    actions: ["create","delete","invoices.pdf.read","pay","read","write"],
  },
  {
    key: 'vendor-bills',
    labelKey: 'perm.module.vendorBills',
    group: 'finance',
    actions: ["create","delete","pay","read","write"],
  },
  // ── Crm ───────────────────────────────────────
  {
    key: 'campaigns',
    labelKey: 'perm.module.campaigns',
    group: 'crm',
    actions: ["campaigns.delete","campaigns.generate-invoice.create","campaigns.sync-invoice.create","create","delete","read","write"],
  },
  {
    key: 'contacts',
    labelKey: 'perm.module.contacts',
    group: 'crm',
    actions: ["clients.read","contacts.activities.read","contacts.create","contacts.read","contacts.write","create","delete","read","suppliers.read","write"],
  },
  {
    key: 'crm',
    labelKey: 'perm.module.crm',
    group: 'crm',
    actions: ["contributions.create","contributions.delete","create","crm-performance.read","delete","followups.bulk-reassign.create","followups.coverage-gaps.read","followups.sweep-overdue.create","followups.workload.read","opportunities.commissions.recalculate.create","read","vendor-requests.status.write","write"],
  },
  {
    key: 'whatsapp',
    labelKey: 'perm.module.whatsapp',
    group: 'crm',
    actions: ["create","delete","read","send","whatsapp.chats.read","whatsapp.chats.settings.read","whatsapp.chats.settings.write","whatsapp.configure-webhook.create","whatsapp.logout.create","whatsapp.messages.read","write"],
  },
  // ── Hr ───────────────────────────────────────
  {
    key: 'hr',
    labelKey: 'perm.module.hr',
    group: 'hr',
    actions: ["attendance.read","create","delete","hr.gratuity.read","read","write"],
  },
  {
    key: 'payroll',
    labelKey: 'perm.module.payroll',
    group: 'hr',
    actions: ["create","delete","read","write"],
  },
  // ── Core ───────────────────────────────────────
  {
    key: 'documents',
    labelKey: 'perm.module.documents',
    group: 'core',
    actions: ["create","delete","read","write"],
  },
  {
    key: 'settings',
    labelKey: 'perm.module.settings',
    group: 'core',
    actions: ["activity-events.read","companies.read","custom-fields.create","custom-fields.delete","custom-fields.read","members.read","numbering-settings.read","users.read","write"],
  },
] as const;

/**
 * Gate-derived modules with the record-rule actions merged in. See
 * permissions/record-rules.ts: those rules sit inside handlers, where the gate
 * extractor cannot see them.
 */
export const MODULES: readonly PermissionModule[] = GATE_MODULES.map((module) => {
  const extra = Object.values(RECORD_RULES)
    .filter((rule) => rule.module === module.key)
    .map((rule) => rule.action);
  return extra.length ? { ...module, actions: [...module.actions, ...extra].sort() } : module;
});

const INDEX = new Map(MODULES.map((m) => [m.key, new Set(m.actions)]));

export function isValidPermission(module: string, action: string): boolean {
  return INDEX.get(module)?.has(action) ?? false;
}

export function permissionKey(module: string, action: string): string {
  return `${module}:${action}`;
}

export function allPermissions(): string[] {
  return MODULES.flatMap((m) => m.actions.map((a) => permissionKey(m.key, a)));
}
