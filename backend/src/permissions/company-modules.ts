/**
 * Which modules a company uses.
 *
 * The platform super admin switches modules off per company. Off means off
 * for everyone in that company, admins included, whatever their groups grant:
 * the server refuses the module's routes and the UI hides it. Group grants are
 * kept, so switching a module back on restores exactly the access people had.
 *
 * Two kinds of module can be switched: the permission modules of the
 * catalogue, found from a route's gate, and features that hold no permissions
 * of their own (the inbox, follow-ups, the Academy, influencers and portals,
 * Flexi), found from a route's path. A company stores only what is off, so a
 * company that never chose has everything, and so does a module added later.
 */

import { MODULES } from './catalogue';

/**
 * Never switchable: settings holds user and group administration (switching
 * it off would lock a company out of fixing anything), and the dashboard is
 * where everyone lands after signing in.
 */
export const ALWAYS_ON_MODULES: ReadonlySet<string> = new Set(['settings', 'dashboard']);

/**
 * Switchable features outside the permission catalogue, with the staff routes
 * each one owns. Patterns are matched against Express route paths.
 */
export const FEATURE_MODULES: ReadonlyArray<{ key: string; routes: readonly RegExp[] }> = [
  {
    key: 'inbox',
    routes: [
      /^\/companies\/:companyId\/(inbox|conversation-settings|team-chats)(\/|$)/,
      /^\/companies\/:companyId\/contacts\/:contactId\/conversation$/,
      /^\/conversation-(threads|messages|files)\//,
    ],
  },
  {
    key: 'followups',
    routes: [/^\/companies\/:companyId\/followups(\/|$)/, /^\/followups\//],
  },
  {
    // Training locks only: the Academy itself is the user's, across companies.
    key: 'academy',
    routes: [],
  },
  {
    key: 'influencers',
    routes: [
      /^\/companies\/:companyId\/(influencers|influencer-photos|discover|games|game-accounts|portal-users|portal-catalogue|portal-files|portal-price-range|pricing-profiles|portal-requests|portal-referrals)(\/|$)/,
      /^\/companies\/:companyId\/(campaigns|campaign-deliverables)\/:id\/(portal-brief|submissions)(\/|$)/,
      /^\/companies\/:companyId\/contacts\/:contactId\/change-requests(\/|$)/,
      /^\/contacts\/:(contactId|id)\/(influencer-photo|workspace)(\/|$)/,
      /^\/discover-profiles\//,
    ],
  },
  {
    key: 'flexi',
    routes: [
      /^\/companies\/:companyId\/(flexi|flexi-applications)(\/|$)/,
      /^\/companies\/:companyId\/contacts\/:contactId\/flexi$/,
    ],
  },
];

const FEATURE_KEYS: ReadonlySet<string> = new Set(FEATURE_MODULES.map((f) => f.key));

/** The feature a route belongs to, from its Express path; undefined for none. */
export function featureForRoute(routePath: string): string | undefined {
  return FEATURE_MODULES.find((f) => f.routes.some((pattern) => pattern.test(routePath)))?.key;
}

export function switchableModules(): string[] {
  return [...MODULES.map((m) => m.key).filter((key) => !ALWAYS_ON_MODULES.has(key)), ...FEATURE_KEYS];
}

export function isSwitchableModule(key: string): boolean {
  return FEATURE_KEYS.has(key) || (MODULES.some((m) => m.key === key) && !ALWAYS_ON_MODULES.has(key));
}

/** A clean, sorted, de-duplicated list of switchable module keys. */
export function normalizeDisabledModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && isSwitchableModule(v)))].sort();
}

/**
 * How the owner sees the switches: business areas, each a few modules. Every
 * switchable module is in exactly one area (checked by a test).
 */
export const MODULE_AREAS: ReadonlyArray<{ key: string; modules: readonly string[] }> = [
  { key: 'workspace', modules: ['projects', 'tasks', 'documents', 'inbox', 'academy'] },
  { key: 'operations', modules: ['inventory', 'manufacturing', 'purchasing'] },
  { key: 'sales', modules: ['sales', 'contacts', 'crm', 'followups', 'campaigns', 'commissions', 'whatsapp'] },
  { key: 'accounting', modules: ['finance', 'invoices', 'vendor-bills'] },
  { key: 'hr', modules: ['hr', 'payroll'] },
  { key: 'marketing', modules: ['influencers', 'flexi'] },
];

/**
 * Starting points for a new company, as the modules each leaves off. The
 * owner can still tick any module on or off after choosing one. A company's
 * preset is never stored: it is whichever preset its list matches.
 */
export const MODULE_PRESETS: ReadonlyArray<{ key: string; disabledModules: readonly string[] }> = [
  { key: 'everything', disabledModules: [] },
  { key: 'factory', disabledModules: ['campaigns', 'commissions', 'flexi', 'influencers'] },
  { key: 'agency', disabledModules: ['inventory', 'manufacturing', 'purchasing'] },
  { key: 'trading', disabledModules: ['campaigns', 'flexi', 'influencers', 'manufacturing'] },
  {
    key: 'services',
    disabledModules: ['campaigns', 'commissions', 'flexi', 'influencers', 'inventory', 'manufacturing', 'purchasing'],
  },
];

/** English names for refusals; the app shows its own translated labels. */
const MODULE_NAMES: Readonly<Record<string, string>> = {
  'vendor-bills': 'Vendor bills', crm: 'CRM', hr: 'HR', whatsapp: 'WhatsApp',
  followups: 'Follow-ups', influencers: 'Influencers and portals',
};

export function moduleName(key: string): string {
  return MODULE_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** The module that owns each kind of record, for activity, attachments and timelines. */
export const RECORD_ENTITY_MODULES: Readonly<Record<string, string>> = {
  task: 'tasks', project: 'projects',
  invoice: 'invoices', credit_note: 'invoices', payment: 'invoices',
  vendor_bill: 'vendor-bills', vendor_payment: 'vendor-bills',
  purchase_order: 'purchasing', purchase_receipt: 'purchasing',
  sales_order: 'sales', delivery: 'sales', quotation: 'sales',
  inventory_item: 'inventory', stock_movement: 'inventory',
  client: 'contacts', supplier: 'contacts', contact: 'contacts',
  opportunity: 'crm', campaign: 'campaigns', commission: 'commissions',
  employee: 'hr', payroll_run: 'payroll', document: 'documents',
  ledger_account: 'finance', journal_entry: 'finance',
};
