import type { UserRole } from '../types';
import type { Scope } from '../authz/catalogue';

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
  /**
   * What decides the rule under PERMISSIONS_ENGINE=v2 (authz/engine.ts
   * ruleAllowsV2): holding one of `keys` at `min` scope or wider (the route's
   * own key when it is one of them, else the first), or view on every
   * sensitive field in `fields`. Mirrors authz/legacy-map.ts.
   */
  v2: { readonly keys: readonly string[]; readonly min: Scope } | { readonly fields: readonly string[] };
}

const MANAGEMENT = ['Admin', 'Manager', 'Accountant'] as const;

export const RECORD_RULES = {
  PROJECTS_ALL_READ: {
    module: 'projects', action: 'all.read', roles: MANAGEMENT,
    description: 'See every project, not only public ones and those they belong to.',
    v2: { keys: ['projects.view'], min: 'company' },
  },
  TASKS_ALL_READ: {
    module: 'tasks', action: 'all.read', roles: MANAGEMENT,
    description: 'See every task, not only those assigned to them or in projects they can see.',
    v2: { keys: ['tasks.view', 'tasks.edit', 'tasks.delete'], min: 'company' },
  },
  TIME_ENTRIES_DELETE_OTHERS: {
    module: 'tasks', action: 'time-entries.delete', roles: ['Admin', 'Manager'],
    description: "Delete other people's time entries.",
    v2: { keys: ['tasks.delete_time'], min: 'own' },
  },
  CONTACTS_PRIVATE_READ: {
    module: 'contacts', action: 'private.read', roles: ['Admin', 'Manager'],
    description: 'See private contacts owned by someone else.',
    v2: { keys: ['contacts.view', 'inbox.view'], min: 'company' },
  },
  CONTACTS_PRICING_READ: {
    module: 'contacts', action: 'pricing.read', roles: MANAGEMENT,
    description: 'See commercial pricing such as rate cards.',
    v2: { fields: ['rate_cards', 'client_terms'] },
  },
  CONTACTS_ALL_WRITE: {
    module: 'contacts', action: 'all.write', roles: MANAGEMENT,
    description: 'Edit contacts owned by someone else, and assign contacts to others.',
    v2: { keys: ['contacts.edit'], min: 'company' },
  },
  PORTAL_ACCESS_MANAGE: {
    module: 'contacts', action: 'portal.manage', roles: ['Admin', 'Manager'],
    description: 'Invite, re-invite, disable and enable portal users for clients and influencers.',
    v2: { keys: ['portal.view', 'portal.manage_access', 'portal.handle_requests', 'portal.manage_catalogue', 'portal.approve', 'influencers.review'], min: 'own' },
  },
  GAMES_MANAGE: {
    module: 'campaigns', action: 'games.manage', roles: ['Admin'],
    description: 'Create and run engagement games: metrics, awards, exclusions, viewers, publishing and reopening.',
    v2: { keys: ['games.manage', 'games.view'], min: 'own' },
  },
  DISCOVER_MANAGE: {
    module: 'campaigns', action: 'discover.manage', roles: ['Admin', 'Manager'],
    description: 'Run the influencer directory clients see in the portal: approve, edit and remove profiles, add handles, refresh and discover.',
    v2: { keys: ['discover.manage', 'discover.view'], min: 'own' },
  },
  INVOICES_CREDIT_OVERRIDE: {
    module: 'invoices', action: 'credit.override', roles: ['Admin', 'Accountant'],
    description: "Issue an invoice or confirm an order that takes a client past their credit limit.",
    v2: { keys: ['invoices.override_credit'], min: 'own' },
  },
  PAYROLL_PAY_READ: {
    module: 'payroll', action: 'pay.read', roles: MANAGEMENT,
    description: "See employees' salaries, bank details and ID numbers (everyone sees their own).",
    v2: { fields: ['salary', 'personal_ids', 'bank_details'] },
  },
  CRM_ALL_READ: {
    module: 'crm', action: 'all.read', roles: MANAGEMENT,
    description: "See everyone's follow-ups, opportunities, proposals and vendor requests.",
    v2: { keys: ['crm.view'], min: 'company' },
  },
  CRM_ALL_WRITE: {
    module: 'crm', action: 'all.write', roles: MANAGEMENT,
    description: "Change other people's opportunities and vendor requests.",
    v2: { keys: ['crm.edit', 'crm.delete'], min: 'company' },
  },
  CAMPAIGNS_ALL_READ: {
    module: 'campaigns', action: 'all.read', roles: MANAGEMENT,
    description: "See everyone's campaigns.",
    v2: { keys: ['campaigns.view'], min: 'company' },
  },
  CAMPAIGNS_ALL_WRITE: {
    module: 'campaigns', action: 'all.write', roles: MANAGEMENT,
    description: "Act on other people's campaigns.",
    v2: { keys: ['campaigns.edit'], min: 'company' },
  },
  COMMISSIONS_ALL_READ: {
    module: 'commissions', action: 'all.read', roles: MANAGEMENT,
    description: "See everyone's commissions.",
    v2: { keys: ['commissions.view'], min: 'company' },
  },
  WHATSAPP_PRIVATE_READ: {
    module: 'whatsapp', action: 'private.read', roles: ['Admin', 'Manager'],
    description: 'See private WhatsApp chats owned by someone else.',
    v2: { keys: ['whatsapp.view'], min: 'company' },
  },
  DASHBOARD_OPERATIONS_READ: {
    module: 'dashboard', action: 'operations.read', roles: ['Admin', 'Manager'],
    description: 'Operations figures on the dashboard.',
    v2: { keys: ['dashboard.view_operations'], min: 'own' },
  },
  DASHBOARD_FINANCE_READ: {
    module: 'dashboard', action: 'finance.read', roles: ['Admin', 'Accountant'],
    description: 'Finance figures on the dashboard.',
    v2: { keys: ['dashboard.view_finance'], min: 'own' },
  },
  USERS_WRITE: {
    module: 'settings', action: 'users.write', roles: ['Admin', 'Manager'],
    description: 'Add, edit and remove users in the company.',
    v2: { keys: ['people.manage'], min: 'own' },
  },
  ADMINISTRATION: {
    module: 'settings', action: 'administration.write', roles: ['Admin'],
    description: 'Administer the company: give people the Admin, Manager or Accountant role, manage permission groups, and open company settings.',
    v2: { keys: ['people.manage_roles', 'settings.manage_approvals'], min: 'own' },
  },
  GROUPS_READ: {
    module: 'settings', action: 'groups.read', roles: MANAGEMENT,
    description: 'See permission groups and who belongs to them.',
    v2: { keys: ['people.view_roles'], min: 'own' },
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
