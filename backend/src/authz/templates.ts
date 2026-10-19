/**
 * System templates: the starting roles every company gets.
 *
 * Admin, Manager, Accountant and Employee reproduce today's four roles
 * exactly: the route role lists (docs/superpowers/plans/gate-matrix.csv plus
 * the routers outside it) and the record rules (permissions/record-rules.ts),
 * which become scopes and sensitive fields here. Owner is Admin with `group`
 * scope wherever an action is scoped.
 *
 * 1a sets no limits: every grant is unlimited, as today.
 */
import {
  CATALOGUE, SENSITIVE_FIELDS, allPermissionKeys, findAction, permissionKey,
  type Label, type Scope,
} from './catalogue';

export const TEMPLATE_KEYS = ['owner', 'admin', 'manager', 'accountant', 'employee'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateGrant { key: string; scope?: Scope; limit?: number }
export interface TemplateField { key: string; view: boolean; edit: boolean }
export interface Template { label: Label; grants: TemplateGrant[]; fields: TemplateField[] }

type LegacyRole = 'admin' | 'manager' | 'accountant' | 'employee';
/** false = not granted; true = granted (unscoped action); a scope = granted at that scope. */
export type Cell = boolean | Scope;
export type Row = readonly [admin: Cell, manager: Cell, accountant: Cell, employee: Cell];

const ALL: Row = [true, true, true, true];
const MGMT: Row = [true, true, true, false]; // Admin, Manager, Accountant (companyManagementRoles)
const AM: Row = [true, true, false, false];
const AC: Row = [true, false, true, false];
const A: Row = [true, false, false, false];
/** Scoped: Admin/Manager/Accountant see the company, Employee their own. */
const MGMT_OR_OWN: Row = ['company', 'company', 'company', 'own'];
/** Scoped: Admin/Manager see the company, Accountant and Employee their own. */
const AM_OR_OWN: Row = ['company', 'company', 'own', 'own'];

/**
 * Who holds each permission today, by legacy role. Every catalogue key appears
 * exactly once (checked at load). Comments name the legacy gate reproduced.
 */
export const LEGACY_HOLDERS: Readonly<Record<string, Row>> = {
  'dashboard.view': ALL, // dashboard, search: company access
  'dashboard.view_operations': AM, // DASHBOARD_OPERATIONS_READ
  'dashboard.view_finance': AC, // DASHBOARD_FINANCE_READ

  'sales.view': MGMT,
  'sales.create': MGMT,
  'sales.edit': MGMT,
  'sales.cancel': MGMT, // status Cancelled on PATCH /sales-orders|quotations/:id/status (management today)
  'sales.delete': MGMT,

  'purchasing.view': MGMT,
  'purchasing.create': MGMT,
  'purchasing.edit': MGMT,
  'purchasing.delete': MGMT,
  'purchasing.approve': AM, // PO / requisition approve + reject
  'purchasing.approve_step': MGMT, // POST /approvals/:docType/:docId/decision (purchase_order); chain step role checked after

  'inventory.view': MGMT,
  'inventory.create': MGMT,
  'inventory.edit': MGMT, // stock counts
  'inventory.delete': MGMT,
  'inventory.post': MGMT,
  'inventory.export': MGMT,
  'inventory.manage_items': AM, // PUT item, restore, warehouses create/edit/delete, PUT storage

  'manufacturing.view': MGMT,
  'manufacturing.create': MGMT,
  'manufacturing.edit': MGMT,
  'manufacturing.delete': MGMT,
  'manufacturing.cancel': MGMT,

  'logistics.view': MGMT,
  'logistics.create': MGMT,
  'logistics.edit': MGMT,
  'logistics.delete': MGMT,
  'logistics.cancel': MGMT,
  'logistics.print': ALL, // GET /deliveries/:id/pdf: company access

  'quality.view': MGMT,
  'quality.create': MGMT,

  'projects.view': MGMT_OR_OWN, // PROJECTS_ALL_READ
  'projects.create': AM,
  'projects.edit': AM,
  'projects.delete': AM,

  'tasks.view': MGMT_OR_OWN, // TASKS_ALL_READ
  'tasks.create': ALL,
  'tasks.edit': MGMT_OR_OWN, // edits follow what they can see
  'tasks.delete': MGMT_OR_OWN,
  'tasks.delete_time': AM, // TIME_ENTRIES_DELETE_OTHERS

  'documents.view': MGMT,
  'documents.create': MGMT,
  'documents.edit': MGMT,
  'documents.delete': MGMT,

  'invoices.view': MGMT,
  'invoices.create': MGMT,
  'invoices.edit': MGMT,
  'invoices.delete': MGMT,
  'invoices.send': MGMT,
  'invoices.pay': MGMT,
  'invoices.print': ALL, // GET /invoices/:id/pdf: company access
  'invoices.override_credit': AC, // INVOICES_CREDIT_OVERRIDE

  'vendor-bills.view': MGMT,
  'vendor-bills.create': MGMT,
  'vendor-bills.edit': MGMT,
  'vendor-bills.delete': MGMT,
  'vendor-bills.pay': MGMT,

  'finance.view': MGMT,
  'finance.create': MGMT,
  'finance.edit': MGMT,
  'finance.delete': MGMT,
  'finance.post': MGMT,
  'finance.export': MGMT,
  'finance.approve_expenses': MGMT, // POST /approvals/:docType/:docId/decision (expense)
  'finance.view_settings': ALL, // GET finance settings: company access
  'finance.edit_settings': AM, // PUT finance settings

  'commissions.view': MGMT_OR_OWN, // COMMISSIONS_ALL_READ (route open to all roles)
  'commissions.create': MGMT,
  'commissions.edit': MGMT,
  'commissions.delete': MGMT,
  'commissions.approve': MGMT,
  'commissions.pay': MGMT,
  'commissions.void': MGMT,

  'hr.view': ALL, // employees, departments, leave: company access
  'hr.create': MGMT,
  'hr.edit': MGMT,
  'hr.delete': MGMT,
  'hr.approve': MGMT, // PUT /leave-requests/:id/status
  'hr.view_attendance': MGMT, // attendance, gratuity

  'payroll.view': MGMT,
  'payroll.create': MGMT,
  'payroll.edit': MGMT,
  'payroll.delete': MGMT,
  'payroll.export': MGMT, // WPS file

  'academy.view': ALL, // company access; exemptions are platform-admin only (not a company permission)

  'crm.view': MGMT_OR_OWN, // CRM_ALL_READ
  'crm.create': ALL,
  'crm.edit': MGMT_OR_OWN, // CRM_ALL_WRITE
  'crm.delete': MGMT_OR_OWN, // CRM_ALL_WRITE
  'crm.approve': AM, // PATCH /vendor-requests/:id/status
  'crm.manage_team': AM, // bulk-reassign, coverage gaps, workload
  'crm.view_performance': MGMT,
  'crm.manage_pipeline': MGMT, // contributions, commission recalculation, overdue sweep

  'contacts.view': AM_OR_OWN, // CONTACTS_PRIVATE_READ (public contacts: anyone with view)
  'contacts.view_details': MGMT, // GET /contacts/:id, clients, suppliers, activities
  'contacts.create': ALL,
  'contacts.edit': MGMT_OR_OWN, // PATCH /contacts/:id + CONTACTS_ALL_WRITE
  'contacts.manage': MGMT, // PUT contact/client, POST clients/suppliers, import, activities, roles
  'contacts.delete': MGMT,
  'contacts.export': ALL,

  'influencers.view': ALL, // influencer photos: company access
  'influencers.create': MGMT, // import
  'influencers.export': ALL,
  'influencers.use_workspace': AM, // creator workspace
  'influencers.review': AM, // portal staff influencer routes (PORTAL_ACCESS_MANAGE)

  'campaigns.view': MGMT_OR_OWN, // CAMPAIGNS_ALL_READ
  'campaigns.create': ALL,
  'campaigns.edit': MGMT_OR_OWN, // CAMPAIGNS_ALL_WRITE
  'campaigns.delete': AM,
  'campaigns.invoice': MGMT, // generate-invoice, sync-invoice

  'portal.view': AM, // all portal staff routes: PORTAL_ACCESS_MANAGE
  'portal.manage_access': AM,
  'portal.handle_requests': AM,
  'portal.manage_catalogue': AM,
  'portal.approve': AM,

  'discover.view': AM, // GET directory, profile photo: DISCOVER_MANAGE
  'discover.manage': AM, // DISCOVER_MANAGE

  'games.view': A, // every games staff route: GAMES_MANAGE
  'games.manage': A,

  'inbox.view': AM_OR_OWN, // contacts gate + CONTACTS_PRIVATE_READ
  'inbox.send': ALL,
  'inbox.edit_settings': AM, // PUT conversation-settings

  'whatsapp.view': ['company', 'company', 'own', false], // WHATSAPP_PRIVATE_READ; Employees have no WhatsApp
  'whatsapp.send': MGMT,
  'whatsapp.edit': MGMT,
  'whatsapp.manage': A, // instance, QR, state, logout, webhook

  'settings.view': ALL, // GET company, custom fields: company access
  'settings.view_numbering': AM, // GET numbering-settings
  'settings.edit': AM, // PUT company, numbering, custom fields
  'settings.view_activity': MGMT,
  'settings.view_approvals': MGMT,
  'settings.manage_approvals': A, // PUT approval rules: ADMINISTRATION

  'people.view': ALL, // members: company access
  'people.manage': AM, // USERS_WRITE, GET company users
  'people.view_roles': MGMT, // GROUPS_READ
  'people.manage_roles': A, // ADMINISTRATION
};

/** Sensitive fields per legacy role: [view, edit]. */
export const FIELD_HOLDERS: Readonly<Record<string, readonly [view: Row, edit: Row]>> = {
  salary: [MGMT, MGMT], // PAYROLL_PAY_READ; edited through PUT /employees/:id (management)
  personal_ids: [MGMT, MGMT],
  bank_details: [MGMT, MGMT],
  cost_prices: [ALL, ALL], // not restricted by field today: route gates alone decide
  rate_cards: [MGMT, MGMT], // CONTACTS_PRICING_READ; edited through PUT /contacts/:id (management)
  client_terms: [MGMT, MGMT], // CONTACTS_PRICING_READ
};

const ROLE_INDEX: Record<LegacyRole, number> = { admin: 0, manager: 1, accountant: 2, employee: 3 };

/**
 * Throws if the holders tables and the catalogue fall out of step: a missing or
 * unknown key, a scope on an unscoped action (or none on a scoped one), a scope
 * the area does not offer, or a sensitive field someone may edit but not see.
 * Runs when this module loads; exported so the test can feed it broken tables.
 */
export function checkTables(
  legacy: Readonly<Record<string, Row>>,
  fields: Readonly<Record<string, readonly [Row, Row]>>,
): void {
  const keys = allPermissionKeys();
  const missing = keys.filter((k) => !(k in legacy));
  const unknown = Object.keys(legacy).filter((k) => !findAction(k));
  if (missing.length || unknown.length) {
    throw new Error(`authz templates out of step with the catalogue: missing ${missing.join(', ') || '-'}; unknown ${unknown.join(', ') || '-'}`);
  }
  for (const [key, row] of Object.entries(legacy)) {
    const { area, action } = findAction(key)!;
    const scoped = Boolean(action.scoped);
    for (const cell of row) {
      if (cell === false) continue;
      if ((typeof cell === 'string') !== scoped) {
        throw new Error(`authz templates: ${key} ${scoped ? 'needs a scope' : 'takes no scope'}`);
      }
      if (typeof cell === 'string' && !(area.scopes ?? []).includes(cell)) {
        throw new Error(`authz templates: ${key} scope ${cell} is not one ${area.key} offers`);
      }
    }
  }
  const fieldKeys = SENSITIVE_FIELDS.map((f) => f.key);
  if (fieldKeys.length !== Object.keys(fields).length || fieldKeys.some((k) => !(k in fields))) {
    throw new Error('authz templates: sensitive fields out of step with the catalogue');
  }
  for (const [key, [view, edit]] of Object.entries(fields)) {
    edit.forEach((canEdit, i) => {
      if (canEdit && !view[i]) throw new Error(`authz templates: field ${key} can edit without view`);
    });
  }
}
checkTables(LEGACY_HOLDERS, FIELD_HOLDERS);

function legacyTemplate(role: LegacyRole): Pick<Template, 'grants' | 'fields'> {
  const i = ROLE_INDEX[role];
  const grants: TemplateGrant[] = [];
  for (const area of CATALOGUE) {
    for (const action of area.actions) {
      const key = permissionKey(area.key, action.key);
      const cell = LEGACY_HOLDERS[key][i];
      if (cell === false) continue;
      grants.push(typeof cell === 'string' ? { key, scope: cell } : { key });
    }
  }
  const fields = SENSITIVE_FIELDS.map(({ key }) => ({
    key, view: Boolean(FIELD_HOLDERS[key][0][i]), edit: Boolean(FIELD_HOLDERS[key][1][i]),
  }));
  return { grants, fields };
}

const admin = legacyTemplate('admin');

export const TEMPLATES: Record<TemplateKey, Template> = {
  owner: {
    label: { en: 'Owner', ar: 'المالك' },
    grants: admin.grants.map((g) => (g.scope ? { ...g, scope: 'group' as const } : { ...g })),
    fields: admin.fields.map((f) => ({ ...f })),
  },
  admin: { label: { en: 'Admin', ar: 'مدير النظام' }, ...admin },
  manager: { label: { en: 'Manager', ar: 'مدير' }, ...legacyTemplate('manager') },
  accountant: { label: { en: 'Accountant', ar: 'محاسب' }, ...legacyTemplate('accountant') },
  employee: { label: { en: 'Employee', ar: 'موظف' }, ...legacyTemplate('employee') },
};

/** What a template grants for a permission key, or undefined if it does not. */
export function templateGrants(template: TemplateKey, key: string): { scope?: Scope; limit?: number } | undefined {
  const grant = TEMPLATES[template].grants.find((g) => g.key === key);
  if (!grant) return undefined;
  const out: { scope?: Scope; limit?: number } = {};
  if (grant.scope) out.scope = grant.scope;
  if (grant.limit !== undefined) out.limit = grant.limit;
  return out;
}

export function templateFields(template: TemplateKey): TemplateField[] {
  return TEMPLATES[template].fields;
}
