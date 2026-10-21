/**
 * The permission each navigation destination requires: a catalogue key
 * (backend authz/catalogue.ts), held in the selected company.
 *
 * Single source of truth for the sidebar, the phone tab bar, the command
 * palette, the section links and the page guards. A destination absent from
 * this map is open to every member: /projects and /tasks decide visibility per
 * record, /inbox lists what each person may see (staff chats are for everyone),
 * /academy and /diagram are for everyone.
 */
export const NAV_PERMISSIONS: Readonly<Record<string, string>> = {
  '/': 'dashboard.view',
  '/documents': 'documents.view',
  '/sales': 'sales.view',
  '/purchases': 'purchasing.view',
  '/purchases/requisitions': 'purchasing.view',
  '/purchases/rfq': 'purchasing.view',
  '/purchases/matching': 'purchasing.view',
  '/inventory': 'inventory.view',
  '/inventory/counts': 'inventory.view',
  '/shipments': 'logistics.view',
  '/warehouse': 'inventory.view',
  '/approvals': 'settings.view_approvals',
  '/manufacturing': 'manufacturing.view',
  '/finance': 'finance.view',
  '/crm/commissions': 'commissions.view',
  '/contacts': 'contacts.view',
  '/influencers': 'influencers.view',
  '/influencers/discover': 'discover.view',
  '/whatsapp': 'whatsapp.view',
  '/crm/opportunities': 'crm.view',
  '/crm/campaigns': 'campaigns.view',
  '/crm/followups': 'crm.view',
  '/crm/client-requests': 'portal.view',
  '/crm/vendor-requests': 'crm.view',
  '/crm/performance': 'crm.view_performance',
  '/crm/pipeline': 'crm.view',
  '/clients': 'contacts.view_details',
  '/suppliers': 'contacts.view_details',
  '/hr/employees': 'hr.view',
  '/hr/attendance': 'hr.view_attendance',
  '/hr/leave': 'hr.view',
  '/hr/payroll': 'payroll.view',
  '/company-profile': 'settings.edit',
  '/users': 'people.manage',
  // Company settings: the panels there are the administrator's (approval rules, roles).
  '/settings': 'settings.manage_approvals',
  '/settings/permissions': 'people.manage_roles',
};

export function navPermission(href: string): string | undefined {
  return NAV_PERMISSIONS[href];
}

/** Whether a destination is open, given `can` from the permissions context. */
export function navAllowed(href: string, can: (key: string) => boolean): boolean {
  const permission = NAV_PERMISSIONS[href];
  return permission ? can(permission) : true;
}
