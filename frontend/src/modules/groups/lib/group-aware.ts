/**
 * How each page shows a group opened whole (spec 2026-11-02-group-as-company).
 *
 * - Merged: one list of every company's records, with a company label
 *   (GROUP_AWARE_PAGES).
 * - Per company: every other page is shown once per company of the group,
 *   each section working on its own company with its own rules.
 * - Settings and the like are about the group company itself, and a single
 *   record belongs to its own company: shown as they are.
 */
export const GROUP_AWARE_PAGES: ReadonlySet<string> = new Set([
  '/', '/tasks', '/projects', '/contacts', '/clients', '/suppliers', '/sales', '/purchases',
  '/purchases/requisitions', '/finance',
]);

/**
 * About the company itself or the person, or a full-screen workspace whose
 * selection lives in the address (inbox, chats): never repeated per company.
 */
const AS_IS = ['/settings', '/admin', '/academy', '/notifications', '/guide', '/company-profile', '/users', '/companies', '/inbox', '/whatsapp'];

/** Pages of one record (dynamic segments) under a list. */
const RECORD_PAGES = ['/projects/', '/contacts/', '/inventory/warehouses/', '/flexi/accounts/'];

export const framePerCompany = (pathname: string): boolean => {
  if (GROUP_AWARE_PAGES.has(pathname)) return false;
  if (AS_IS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return !RECORD_PAGES.some((p) => pathname.startsWith(p));
};
