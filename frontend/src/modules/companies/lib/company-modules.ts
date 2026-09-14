import type { Company } from '../types';
import { NAV_PERMISSIONS } from '@/modules/layout/lib/nav-permissions';

/**
 * Which modules the selected company uses. The platform super admin switches
 * modules off per company; the server refuses them for everyone there, and the
 * UI hides them under every engine. See backend permissions/company-modules.ts.
 */

/** Destinations decided per record, which the permission map leaves out, still belong to a module. */
const RECORD_LEVEL_MODULES: Readonly<Record<string, string>> = {
  '/projects': 'projects',
  '/tasks': 'tasks',
};

export function isModuleOn(company: Pick<Company, 'disabledModules'> | null | undefined, module: string): boolean {
  return !company?.disabledModules?.includes(module);
}

/** The module a path belongs to, from its longest matching destination. */
export function moduleForPath(pathname: string): string | undefined {
  let found: string | undefined;
  let length = 0;
  const consider = (href: string, module: string) => {
    if (href === '/' || href.length <= length) return;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      found = module;
      length = href.length;
    }
  };
  Object.entries(NAV_PERMISSIONS).forEach(([href, permission]) =>
    consider(href, permission.slice(0, permission.indexOf(':'))),
  );
  Object.entries(RECORD_LEVEL_MODULES).forEach(([href, module]) => consider(href, module));
  return found;
}
