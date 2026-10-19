/**
 * Old permissions → the new catalogue, for converting custom permission groups
 * (Task 3's data migration). Every key of the legacy catalogue
 * (permissions/catalogue.ts, `module:action`, record rules included) appears in
 * exactly one of the three tables:
 *
 * - OLD_TO_NEW: action permissions → the catalogue keys to grant. For a gate
 *   permission these are the declared permissions (authz/route-registry.ts) of
 *   every gate-matrix route it opened, so a converted group never loses a
 *   route (tested). Where the old permission's routes are now split across
 *   verbs or areas it maps to all of them, which can open a few routes the old
 *   permission did not; test/fixtures/authz-widenings.json lists every such
 *   route and the test fails when the list changes. Converted custom groups
 *   start as inactive add-ons pending an administrator's review (controller
 *   Ruling E), so these widenings never take effect unseen.
 * - OLD_RULE_SCOPES: record rules that only widened visibility ("see everyone's",
 *   "edit everyone's"). They grant nothing by themselves: they raise the scope of
 *   the listed keys to `company`, and only for keys the group already holds.
 *   A converted scoped key without its rule gets `own`.
 * - OLD_TO_FIELDS: record rules that became sensitive-field switches.
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
  'manufacturing:create': ['manufacturing.create'],
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
  'sales:cancel': ['logistics.cancel'], // cancelling deliveries and customer returns
  'sales:create': ['sales.create', 'logistics.create'],
  'sales:delete': ['sales.delete'],
  'sales:deliveries.pdf.read': ['logistics.print'],
  'sales:read': ['sales.view', 'logistics.view'],
  'sales:write': ['sales.edit', 'logistics.edit', 'sales.cancel'], // + sales.cancel: status changes included cancelling
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
  'finance:create': ['finance.create', 'finance.post', 'vendor-bills.create', 'vendor-bills.edit', 'purchasing.approve_step', 'finance.approve_expenses'], // + approval decisions on POs and expenses (POST /approvals/:docType/:docId/decision)
  'finance:delete': ['finance.delete'],
  'finance:finance.settings.read': ['finance.view_settings'],
  'finance:finance.settings.write': ['finance.edit_settings'],
  'finance:read': ['finance.view', 'settings.view_approvals', 'vendor-bills.view', 'finance.export'],
  'finance:write': ['finance.edit'], // not settings.manage_approvals: PUT approval rules also needed ADMINISTRATION
  // invoices
  'invoices:create': ['invoices.edit', 'invoices.send', 'invoices.create'],
  'invoices:delete': ['invoices.delete'],
  'invoices:invoices.pdf.read': ['invoices.print'],
  'invoices:pay': ['invoices.pay'],
  'invoices:read': ['invoices.view'],
  'invoices:write': ['invoices.edit'],
  // vendor-bills
  'vendor-bills:create': ['vendor-bills.create'],
  'vendor-bills:delete': ['vendor-bills.delete'],
  'vendor-bills:pay': ['vendor-bills.pay'],
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
  'contacts:delete': ['contacts.delete'],
  'contacts:read': ['contacts.view', 'contacts.export', 'influencers.export'],
  'contacts:suppliers.read': ['contacts.view_details'],
  'contacts:write': ['contacts.manage'],
  // crm
  'crm:contributions.create': ['crm.manage_pipeline'],
  'crm:contributions.delete': ['crm.manage_pipeline'],
  'crm:create': ['crm.edit', 'crm.create'],
  'crm:crm-performance.read': ['crm.view_performance'],
  'crm:delete': ['crm.delete'],
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
  'whatsapp:read': ['whatsapp.view_connection'],
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
  // Record rules that grant an action (not just a wider scope).
  'tasks:time-entries.delete': ['tasks.delete_time'], // TIME_ENTRIES_DELETE_OTHERS
  'contacts:portal.manage': ['portal.view', 'portal.manage_access', 'portal.handle_requests', 'portal.manage_catalogue', 'portal.approve', 'influencers.review'], // PORTAL_ACCESS_MANAGE
  'campaigns:games.manage': ['games.view', 'games.manage'], // GAMES_MANAGE
  'campaigns:discover.manage': ['discover.view', 'discover.manage'], // DISCOVER_MANAGE
  'invoices:credit.override': ['invoices.override_credit'], // INVOICES_CREDIT_OVERRIDE
  'dashboard:operations.read': ['dashboard.view_operations'], // DASHBOARD_OPERATIONS_READ
  'dashboard:finance.read': ['dashboard.view_finance'], // DASHBOARD_FINANCE_READ
  'settings:users.write': ['people.manage'], // USERS_WRITE
  'settings:administration.write': ['people.manage_roles', 'settings.manage_approvals'], // ADMINISTRATION
  'settings:groups.read': ['people.view_roles'], // GROUPS_READ
};

/**
 * Scope rules: raise these keys to `company` scope, only where the converted
 * group already holds the key (from OLD_TO_NEW). They never add a key.
 */
export const OLD_RULE_SCOPES: Readonly<Record<string, { readonly keys: readonly string[]; readonly scope: 'company' }>> = {
  'projects:all.read': { keys: ['projects.view'], scope: 'company' }, // PROJECTS_ALL_READ
  // requireTaskViewAccess also decides who may edit or delete a task.
  'tasks:all.read': { keys: ['tasks.view', 'tasks.edit', 'tasks.delete'], scope: 'company' }, // TASKS_ALL_READ
  // Conversations follow contact visibility.
  'contacts:private.read': { keys: ['contacts.view', 'inbox.view'], scope: 'company' }, // CONTACTS_PRIVATE_READ
  'contacts:all.write': { keys: ['contacts.edit'], scope: 'company' }, // CONTACTS_ALL_WRITE
  'crm:all.read': { keys: ['crm.view'], scope: 'company' }, // CRM_ALL_READ
  'crm:all.write': { keys: ['crm.edit', 'crm.delete'], scope: 'company' }, // CRM_ALL_WRITE
  'campaigns:all.read': { keys: ['campaigns.view'], scope: 'company' }, // CAMPAIGNS_ALL_READ
  'campaigns:all.write': { keys: ['campaigns.edit'], scope: 'company' }, // CAMPAIGNS_ALL_WRITE
  'commissions:all.read': { keys: ['commissions.view'], scope: 'company' }, // COMMISSIONS_ALL_READ
  'whatsapp:private.read': { keys: ['whatsapp.view'], scope: 'company' }, // WHATSAPP_PRIVATE_READ
};

/** Record rules that became sensitive-field switches (view and edit) rather than actions. */
export const OLD_TO_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'contacts:pricing.read': ['rate_cards', 'client_terms'], // CONTACTS_PRICING_READ
  'payroll:pay.read': ['salary', 'personal_ids', 'bank_details'], // PAYROLL_PAY_READ
};
