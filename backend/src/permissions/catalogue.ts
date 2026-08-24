/**
 * The canonical list of grantable permissions.
 *
 * Generated from docs/superpowers/plans/gate-matrix.csv, which is itself
 * extracted from the gates in server.ts. It lives in code rather than the
 * database on purpose: if administrators could invent permissions, they would
 * create ones no route enforces, and the UI would promise security it does not
 * deliver. The database stores *grants*; this file owns what is *grantable*.
 *
 * Note that `projects` and `tasks` have no `read` action. Read access to those
 * is decided per-record by requireProjectViewAccess / canViewTask, not by
 * group membership, so exposing a group-level read checkbox for them would be
 * a lie. See the design doc's non-goals.
 */

export type ModuleGroup = 'operations' | 'finance' | 'crm' | 'hr' | 'core';

export interface PermissionModule {
  key: string;
  labelKey: string;
  group: ModuleGroup;
  actions: readonly string[];
}

const CRUD = ['read', 'create', 'write', 'delete'] as const;

export const MODULES: readonly PermissionModule[] = [
  // ── Operations ───────────────────────────────────────────────────
  { key: 'dashboard',     labelKey: 'perm.module.dashboard',     group: 'operations', actions: ['read'] },
  { key: 'projects',      labelKey: 'perm.module.projects',      group: 'operations', actions: ['create', 'write', 'delete'] },
  { key: 'tasks',         labelKey: 'perm.module.tasks',         group: 'operations', actions: ['create', 'write'] },
  { key: 'inventory',     labelKey: 'perm.module.inventory',     group: 'operations', actions: [...CRUD, 'post'] },
  { key: 'manufacturing', labelKey: 'perm.module.manufacturing', group: 'operations', actions: [...CRUD, 'cancel'] },
  { key: 'purchasing',    labelKey: 'perm.module.purchasing',    group: 'operations', actions: [...CRUD, 'approve'] },
  { key: 'sales',         labelKey: 'perm.module.sales',         group: 'operations', actions: ['read', 'create', 'write', 'cancel'] },

  // ── Finance ──────────────────────────────────────────────────────
  { key: 'finance',       labelKey: 'perm.module.finance',       group: 'finance',    actions: CRUD },
  { key: 'invoices',      labelKey: 'perm.module.invoices',      group: 'finance',    actions: [...CRUD, 'pay'] },
  { key: 'vendor-bills',  labelKey: 'perm.module.vendorBills',   group: 'finance',    actions: [...CRUD, 'pay'] },
  { key: 'commissions',   labelKey: 'perm.module.commissions',   group: 'finance',    actions: [...CRUD, 'approve', 'void'] },

  // ── CRM ──────────────────────────────────────────────────────────
  { key: 'crm',           labelKey: 'perm.module.crm',           group: 'crm',        actions: CRUD },
  { key: 'contacts',      labelKey: 'perm.module.contacts',      group: 'crm',        actions: CRUD },
  { key: 'campaigns',     labelKey: 'perm.module.campaigns',     group: 'crm',        actions: CRUD },
  { key: 'whatsapp',      labelKey: 'perm.module.whatsapp',      group: 'crm',        actions: [...CRUD, 'send'] },

  // ── HR ───────────────────────────────────────────────────────────
  { key: 'hr',            labelKey: 'perm.module.hr',            group: 'hr',         actions: CRUD },
  { key: 'payroll',       labelKey: 'perm.module.payroll',       group: 'hr',         actions: CRUD },

  // ── Core ─────────────────────────────────────────────────────────
  { key: 'documents',     labelKey: 'perm.module.documents',     group: 'core',       actions: CRUD },
  { key: 'settings',      labelKey: 'perm.module.settings',      group: 'core',       actions: CRUD },
] as const;

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
