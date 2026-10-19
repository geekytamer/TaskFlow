/**
 * Old permission → new catalogue keys, for converting custom permission groups
 * (Task 3's data migration).
 *
 * Keys are every permission of the legacy catalogue (permissions/catalogue.ts:
 * `module:action`, record rules included). Values are the new keys that cover
 * every route the old permission opened: each gate-matrix route's declared
 * permission (authz/route-registry.ts) is in the list for its old permission,
 * which test/authz-route-registry.test.js checks, so a converted group never
 * loses a route. Where one old permission covered routes now split across
 * areas or verbs, it maps to all of them; the comments name the few places
 * that grants slightly more than before.
 *
 * Scope: a converted scoped key (crm.view, contacts.edit…) is `company` when the
 * group also holds the matching record rule (crm:all.read, contacts:all.write…),
 * otherwise `own`.
 */

export const OLD_TO_NEW: Readonly<Record<string, readonly string[]>> = {
  // dashboard
  'dashboard:read': ['dashboard.view'],
  // inventory
  'inventory:create': ['inventory.create', 'logistics.create', 'logistics.edit', 'quality.create'],
  'inventory:delete': ['inventory.delete', 'logistics.delete'],
  'inventory:inventory-items.restore.create': ['inventory.manage_items'],
  'inventory:post': ['inventory.post'],
  'inventory:read': ['inventory.view', 'inventory.export', 'logistics.view', 'quality.view'],
  'inventory:shipments.write': ['logistics.edit'],
  'inventory:stock-counts.write': ['inventory.edit'],
  'inventory:warehouses.create': ['inventory.manage_items'],
  'inventory:warehouses.delete': ['inventory.manage_items'],
  'inventory:write': ['inventory.manage_items'],
  // manufacturing
  'manufacturing:cancel': ['manufacturing.cancel'],
  'manufacturing:create': ['manufacturing.create', 'manufacturing.edit'],
  'manufacturing:delete': ['manufacturing.delete'],
  'manufacturing:read': ['manufacturing.view'],
  'manufacturing:write': ['manufacturing.edit'],
  // projects
  'projects:create': ['projects.create', 'projects.edit'],
  'projects:delete': ['projects.delete', 'projects.edit'],
  'projects:write': ['projects.edit'],
  // purchasing
  'purchasing:approve': ['purchasing.approve'],
  'purchasing:create': ['purchasing.create'],
  'purchasing:delete': ['purchasing.delete'],
  'purchasing:purchase-orders.reject.create': ['purchasing.approve'],
  'purchasing:purchase-requisitions.reject.create': ['purchasing.approve'],
  'purchasing:read': ['purchasing.view'],
  'purchasing:write': ['purchasing.edit'],
  // sales
  'sales:cancel': ['logistics.cancel'], // cancelled deliveries and customer returns
  'sales:create': ['sales.create', 'logistics.create'],
  'sales:delete': ['sales.delete'],
  'sales:deliveries.pdf.read': ['logistics.print'],
  'sales:read': ['sales.view', 'logistics.view'],
  'sales:write': ['sales.edit', 'logistics.edit', 'sales.cancel'], // status changes included cancelling
  // tasks
  'tasks:delete': ['tasks.delete'],
  'tasks:tasks.create': ['tasks.create'],
  'tasks:write': ['tasks.edit'],
  // commissions
  'commissions:approve': ['commissions.approve'],
  'commissions:create': ['commissions.create', 'commissions.pay'],
  'commissions:delete': ['commissions.delete'],
  'commissions:read': ['commissions.view'],
  'commissions:void': ['commissions.void'],
  'commissions:write': ['commissions.edit'],
  // finance
  'finance:create': ['finance.create', 'finance.post', 'finance.edit', 'vendor-bills.create', 'vendor-bills.edit', 'purchasing.approve_step', 'finance.approve_expenses'], // approval decisions on POs and expenses went through finance:create
  'finance:delete': ['finance.delete', 'finance.post'],
  'finance:finance.settings.read': ['finance.view_settings'],
  'finance:finance.settings.write': ['finance.edit_settings'],
  'finance:read': ['finance.view', 'settings.view_approvals', 'vendor-bills.view', 'finance.export'],
  'finance:write': ['finance.edit'], // not settings.manage_approvals: PUT approval rules also needed ADMINISTRATION
  // invoices
  'invoices:create': ['invoices.edit', 'invoices.send', 'invoices.create'],
  'invoices:delete': ['invoices.delete'],
  'invoices:invoices.pdf.read': ['invoices.print'],
  'invoices:pay': ['invoices.view', 'invoices.pay'], // GET payments now sits under view (widens: the invoice list too)
  'invoices:read': ['invoices.view'],
  'invoices:write': ['invoices.edit'],
  // vendor-bills
  'vendor-bills:create': ['vendor-bills.create'],
  'vendor-bills:delete': ['vendor-bills.delete'],
  'vendor-bills:pay': ['vendor-bills.view', 'vendor-bills.pay'], // GET payments now sits under view (widens: the bill list too)
  'vendor-bills:read': ['vendor-bills.view'],
  'vendor-bills:write': ['vendor-bills.edit'],
  // campaigns
  'campaigns:campaigns.delete': ['campaigns.delete'],
  'campaigns:campaigns.generate-invoice.create': ['campaigns.invoice'],
  'campaigns:campaigns.sync-invoice.create': ['campaigns.invoice'],
  'campaigns:create': ['campaigns.create'],
  'campaigns:delete': ['campaigns.edit'],
  'campaigns:read': ['campaigns.view'],
  'campaigns:write': ['campaigns.edit'],
  // contacts
  'contacts:clients.read': ['contacts.view_details'],
  'contacts:contacts.activities.read': ['contacts.view_details'],
  'contacts:contacts.create': ['contacts.create'],
  'contacts:contacts.read': ['contacts.view_details'],
  'contacts:contacts.workspace.contacts.peak-contact.create': ['influencers.use_workspace'],
  'contacts:contacts.workspace.read': ['influencers.use_workspace'],
  'contacts:contacts.write': ['contacts.edit'],
  'contacts:create': ['contacts.manage', 'influencers.create'],
  'contacts:delete': ['contacts.manage', 'contacts.delete'],
  'contacts:read': ['contacts.view', 'contacts.export', 'influencers.export'],
  'contacts:suppliers.read': ['contacts.view_details'],
  'contacts:write': ['contacts.manage'],
  // crm
  'crm:contributions.create': ['crm.manage_pipeline'],
  'crm:contributions.delete': ['crm.manage_pipeline'],
  'crm:create': ['crm.edit', 'crm.create'],
  'crm:crm-performance.read': ['crm.view_performance'],
  'crm:delete': ['crm.edit', 'crm.delete'],
  'crm:followups.bulk-reassign.create': ['crm.manage_team'],
  'crm:followups.coverage-gaps.read': ['crm.manage_team'],
  'crm:followups.sweep-overdue.create': ['crm.manage_pipeline'],
  'crm:followups.workload.read': ['crm.manage_team'],
  'crm:opportunities.commissions.recalculate.create': ['crm.manage_pipeline'],
  'crm:read': ['crm.view'],
  'crm:vendor-requests.status.write': ['crm.approve'],
  'crm:write': ['crm.edit'],
  // whatsapp
  'whatsapp:create': ['whatsapp.edit', 'whatsapp.send'],
  'whatsapp:delete': ['whatsapp.manage'],
  'whatsapp:read': ['whatsapp.manage'],
  'whatsapp:send': ['whatsapp.send'],
  'whatsapp:whatsapp.chats.read': ['whatsapp.view'],
  'whatsapp:whatsapp.chats.settings.read': ['whatsapp.view'],
  'whatsapp:whatsapp.chats.settings.write': ['whatsapp.edit'],
  'whatsapp:whatsapp.configure-webhook.create': ['whatsapp.manage'],
  'whatsapp:whatsapp.logout.create': ['whatsapp.manage'],
  'whatsapp:whatsapp.messages.read': ['whatsapp.view'],
  'whatsapp:write': ['whatsapp.manage'],
  // hr
  'hr:attendance.read': ['hr.view_attendance'],
  'hr:create': ['hr.create'],
  'hr:delete': ['hr.delete'],
  'hr:hr.gratuity.read': ['hr.view_attendance'],
  'hr:read': ['hr.view'],
  'hr:write': ['hr.edit', 'hr.approve'],
  // payroll
  'payroll:create': ['payroll.create'],
  'payroll:delete': ['payroll.delete'],
  'payroll:read': ['payroll.view', 'payroll.export'],
  'payroll:write': ['payroll.edit'],
  // documents
  'documents:create': ['documents.create'],
  'documents:delete': ['documents.delete'],
  'documents:read': ['documents.view'],
  'documents:write': ['documents.edit'],
  // settings
  'settings:activity-events.read': ['settings.view_activity'],
  'settings:companies.read': ['settings.view'],
  'settings:custom-fields.create': ['settings.edit'],
  'settings:custom-fields.delete': ['settings.edit'],
  'settings:custom-fields.read': ['settings.view'],
  'settings:members.read': ['people.view'],
  'settings:numbering-settings.read': ['settings.view_numbering'],
  'settings:users.read': ['people.manage'],
  'settings:write': ['settings.edit'],

  // Record rules (permissions/record-rules.ts): each maps to every key it feeds.
  // Scoped keys: a converted group holding the rule gets `company` scope; without it, `own`.
  'projects:all.read': ['projects.view'], // PROJECTS_ALL_READ
  'tasks:all.read': ['tasks.view', 'tasks.edit', 'tasks.delete'], // TASKS_ALL_READ
  'tasks:time-entries.delete': ['tasks.delete_time'], // TIME_ENTRIES_DELETE_OTHERS
  'contacts:private.read': ['contacts.view', 'inbox.view'], // CONTACTS_PRIVATE_READ
  'contacts:pricing.read': [], // CONTACTS_PRICING_READ: sensitive fields only, see OLD_TO_FIELDS
  'contacts:all.write': ['contacts.edit'], // CONTACTS_ALL_WRITE
  'contacts:portal.manage': ['portal.view', 'portal.manage_access', 'portal.handle_requests', 'portal.manage_catalogue', 'portal.approve', 'influencers.review'], // PORTAL_ACCESS_MANAGE
  'campaigns:games.manage': ['games.view', 'games.manage'], // GAMES_MANAGE
  'campaigns:discover.manage': ['discover.view', 'discover.manage'], // DISCOVER_MANAGE
  'invoices:credit.override': ['invoices.override_credit'], // INVOICES_CREDIT_OVERRIDE
  'payroll:pay.read': [], // PAYROLL_PAY_READ: sensitive fields only, see OLD_TO_FIELDS
  'crm:all.read': ['crm.view'], // CRM_ALL_READ
  'crm:all.write': ['crm.edit', 'crm.delete'], // CRM_ALL_WRITE
  'campaigns:all.read': ['campaigns.view'], // CAMPAIGNS_ALL_READ
  'campaigns:all.write': ['campaigns.edit'], // CAMPAIGNS_ALL_WRITE
  'commissions:all.read': ['commissions.view'], // COMMISSIONS_ALL_READ
  'whatsapp:private.read': ['whatsapp.view'], // WHATSAPP_PRIVATE_READ
  'dashboard:operations.read': ['dashboard.view_operations'], // DASHBOARD_OPERATIONS_READ
  'dashboard:finance.read': ['dashboard.view_finance'], // DASHBOARD_FINANCE_READ
  'settings:users.write': ['people.manage'], // USERS_WRITE
  'settings:administration.write': ['people.manage_roles', 'settings.manage_approvals'], // ADMINISTRATION
  'settings:groups.read': ['people.view_roles'], // GROUPS_READ
};

/** Record rules that became sensitive-field switches (view and edit) rather than actions. */
export const OLD_TO_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'contacts:pricing.read': ['rate_cards', 'client_terms'], // CONTACTS_PRICING_READ
  'payroll:pay.read': ['salary', 'personal_ids', 'bank_details'], // PAYROLL_PAY_READ
};
