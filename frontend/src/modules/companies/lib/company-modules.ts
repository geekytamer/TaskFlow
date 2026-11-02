import type { Company } from '../types';
import type { ModulePreset } from '@/services/permissionService';

/**
 * Which modules the selected company uses. The platform super admin switches
 * modules off per company; the server refuses them for everyone there, and the
 * UI hides them under every engine. See backend permissions/company-modules.ts.
 */

/**
 * The module (legacy module key, as the super admin switches them) each
 * destination belongs to. A path belongs to its longest matching destination.
 */
const PATH_MODULES: Readonly<Record<string, string>> = {
  '/documents': 'documents',
  '/sales': 'sales',
  '/purchases': 'purchasing',
  '/inventory': 'inventory',
  '/shipments': 'inventory',
  '/warehouse': 'inventory',
  '/approvals': 'finance',
  '/manufacturing': 'manufacturing',
  '/finance': 'finance',
  '/crm/commissions': 'commissions',
  '/contacts': 'contacts',
  '/influencers': 'contacts',
  '/whatsapp': 'whatsapp',
  '/crm/opportunities': 'crm',
  '/crm/campaigns': 'campaigns',
  '/crm/followups': 'crm',
  '/crm/client-requests': 'contacts',
  '/crm/vendor-requests': 'crm',
  '/crm/performance': 'crm',
  '/crm/pipeline': 'crm',
  '/clients': 'contacts',
  '/suppliers': 'contacts',
  '/hr/employees': 'hr',
  '/hr/attendance': 'hr',
  '/hr/leave': 'hr',
  '/hr/payroll': 'payroll',
  '/company-profile': 'settings',
  '/users': 'settings',
  '/settings': 'settings',
  '/flexi': 'invoices',
  '/projects': 'projects',
  '/tasks': 'tasks',
};

/**
 * Pages of the switchable features that hold no permissions of their own.
 * A page here needs its feature on as well as its permission module.
 */
const FEATURE_PATHS: Readonly<Record<string, string>> = {
  '/inbox': 'inbox',
  '/crm/followups': 'followups',
  '/academy': 'academy',
  '/influencers': 'influencers',
  '/portal-referrals': 'influencers',
  '/games': 'influencers',
  '/flexi': 'flexi',
};

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function isModuleOn(company: Pick<Company, 'disabledModules'> | null | undefined, module: string): boolean {
  return !company?.disabledModules?.includes(module);
}

/** The module a path belongs to, from its longest matching destination. */
export function moduleForPath(pathname: string): string | undefined {
  let found: string | undefined;
  let length = 0;
  const consider = (href: string, module: string) => {
    if (href === '/' || href.length <= length) return;
    if (matches(pathname, href)) {
      found = module;
      length = href.length;
    }
  };
  Object.entries(PATH_MODULES).forEach(([href, module]) => consider(href, module));
  return found;
}

/** Every module a path needs on: its permission module and its feature, if any. */
export function modulesForPath(pathname: string): string[] {
  const feature = Object.entries(FEATURE_PATHS).find(([href]) => matches(pathname, href))?.[1];
  return [moduleForPath(pathname), feature].filter((m): m is string => Boolean(m));
}

/** The preset a company's switched-off list matches, or undefined for a custom choice. */
export function presetFor(disabledModules: string[], presets: ModulePreset[]): string | undefined {
  const key = (list: string[]) => [...list].sort().join(',');
  return presets.find((p) => key(p.disabledModules) === key(disabledModules))?.key;
}
