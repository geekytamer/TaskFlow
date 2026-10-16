/**
 * The permission catalogue: areas × actions, written by hand for people.
 *
 * Code, not data. Each area lists the actions someone can be given, with an
 * English and an Arabic label an administrator can read ("Approve purchase
 * orders"), never a name scraped from a route path. Labels live here, next to
 * the action they describe (no separate labels file).
 *
 * Where routes in one area allowed different roles for what is the same
 * verb, the area has a separate, human-named action for the narrower one
 * (e.g. `finance.settings` beside `finance.view`). That keeps today's role
 * behaviour expressible exactly; see templates.ts.
 *
 * Scopes apply only to actions marked `scoped`, and only on areas whose
 * records have an owner today. Limits are declared on approve-style actions;
 * 1a grants them without a ceiling, 1b fills them in.
 */

export const SCOPES = ['own', 'team', 'company', 'group'] as const;
export type Scope = (typeof SCOPES)[number];

export interface Label { en: string; ar: string }

export interface ActionDef {
  key: string;
  label: Label;
  /** Takes an own/team/company/group scope (view, edit, delete on owned records). */
  scoped?: boolean;
  /** Takes a numeric ceiling in 1b: an amount in company currency, or a percentage. */
  limit?: 'amount' | 'percent';
}

export type AreaGroup = 'operations' | 'finance' | 'crm' | 'hr' | 'core';

export interface AreaDef {
  key: string;
  label: Label;
  group: AreaGroup;
  actions: ActionDef[];
  /** Scopes the area's scoped actions accept. Present only when the area has scoped actions. */
  scopes?: Scope[];
  /** How `own` reads for this area, and what anyone with view sees regardless of scope. */
  ownership?: Label;
}

export interface SensitiveFieldDef {
  key: string;
  label: Label;
  /** The area whose records carry the field (where the switch is shown). */
  area: string;
}

const ALL_SCOPES: Scope[] = [...SCOPES];
const l = (en: string, ar: string): Label => ({ en, ar });

