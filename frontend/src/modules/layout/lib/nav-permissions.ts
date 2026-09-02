/**
 * The permission each navigation destination requires.
 *
 * Single source of truth for the sidebar, the command palette and anything
 * else that lists places a user can go. These rules previously lived in two
 * separate hardcoded role arrays that were free to drift apart.
 *
 * A route absent from this map is governed per record rather than by group
 * membership — /projects and /tasks decide visibility per project and per
 * task — so it stays visible and the server enforces the detail.
 */
export const NAV_PERMISSIONS: Readonly<Record<string, string>> = {
  '/': 'dashboard:read',
  '/documents': 'documents:read',
  '/sales': 'sales:read',
  '/purchases': 'purchasing:read',
  '/purchases/rfq': 'purchasing:read',
  '/purchases/matching': 'purchasing:read',
  '/inventory': 'inventory:read',
  '/inventory/counts': 'inventory:read',
  '/manufacturing': 'manufacturing:read',
  '/finance': 'finance:read',
  '/crm/commissions': 'commissions:read',
  '/contacts': 'contacts:contacts.read',
  '/influencers': 'contacts:read',
  '/whatsapp': 'whatsapp:read',
  '/crm/opportunities': 'crm:read',
  '/crm/campaigns': 'campaigns:read',
  '/crm/followups': 'crm:read',
  '/crm/vendor-requests': 'crm:read',
  '/crm/performance': 'crm:crm-performance.read',
  '/crm/pipeline': 'crm:read',
  '/clients': 'contacts:clients.read',
  '/suppliers': 'contacts:suppliers.read',
  '/hr/employees': 'hr:read',
  '/hr/attendance': 'hr:attendance.read',
  '/hr/leave': 'hr:read',
  '/hr/payroll': 'payroll:read',
  '/company-profile': 'settings:companies.read',
  '/users': 'settings:users.read',
  '/settings': 'settings:write',
  '/settings/permissions': 'settings:write',
};

export function navPermission(href: string): string | undefined {
  return NAV_PERMISSIONS[href];
}
