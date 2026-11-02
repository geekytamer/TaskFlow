/**
 * Pages that can show a whole group. Every other page shows the group
 * company's own records while a group is open, under a notice saying so
 * (spec 2026-11-02-group-as-company, stage 2 converts the rest).
 */
export const GROUP_AWARE_PAGES: ReadonlySet<string> = new Set(['/', '/tasks', '/projects']);

/** Settings and the platform admin are about the company itself, not its records. */
const NEVER_NOTICE = ['/settings', '/admin', '/academy', '/notifications', '/guide', '/company-profile', '/users', '/companies'];

export const needsOwnRecordsNotice = (pathname: string): boolean => {
  if (GROUP_AWARE_PAGES.has(pathname)) return false;
  if (NEVER_NOTICE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  // A record opened from a group list (/projects/:id) is its own company's.
  return ![...GROUP_AWARE_PAGES].some((p) => p !== '/' && pathname.startsWith(`${p}/`));
};
