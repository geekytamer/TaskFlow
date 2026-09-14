/**
 * Which modules a company uses.
 *
 * The platform super admin switches modules off per company. Off means off
 * for everyone in that company, admins included, whatever their groups grant:
 * the server refuses the module's routes and the UI hides it. Group grants are
 * kept, so switching a module back on restores exactly the access people had.
 */

import { MODULES } from './catalogue';

/**
 * Never switchable: settings holds user and group administration (switching
 * it off would lock a company out of fixing anything), and the dashboard is
 * where everyone lands after signing in.
 */
export const ALWAYS_ON_MODULES: ReadonlySet<string> = new Set(['settings', 'dashboard']);

export function switchableModules(): string[] {
  return MODULES.map((m) => m.key).filter((key) => !ALWAYS_ON_MODULES.has(key));
}

export function isSwitchableModule(key: string): boolean {
  return MODULES.some((m) => m.key === key) && !ALWAYS_ON_MODULES.has(key);
}

/** A clean, sorted, de-duplicated list of switchable module keys. */
export function normalizeDisabledModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && isSwitchableModule(v)))].sort();
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
