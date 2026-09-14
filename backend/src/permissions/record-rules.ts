import type { UserRole } from '../types';

/**
 * Record-level rules that used to be decided by the role alone.
 *
 * The module gates in server.ts map to permissions through the gate matrix.
 * These rules live inside handlers instead — who sees every project rather
 * than their own, who sees contact pricing, which dashboard someone gets — so
 * the gate extractor cannot find them. Each is declared once here, merged into
 * the catalogue and the built-in groups' seed grants, and checked in server.ts
 * through allowsRule, which falls back to `roles` under the legacy engine.
 *
 * `roles` is exactly who held the rule before it became a permission. Changing
 * it changes what the built-in groups grant.
 *
 * Adding or renaming a rule needs a new migration that grants it to existing
 * built-in groups. Seeding only grants defaults to groups it creates, so without
 * one, every company that already exists would silently lack the new rule.
 */
export interface RecordRule {
  module: string;
  action: string;
  roles: readonly UserRole[];
  description: string;
}

const MANAGEMENT = ['Admin', 'Manager', 'Accountant'] as const;

export const RECORD_RULES = {
  PROJECTS_ALL_READ: {
    module: 'projects', action: 'all.read', roles: MANAGEMENT,
    description: 'See every project, not only public ones and those they belong to.',
  },
  TASKS_ALL_READ: {
    module: 'tasks', action: 'all.read', roles: MANAGEMENT,
    description: 'See every task, not only those assigned to them or in projects they can see.',
  },
  TIME_ENTRIES_DELETE_OTHERS: {
    module: 'tasks', action: 'time-entries.delete', roles: ['Admin', 'Manager'],
    description: "Delete other people's time entries.",
  },
  CONTACTS_PRIVATE_READ: {
    module: 'contacts', action: 'private.read', roles: ['Admin', 'Manager'],
    description: 'See private contacts owned by someone else.',
  },
  CONTACTS_PRICING_READ: {
    module: 'contacts', action: 'pricing.read', roles: MANAGEMENT,
    description: 'See commercial pricing such as rate cards.',
  },
  CONTACTS_ALL_WRITE: {
    module: 'contacts', action: 'all.write', roles: MANAGEMENT,
    description: 'Edit contacts owned by someone else, and assign contacts to others.',
  },
  CRM_ALL_READ: {
    module: 'crm', action: 'all.read', roles: MANAGEMENT,
    description: "See everyone's follow-ups, opportunities, proposals and vendor requests.",
  },
  CRM_ALL_WRITE: {
    module: 'crm', action: 'all.write', roles: MANAGEMENT,
    description: "Change other people's opportunities and vendor requests.",
  },
  CAMPAIGNS_ALL_READ: {
    module: 'campaigns', action: 'all.read', roles: MANAGEMENT,
    description: "See everyone's campaigns.",
  },
  CAMPAIGNS_ALL_WRITE: {
    module: 'campaigns', action: 'all.write', roles: MANAGEMENT,
    description: "Act on other people's campaigns.",
  },
  COMMISSIONS_ALL_READ: {
    module: 'commissions', action: 'all.read', roles: MANAGEMENT,
    description: "See everyone's commissions.",
  },
  WHATSAPP_PRIVATE_READ: {
    module: 'whatsapp', action: 'private.read', roles: ['Admin', 'Manager'],
    description: 'See private WhatsApp chats owned by someone else.',
  },
  DASHBOARD_OPERATIONS_READ: {
    module: 'dashboard', action: 'operations.read', roles: ['Admin', 'Manager'],
    description: 'Operations figures on the dashboard.',
  },
  DASHBOARD_FINANCE_READ: {
    module: 'dashboard', action: 'finance.read', roles: ['Admin', 'Accountant'],
    description: 'Finance figures on the dashboard.',
  },
  USERS_WRITE: {
    module: 'settings', action: 'users.write', roles: ['Admin', 'Manager'],
    description: 'Add, edit and remove users in the company.',
  },
  ADMINISTRATION: {
    module: 'settings', action: 'administration.write', roles: ['Admin'],
    description: 'Administer the company: give people the Admin, Manager or Accountant role, manage permission groups, and open company settings.',
  },
  GROUPS_READ: {
    module: 'settings', action: 'groups.read', roles: MANAGEMENT,
    description: 'See permission groups and who belongs to them.',
  },
} as const;

export type RecordRuleName = keyof typeof RECORD_RULES;

// Compile-time check that every entry is a well-formed rule.
const typed: Record<RecordRuleName, RecordRule> = RECORD_RULES;

/** The rule permissions a role held before they became permissions. */
export function recordRulePermissionsFor(role: UserRole): string[] {
  return Object.values(typed)
    .filter((rule) => rule.roles.includes(role))
    .map((rule) => `${rule.module}:${rule.action}`);
}