export const CATALOGUE: readonly AreaDef[] = [
  // ─── Core ─────────────────────────────────────────────────────────────
  {
    key: 'dashboard', group: 'core', label: l('Dashboard', 'لوحة المعلومات'),
    actions: [
      { key: 'view', label: l('Open the dashboard and search', 'فتح لوحة المعلومات والبحث') },
      { key: 'view_operations', label: l('See operations figures on the dashboard', 'عرض أرقام العمليات في لوحة المعلومات') },
      { key: 'view_finance', label: l('See finance figures on the dashboard', 'عرض الأرقام المالية في لوحة المعلومات') },
    ],
  },

  // ─── Operations ───────────────────────────────────────────────────────
  {
    key: 'sales', group: 'operations', label: l('Sales', 'المبيعات'),
    actions: [
      { key: 'view', label: l('See quotations and sales orders', 'عرض عروض الأسعار وأوامر البيع') },
      { key: 'create', label: l('Create quotations and sales orders', 'إنشاء عروض الأسعار وأوامر البيع') },
      { key: 'edit', label: l('Edit quotations and sales orders', 'تعديل عروض الأسعار وأوامر البيع') },
      { key: 'delete', label: l('Delete quotations', 'حذف عروض الأسعار') },
    ],
  },
  {
    key: 'purchasing', group: 'operations', label: l('Purchasing', 'المشتريات'),
    actions: [
      { key: 'view', label: l('See purchase orders, requisitions and RFQs', 'عرض أوامر الشراء وطلبات الشراء وطلبات عروض الأسعار') },
      { key: 'create', label: l('Create purchase orders, requisitions and RFQs', 'إنشاء أوامر الشراء وطلبات الشراء وطلبات عروض الأسعار') },
      { key: 'edit', label: l('Edit purchase orders, requisitions and RFQs', 'تعديل أوامر الشراء وطلبات الشراء وطلبات عروض الأسعار') },
      { key: 'delete', label: l('Delete RFQs and supplier quotes', 'حذف طلبات عروض الأسعار وعروض الموردين') },
      { key: 'approve', label: l('Approve or reject purchase orders and requisitions', 'اعتماد أوامر الشراء وطلبات الشراء أو رفضها'), limit: 'amount' },
      { key: 'approve_step', label: l('Approve a step in a purchase order approval chain', 'اعتماد خطوة في سلسلة اعتماد أمر الشراء') },
    ],
  },
  {
    key: 'inventory', group: 'operations', label: l('Inventory', 'المخزون'),
    actions: [
      { key: 'view', label: l('See items, stock, lots and warehouses', 'عرض الأصناف والمخزون والدفعات والمستودعات') },
      { key: 'create', label: l('Add items, lots, stock counts and stock movements', 'إضافة الأصناف والدفعات والجرد وحركات المخزون') },
      { key: 'edit', label: l('Edit stock counts', 'تعديل الجرد') },
      { key: 'delete', label: l('Delete items and stock counts', 'حذف الأصناف والجرد') },
      { key: 'post', label: l('Post stock counts', 'ترحيل الجرد') },
      { key: 'export', label: l('Export items', 'تصدير الأصناف') },
      { key: 'manage_items', label: l('Edit and restore items, and manage warehouses', 'تعديل الأصناف واستعادتها وإدارة المستودعات') },
    ],
  },
  {
    key: 'manufacturing', group: 'operations', label: l('Manufacturing', 'التصنيع'),
    actions: [
      { key: 'view', label: l('See recipes and work orders', 'عرض الوصفات وأوامر العمل') },
      { key: 'create', label: l('Create recipes and work orders', 'إنشاء الوصفات وأوامر العمل') },
      { key: 'edit', label: l('Edit and complete work orders and recipes', 'تعديل أوامر العمل والوصفات وإكمالها') },
      { key: 'delete', label: l('Delete recipes and work orders', 'حذف الوصفات وأوامر العمل') },
      { key: 'cancel', label: l('Cancel work orders', 'إلغاء أوامر العمل') },
    ],
  },
  {
    key: 'logistics', group: 'operations', label: l('Deliveries and returns', 'التسليم والمرتجعات'),
    actions: [
      { key: 'view', label: l('See deliveries, shipments and customer returns', 'عرض عمليات التسليم والشحنات ومرتجعات العملاء') },
      { key: 'create', label: l('Create deliveries, shipments and customer returns', 'إنشاء عمليات التسليم والشحنات ومرتجعات العملاء') },
      { key: 'edit', label: l('Update deliveries, shipments and returns', 'تحديث عمليات التسليم والشحنات والمرتجعات') },
      { key: 'delete', label: l('Delete shipments', 'حذف الشحنات') },
      { key: 'cancel', label: l('Cancel deliveries and returns', 'إلغاء عمليات التسليم والمرتجعات') },
      { key: 'print', label: l('Download delivery notes', 'تنزيل مذكرات التسليم') },
    ],
  },
  {
    key: 'quality', group: 'operations', label: l('Quality', 'الجودة'),
    actions: [
      { key: 'view', label: l('See inspections, lot traces and storage readings', 'عرض الفحوصات وتتبع الدفعات وقراءات التخزين') },
      { key: 'create', label: l('Record inspections and storage readings', 'تسجيل الفحوصات وقراءات التخزين') },
    ],
  },
  {
    key: 'projects', group: 'operations', label: l('Projects', 'المشاريع'),
    scopes: ALL_SCOPES,
    ownership: l(
      'Own: projects they belong to. Public projects are visible to anyone with view.',
      'الخاصة: المشاريع التي ينتمي إليها. المشاريع العامة يراها كل من لديه صلاحية العرض.',
    ),
    actions: [
      { key: 'view', label: l('See projects', 'عرض المشاريع'), scoped: true },
      { key: 'create', label: l('Create projects', 'إنشاء المشاريع') },
      { key: 'edit', label: l('Edit projects and their members', 'تعديل المشاريع وأعضائها') },
      { key: 'delete', label: l('Delete projects', 'حذف المشاريع') },
    ],
  },
  {
    key: 'tasks', group: 'operations', label: l('Tasks', 'المهام'),
    scopes: ALL_SCOPES,
    ownership: l(
      'Own: tasks assigned to them or in projects they can see.',
      'الخاصة: المهام المسندة إليه أو الموجودة في مشاريع يمكنه رؤيتها.',
    ),
    actions: [
      { key: 'view', label: l('See tasks', 'عرض المهام'), scoped: true },
      { key: 'create', label: l('Create tasks', 'إنشاء المهام') },
      { key: 'edit', label: l('Edit tasks and log time', 'تعديل المهام وتسجيل الوقت'), scoped: true },
      { key: 'delete', label: l('Delete tasks', 'حذف المهام'), scoped: true },
      { key: 'delete_time', label: l("Delete other people's time entries", 'حذف سجلات وقت الآخرين') },
    ],
  },
  {
    key: 'documents', group: 'operations', label: l('Documents', 'المستندات'),
    actions: [
      { key: 'view', label: l('See documents, templates and attachments', 'عرض المستندات والقوالب والمرفقات') },
      { key: 'create', label: l('Create documents and attach files', 'إنشاء المستندات وإرفاق الملفات') },
      { key: 'edit', label: l('Edit documents and templates', 'تعديل المستندات والقوالب') },
      { key: 'delete', label: l('Delete documents, templates and attachments', 'حذف المستندات والقوالب والمرفقات') },
    ],
  },

  // ─── Finance ──────────────────────────────────────────────────────────
  {
    key: 'invoices', group: 'finance', label: l('Invoices', 'الفواتير'),
    actions: [
      { key: 'view', label: l('See invoices and credit notes', 'عرض الفواتير وإشعارات الدائن') },
      { key: 'create', label: l('Create invoices and credit notes', 'إنشاء الفواتير وإشعارات الدائن') },
      { key: 'edit', label: l('Edit invoices, templates and reminders', 'تعديل الفواتير والقوالب والتذكيرات') },
      { key: 'delete', label: l('Delete invoices, templates and payments', 'حذف الفواتير والقوالب والمدفوعات') },
      { key: 'send', label: l('Email invoices to clients', 'إرسال الفواتير للعملاء بالبريد') },
      { key: 'pay', label: l('Record invoice payments', 'تسجيل مدفوعات الفواتير') },
      { key: 'print', label: l('Download invoice PDFs', 'تنزيل الفواتير بصيغة PDF') },
      { key: 'override_credit', label: l("Invoice past a client's credit limit", 'إصدار فاتورة تتجاوز حد ائتمان العميل'), limit: 'amount' },
    ],
  },
  {
    key: 'vendor-bills', group: 'finance', label: l('Vendor bills', 'فواتير الموردين'),
    actions: [
      { key: 'view', label: l('See vendor bills and payables', 'عرض فواتير الموردين والمستحقات') },
      { key: 'create', label: l('Create vendor bills', 'إنشاء فواتير الموردين') },
      { key: 'edit', label: l('Edit vendor bills', 'تعديل فواتير الموردين') },
      { key: 'delete', label: l('Delete vendor bills and payments', 'حذف فواتير الموردين والمدفوعات') },
      { key: 'pay', label: l('Pay vendor bills', 'سداد فواتير الموردين') },
    ],
  },
  {
    key: 'finance', group: 'finance', label: l('Accounting', 'المحاسبة'),
    actions: [
      { key: 'view', label: l('See accounts, journals, bank, budgets, assets and reports', 'عرض الحسابات والقيود والبنك والميزانيات والأصول والتقارير') },
      { key: 'create', label: l('Add accounts, budgets, assets, expenses and VAT returns', 'إضافة الحسابات والميزانيات والأصول والمصروفات وإقرارات الضريبة') },
      { key: 'edit', label: l('Edit accounts, budgets, assets and expenses', 'تعديل الحسابات والميزانيات والأصول والمصروفات') },
      { key: 'delete', label: l('Delete accounts, budgets, assets and VAT returns', 'حذف الحسابات والميزانيات والأصول وإقرارات الضريبة') },
      { key: 'post', label: l('Post and reverse journal entries, reconcile the bank, run depreciation', 'ترحيل القيود وعكسها وتسوية البنك واحتساب الإهلاك') },
      { key: 'export', label: l('Export finance data and reports', 'تصدير البيانات والتقارير المالية') },
      { key: 'approve_expenses', label: l('Approve expenses', 'اعتماد المصروفات'), limit: 'amount' },
      { key: 'view_settings', label: l('See finance settings (currency, tax)', 'عرض الإعدادات المالية (العملة والضريبة)') },
      { key: 'settings', label: l('Change finance settings', 'تغيير الإعدادات المالية') },
    ],
  },
  {
    key: 'commissions', group: 'finance', label: l('Commissions', 'العمولات'),
    scopes: ALL_SCOPES,
    ownership: l('Own: commissions earned by them.', 'الخاصة: العمولات المستحقة له.'),
    actions: [
      { key: 'view', label: l('See commissions and commission rules', 'عرض العمولات وقواعدها'), scoped: true },
      { key: 'create', label: l('Add commission rules and recompute commissions', 'إضافة قواعد العمولات وإعادة احتسابها') },
      { key: 'edit', label: l('Edit commission rules and statuses', 'تعديل قواعد العمولات وحالاتها') },
      { key: 'delete', label: l('Delete commission rules', 'حذف قواعد العمولات') },
      { key: 'approve', label: l('Approve commissions', 'اعتماد العمولات') },
      { key: 'pay', label: l('Pay commissions', 'صرف العمولات') },
      { key: 'void', label: l('Void commissions', 'إلغاء العمولات') },
    ],
  },

  // ─── HR ───────────────────────────────────────────────────────────────
  {
    key: 'hr', group: 'hr', label: l('People and HR', 'الموارد البشرية'),
    actions: [
      { key: 'view', label: l('See employees, departments and leave', 'عرض الموظفين والأقسام والإجازات') },
      { key: 'create', label: l('Add employees, departments, leave and attendance', 'إضافة الموظفين والأقسام والإجازات والحضور') },
      { key: 'edit', label: l('Edit employees, departments and leave types', 'تعديل الموظفين والأقسام وأنواع الإجازات') },
      { key: 'delete', label: l('Delete attendance records', 'حذف سجلات الحضور') },
      { key: 'approve', label: l('Approve or reject leave requests', 'اعتماد طلبات الإجازة أو رفضها') },
      { key: 'view_attendance', label: l('See attendance and end-of-service gratuity', 'عرض الحضور ومكافأة نهاية الخدمة') },
    ],
  },
  {
    key: 'payroll', group: 'hr', label: l('Payroll', 'الرواتب'),
    actions: [
      { key: 'view', label: l('See payroll runs', 'عرض مسيرات الرواتب') },
      { key: 'create', label: l('Create payroll runs', 'إنشاء مسيرات الرواتب') },
      { key: 'edit', label: l('Change payroll run status', 'تغيير حالة مسير الرواتب') },
      { key: 'delete', label: l('Delete payroll runs', 'حذف مسيرات الرواتب') },
      { key: 'export', label: l('Download WPS salary files', 'تنزيل ملفات حماية الأجور') },
    ],
  },
  {
    key: 'academy', group: 'hr', label: l('Academy', 'الأكاديمية'),
    actions: [
      { key: 'view', label: l("Take training and see the team's progress", 'أداء التدريب ومتابعة تقدّم الفريق') },
    ],
  },

  // ─── CRM ──────────────────────────────────────────────────────────────
  {
    key: 'crm', group: 'crm', label: l('Pipeline', 'الفرص البيعية'),
    scopes: ALL_SCOPES,
    ownership: l(
      'Own: opportunities, proposals, follow-ups and vendor requests they own or are assigned to.',
      'الخاصة: الفرص والعروض والمتابعات وطلبات الموردين التي يملكها أو المسندة إليه.',
    ),
    actions: [
      { key: 'view', label: l('See opportunities, proposals, follow-ups and vendor requests', 'عرض الفرص والعروض والمتابعات وطلبات الموردين'), scoped: true },
      { key: 'create', label: l('Create opportunities, proposals, follow-ups and vendor requests', 'إنشاء الفرص والعروض والمتابعات وطلبات الموردين') },
      { key: 'edit', label: l('Edit opportunities, proposals, follow-ups and vendor requests', 'تعديل الفرص والعروض والمتابعات وطلبات الموردين'), scoped: true },
      { key: 'delete', label: l('Delete opportunities, proposals and vendor requests', 'حذف الفرص والعروض وطلبات الموردين'), scoped: true },
      { key: 'approve', label: l('Approve or reject vendor requests', 'اعتماد طلبات الموردين أو رفضها') },
      { key: 'manage_team', label: l("Reassign follow-ups and see the team's workload", 'إعادة إسناد المتابعات ومتابعة عبء عمل الفريق') },
      { key: 'view_performance', label: l('See sales performance', 'عرض أداء المبيعات') },
      { key: 'manage_pipeline', label: l('Manage sales credit, recalculate commissions, sweep overdue follow-ups', 'إدارة نسب المبيعات وإعادة احتساب العمولات ومعالجة المتابعات المتأخرة') },
    ],
  },
  {
    key: 'contacts', group: 'crm', label: l('Contacts', 'جهات الاتصال'),
    scopes: ALL_SCOPES,
    ownership: l(
      'Own: private contacts they own. Public contacts are visible to anyone with view.',
      'الخاصة: جهات الاتصال الخاصة التي يملكها. جهات الاتصال العامة يراها كل من لديه صلاحية العرض.',
    ),
    actions: [
      { key: 'view', label: l('See contacts', 'عرض جهات الاتصال'), scoped: true },
      { key: 'view_details', label: l('See full contact records, clients, suppliers and activity', 'عرض سجلات جهات الاتصال كاملة والعملاء والموردين والنشاط') },
      { key: 'create', label: l('Add contacts', 'إضافة جهات الاتصال') },
      { key: 'edit', label: l('Update contacts (status, owner, follow-up, visibility)', 'تحديث جهات الاتصال (الحالة والمالك والمتابعة والظهور)'), scoped: true },
      { key: 'manage', label: l('Edit full records, add clients and suppliers, import, log activity', 'تعديل السجلات كاملة وإضافة العملاء والموردين والاستيراد وتسجيل النشاط') },
      { key: 'delete', label: l('Delete contacts', 'حذف جهات الاتصال') },
      { key: 'export', label: l('Export contacts', 'تصدير جهات الاتصال') },
    ],
  },
  {
    key: 'influencers', group: 'crm', label: l('Influencers', 'المؤثرون'),
    actions: [
      { key: 'view', label: l('See influencers and their photos', 'عرض المؤثرين وصورهم') },
      { key: 'create', label: l('Import influencers', 'استيراد المؤثرين') },
      { key: 'export', label: l('Export influencers', 'تصدير المؤثرين') },
      { key: 'workspace', label: l("Open an influencer's creator workspace", 'فتح مساحة عمل المؤثر') },
      { key: 'review', label: l('Review briefs, content submissions and profile changes', 'مراجعة الملخصات والمحتوى المقدّم وتعديلات الملف') },
    ],
  },
  {
    key: 'campaigns', group: 'crm', label: l('Campaigns', 'الحملات'),
    scopes: ALL_SCOPES,
    ownership: l('Own: campaigns they own or are assigned to.', 'الخاصة: الحملات التي يملكها أو المسندة إليه.'),
    actions: [
      { key: 'view', label: l('See campaigns', 'عرض الحملات'), scoped: true },
      { key: 'create', label: l('Create campaigns and add deliverables, assignments and expenses', 'إنشاء الحملات وإضافة المخرجات والإسنادات والمصروفات') },
      { key: 'edit', label: l('Edit campaigns, deliverables, assignments and expenses', 'تعديل الحملات والمخرجات والإسنادات والمصروفات'), scoped: true },
      { key: 'delete', label: l('Delete campaigns', 'حذف الحملات') },
      { key: 'invoice', label: l('Invoice clients for campaigns', 'إصدار فواتير الحملات للعملاء') },
    ],
  },
  {
    key: 'portal', group: 'crm', label: l('Client and influencer portals', 'بوابات العملاء والمؤثرين'),
    actions: [
      { key: 'view', label: l('See portal requests, referrals and files', 'عرض طلبات البوابة والإحالات والملفات') },
      { key: 'manage_access', label: l('Invite, disable and enable portal users', 'دعوة مستخدمي البوابة وتعطيلهم وتفعيلهم') },
      { key: 'handle_requests', label: l('Handle client requests and referrals', 'معالجة طلبات العملاء والإحالات') },
      { key: 'manage_catalogue', label: l('Manage the client catalogue, price ranges and pricing profiles', 'إدارة كتالوج العملاء ونطاقات الأسعار وملفات التسعير') },
      { key: 'approve', label: l('Approve, void or credit referral commissions', 'اعتماد عمولات الإحالة أو إلغاؤها أو قيدها دائنًا') },
    ],
  },
  {
    key: 'discover', group: 'crm', label: l('Influencer directory', 'دليل المؤثرين'),
    actions: [
      { key: 'view', label: l('See the influencer directory photos', 'عرض صور دليل المؤثرين') },
      { key: 'manage', label: l('Run the influencer directory clients see', 'إدارة دليل المؤثرين الذي يراه العملاء') },
    ],
  },
  {
    key: 'games', group: 'crm', label: l('Engagement games', 'ألعاب التفاعل'),
    actions: [
      { key: 'view', label: l('See engagement games and scoreboards', 'عرض ألعاب التفاعل ولوحات النتائج') },
      { key: 'manage', label: l('Create and run engagement games', 'إنشاء ألعاب التفاعل وإدارتها') },
    ],
  },
  {
    key: 'inbox', group: 'crm', label: l('Conversations', 'المحادثات'),
    scopes: ALL_SCOPES,
    ownership: l(
      'Own: conversations with contacts they can see (private contacts they own, and public ones).',
      'الخاصة: المحادثات مع جهات الاتصال التي يمكنه رؤيتها (الخاصة التي يملكها والعامة).',
    ),
    actions: [
      { key: 'view', label: l('See conversations', 'عرض المحادثات'), scoped: true },
      { key: 'send', label: l('Reply, attach files and assign conversations', 'الرد وإرفاق الملفات وإسناد المحادثات') },
      { key: 'settings', label: l('Change conversation settings', 'تغيير إعدادات المحادثات') },
    ],
  },
  {
    key: 'whatsapp', group: 'crm', label: l('WhatsApp', 'واتساب'),
    scopes: ALL_SCOPES,
    ownership: l('Own: private chats they own. Shared chats are visible to anyone with view.', 'الخاصة: المحادثات الخاصة التي يملكها. المحادثات المشتركة يراها كل من لديه صلاحية العرض.'),
    actions: [
      { key: 'view', label: l('See WhatsApp chats', 'عرض محادثات واتساب'), scoped: true },
      { key: 'send', label: l('Send WhatsApp messages and open chats', 'إرسال رسائل واتساب وفتح المحادثات') },
      { key: 'edit', label: l('Change chat settings and sync history', 'تغيير إعدادات المحادثة ومزامنة السجل') },
      { key: 'manage', label: l('Connect and configure the WhatsApp number', 'ربط رقم واتساب وإعداده') },
    ],
  },

  // ─── Administration ───────────────────────────────────────────────────
  {
    key: 'settings', group: 'core', label: l('Company settings', 'إعدادات الشركة'),
    actions: [
      { key: 'view', label: l('See company details and custom fields', 'عرض بيانات الشركة والحقول المخصصة') },
      { key: 'edit', label: l('Change company details, numbering and custom fields', 'تغيير بيانات الشركة والترقيم والحقول المخصصة') },
      { key: 'view_activity', label: l('See the company activity log', 'عرض سجل نشاط الشركة') },
      { key: 'view_approvals', label: l('See approval rules and pending approvals', 'عرض قواعد الاعتماد والاعتمادات المعلقة') },
      { key: 'manage_approvals', label: l('Change approval rules', 'تغيير قواعد الاعتماد') },
    ],
  },
  {
    key: 'people', group: 'core', label: l('Users and roles', 'المستخدمون والأدوار'),
    actions: [
      { key: 'view', label: l('See who is in the company', 'عرض أعضاء الشركة') },
      { key: 'manage', label: l('Add, edit and remove users', 'إضافة المستخدمين وتعديلهم وإزالتهم') },
      { key: 'view_roles', label: l('See roles and who has them', 'عرض الأدوار ومن يحملها') },
      { key: 'manage_roles', label: l('Manage roles and give people admin rights', 'إدارة الأدوار ومنح صلاحيات الإدارة') },
    ],
  },
];

export const SENSITIVE_FIELDS: readonly SensitiveFieldDef[] = [
  { key: 'salary', area: 'payroll', label: l('Salaries (pay, allowances, payslips)', 'الرواتب (الأجر والبدلات وقسائم الراتب)') },
  { key: 'personal_ids', area: 'hr', label: l('ID numbers (passport, civil ID, visa)', 'أرقام الهوية (جواز السفر والبطاقة المدنية والتأشيرة)') },
  { key: 'bank_details', area: 'payroll', label: l('Bank details (IBAN)', 'البيانات المصرفية (الآيبان)') },
  { key: 'cost_prices', area: 'inventory', label: l('Cost prices and margins', 'أسعار التكلفة والهوامش') },
  { key: 'rate_cards', area: 'influencers', label: l('Influencer rate cards', 'أسعار المؤثرين') },
  { key: 'client_terms', area: 'contacts', label: l('Client pricing, discounts and credit limits', 'تسعير العملاء والخصومات وحدود الائتمان') },
];

export function permissionKey(area: string, action: string): string {
  return `${area}.${action}`;
}

/** The area of a permission key ('vendor-bills.pay' → 'vendor-bills'). */
export function areaOf(key: string): string {
  const dot = key.indexOf('.');
  return dot < 0 ? key : key.slice(0, dot);
}

export function findAction(key: string): { area: AreaDef; action: ActionDef } | undefined {
  const area = CATALOGUE.find((a) => a.key === areaOf(key));
  const action = area?.actions.find((a) => permissionKey(area.key, a.key) === key);
  return area && action ? { area, action } : undefined;
}

export function allPermissionKeys(): string[] {
  return CATALOGUE.flatMap((area) => area.actions.map((a) => permissionKey(area.key, a.key)));
}

export function isPermissionKey(key: string): boolean {
  return findAction(key) !== undefined;
}
