export interface TourStep {
  target: string;
  en: { title: string; desc: string };
  ar: { title: string; desc: string };
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Navigate here before showing this step (overrides the tour route). */
  route?: string;
  /**
   * Interaction to perform before the step is measured — used to open a dialog
   * or sheet so the guide can walk through it. `click` is a CSS selector.
   */
  action?: { click: string; delay?: number };
  /** If the target may not exist (feature/role-gated), don't stall the tour. */
  optional?: boolean;
}

/** Groups tours on the guide page. Mirrors how the sidebar is organised. */
export type TourCategory =
  | 'start'
  | 'operations'
  | 'finance'
  | 'crm'
  | 'people'
  | 'admin';

export const TOUR_CATEGORIES: Array<{ id: TourCategory; en: string; ar: string; blurb_en: string; blurb_ar: string }> = [
  { id: 'start', en: 'Getting Started', ar: 'البداية',
    blurb_en: 'Begin here for the shape of the whole system.',
    blurb_ar: 'ابدأ هنا لفهم شكل النظام بالكامل.' },
  { id: 'operations', en: 'Operations', ar: 'العمليات',
    blurb_en: 'Selling, buying, stock and production.',
    blurb_ar: 'البيع والشراء والمخزون والإنتاج.' },
  { id: 'finance', en: 'Finance', ar: 'المالية',
    blurb_en: 'Invoicing, the ledger, and what the numbers mean.',
    blurb_ar: 'الفوترة ودفتر الأستاذ ومعنى الأرقام.' },
  { id: 'crm', en: 'CRM & Marketing', ar: 'إدارة العلاقات والتسويق',
    blurb_en: 'Contacts, pipeline, campaigns and follow-ups.',
    blurb_ar: 'جهات الاتصال وخط الأنابيب والحملات والمتابعات.' },
  { id: 'people', en: 'People & Projects', ar: 'الأفراد والمشاريع',
    blurb_en: 'Work, time, employees and payroll.',
    blurb_ar: 'العمل والوقت والموظفون والرواتب.' },
  { id: 'admin', en: 'Administration', ar: 'الإدارة',
    blurb_en: 'Companies, users and system settings.',
    blurb_ar: 'الشركات والمستخدمون وإعدادات النظام.' },
];

/** Roles as used by the page guards. */
export type TourRole = 'Admin' | 'Manager' | 'Employee' | 'Accountant';

export interface Tour {
  id: string;
  en: string;
  ar: string;
  /** Page this tour lives on; the guide navigates here when it starts. */
  route?: string;
  /** Which section of the guide page this tour belongs to. */
  category?: TourCategory;
  /**
   * Roles that can actually open this tour's page. Mirrors the route's own
   * guard — offering a walkthrough of a page the user would be bounced out of
   * is worse than not offering it. Omit when the page is open to everyone.
   */
  roles?: TourRole[];
  steps: TourStep[];
}

/** Does this tour apply to the given role? Unrestricted tours apply to all. */
export function tourAllowsRole(tour: Tour, role?: string | null): boolean {
  if (!tour.roles) return true;
  if (!role) return false;
  return tour.roles.includes(role as TourRole);
}

export const TOURS: Tour[] = [
  // ─────────────────────────────────────────────
  // SYSTEM OVERVIEW
  // ─────────────────────────────────────────────
  {
    id: 'overview',
    category: 'start',
    en: 'System Overview',
    ar: 'نظرة عامة على النظام',
    route: '/',
    steps: [
      {
        target: '[data-tutorial="sidebar-nav"]',
        en: { title: 'Navigation Sidebar', desc: 'This sidebar is your main navigation hub. Every module in TaskFlow — CRM, Finance, Operations, Projects, and HR — is accessible from here. You can collapse it to gain more screen space on smaller displays.' },
        ar: { title: 'الشريط الجانبي للتنقل', desc: 'هذا الشريط الجانبي هو مركز التنقل الرئيسي. كل وحدة في TaskFlow — إدارة علاقات العملاء والمالية والعمليات والمشاريع والموارد البشرية — يمكن الوصول إليها من هنا. يمكنك طيه للحصول على مساحة أكبر.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-dashboard"]',
        en: { title: 'Dashboard', desc: 'Your command center. The dashboard adapts to your role — Admins see company-wide financials and team workload, Managers see their team\'s KPIs, and Employees see their personal task queue. Everything is live and updates in real time.' },
        ar: { title: 'لوحة التحكم', desc: 'مركز القيادة. تتكيف لوحة التحكم مع دورك — يرى المديرون الإداريون الأداء المالي للشركة وعبء العمل، ويرى المديرون مؤشرات فريقهم، ويرى الموظفون قائمة مهامهم الشخصية. كل شيء مباشر ويتحدث في الوقت الفعلي.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-contacts"]',
        en: { title: 'Contacts & Leads', desc: 'A unified directory for every person or organization you work with. One contact can hold multiple roles — a person can be a Lead, a Client, a Vendor, and a Partner all at once. No duplicates, no switching between modules.' },
        ar: { title: 'جهات الاتصال والعملاء المحتملون', desc: 'دليل موحد لكل شخص أو مؤسسة تتعامل معها. يمكن لجهة اتصال واحدة أن تحمل أدواراً متعددة — يمكن أن يكون الشخص عميلاً محتملاً وعميلاً ومورداً وشريكاً في آنٍ واحد. لا تكرار، لا تنقل بين الوحدات.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-pipeline"]',
        en: { title: 'CRM Pipeline', desc: 'Manage your entire sales funnel in one place. Track Opportunities through Kanban stages, approve Vendor and Influencer Requests, manage Campaigns, and view Commissions earned by your sales team.' },
        ar: { title: 'خط أنابيب المبيعات', desc: 'أدر قمع المبيعات بالكامل في مكان واحد. تتبع الفرص عبر مراحل كانبان، وافق على طلبات الموردين والمؤثرين، أدر الحملات، واعرض العمولات التي حققها فريق المبيعات.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-followups"]',
        en: { title: 'Follow-Up Center', desc: 'A prioritized list of every scheduled follow-up action across your team. Overdue items appear in red. Use this page as your daily sales checklist — mark items done, reschedule, or jump directly to the contact.' },
        ar: { title: 'مركز المتابعة', desc: 'قائمة مرتبة بحسب الأولوية لكل إجراء متابعة مجدول عبر فريقك. العناصر المتأخرة تظهر باللون الأحمر. استخدم هذه الصفحة كقائمة تحقق يومية للمبيعات — أكمل العناصر أو أعد جدولتها أو انتقل مباشرة إلى جهة الاتصال.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-sales"]',
        en: { title: 'Sales Orders', desc: 'Create and manage sales orders from quote to invoicing. Sales orders link to inventory items and clients, and once confirmed, can be converted to invoices with a single click. Track open, confirmed, invoiced, and cancelled orders.' },
        ar: { title: 'أوامر البيع', desc: 'أنشئ وأدر أوامر البيع من عرض الأسعار حتى الفوترة. تربط أوامر البيع بعناصر المخزون والعملاء، وبمجرد تأكيدها يمكن تحويلها إلى فواتير بنقرة واحدة. تتبع الأوامر المفتوحة والمؤكدة والمفوترة والملغاة.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-projects"]',
        en: { title: 'Projects & Tasks', desc: 'Manage all your projects and tasks in one view. Projects are linked to clients and can contain multiple tasks. Tasks can have billable amounts attached, which flow automatically into the invoice creation workflow.' },
        ar: { title: 'المشاريع والمهام', desc: 'أدر جميع مشاريعك ومهامك في عرض واحد. المشاريع مرتبطة بالعملاء ويمكن أن تحتوي على مهام متعددة. يمكن أن تحتوي المهام على مبالغ قابلة للفوترة تتدفق تلقائياً إلى سير عمل إنشاء الفواتير.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-purchases"]',
        en: { title: 'Purchases', desc: 'The full procurement lifecycle lives here. Create Purchase Orders from your inventory catalog, receive stock when shipments arrive (updating inventory automatically), and track what has been billed and what remains unbilled.' },
        ar: { title: 'المشتريات', desc: 'تتواجد دورة المشتريات الكاملة هنا. أنشئ أوامر شراء من كتالوج المخزون، استلم المخزون عند وصول الشحنات (مع تحديث المخزون تلقائياً)، وتتبع ما تم فوترته وما لم يتم بعد.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-finance"]',
        en: { title: 'Finance Module', desc: 'The complete accounting suite. Manage invoices and payments under Invoices, vendor bills under Payables, your Chart of Accounts and journal entries under Ledger, financial reports under Reports, and employee expenses under Expenses.' },
        ar: { title: 'وحدة المالية', desc: 'مجموعة المحاسبة الكاملة. أدر الفواتير والمدفوعات تحت الفواتير، وفواتير الموردين تحت الذمم الدائنة، ودليل الحسابات وقيود اليومية تحت دفتر الأستاذ، والتقارير المالية تحت التقارير، ومصروفات الموظفين تحت المصروفات.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="nav-performance"]',
        en: { title: 'Performance Dashboard', desc: 'A leaderboard for your sales team. See who has the most leads, deals won, revenue generated, follow-ups completed, and commissions earned. Switch the sort metric to compare the team across different dimensions.' },
        ar: { title: 'لوحة الأداء', desc: 'لوحة صدارة لفريق المبيعات. شاهد من لديه أكثر العملاء المحتملين والصفقات المُبرمة والإيرادات المحققة والمتابعات المكتملة والعمولات. بدّل مقياس الترتيب لمقارنة الفريق عبر أبعاد مختلفة.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="sidebar-nav"]',
        en: { title: 'You\'re Ready!', desc: 'That\'s the full system overview. Each module has its own guided tour — look for the "Start Tour" button within each section to get a deep walkthrough of that specific area. Welcome to TaskFlow!' },
        ar: { title: 'أنت جاهز!', desc: 'هذه كانت النظرة العامة الكاملة على النظام. كل وحدة لديها جولة إرشادية خاصة بها — ابحث عن زر "بدء الجولة" في كل قسم للحصول على شرح تفصيلي لتلك المنطقة المحددة. مرحباً بك في TaskFlow!' },
        position: 'right',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // DASHBOARD TOUR
  // ─────────────────────────────────────────────
  {
    id: 'dashboard',
    category: 'start',
    en: 'Dashboard Tour',
    ar: 'جولة لوحة التحكم',
    route: '/',
    steps: [
      {
        target: '[data-tutorial="dash-primary-metric"]',
        en: { title: 'Primary KPI Banner', desc: 'This hero card shows your most important metric for the current role. For Admins, it\'s typically total open receivables or active pipeline value. The gradient background updates based on whether the number is healthy, at risk, or critical.' },
        ar: { title: 'بانر المؤشر الرئيسي', desc: 'تُظهر هذه البطاقة الرئيسية أهم مقياس للدور الحالي. بالنسبة للمديرين الإداريين، هو عادةً إجمالي الذمم المدينة المفتوحة أو قيمة خط الأنابيب النشط. تتحدث خلفية التدرج بناءً على ما إذا كان الرقم صحياً أو في خطر أو حرجاً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="dash-secondary-metrics"]',
        en: { title: 'Secondary Metrics Grid', desc: 'Supporting KPIs that give context to the primary metric. Each card shows a label, value, and optional detail note. The color of each value (blue, green, amber, red) reflects its health status — green is on track, red needs attention.' },
        ar: { title: 'شبكة المقاييس الثانوية', desc: 'مؤشرات الأداء الداعمة التي توفر سياقاً للمقياس الرئيسي. تُظهر كل بطاقة تسمية وقيمة وملاحظة تفصيلية اختيارية. لون كل قيمة (أزرق، أخضر، عنبري، أحمر) يعكس حالتها الصحية — الأخضر على المسار الصحيح، الأحمر يحتاج انتباهاً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="dash-quick-actions"]',
        en: { title: 'Quick Actions', desc: 'Shortcut buttons that take you directly to the most common actions for your role. These are dynamically generated — an Accountant sees "Create Invoice", a Sales rep sees "New Opportunity". Click any action to navigate immediately.' },
        ar: { title: 'الإجراءات السريعة', desc: 'أزرار اختصار تأخذك مباشرةً إلى الإجراءات الأكثر شيوعاً لدورك. يتم إنشاؤها ديناميكياً — يرى المحاسب "إنشاء فاتورة"، ويرى مندوب المبيعات "فرصة جديدة". انقر على أي إجراء للانتقال فوراً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="dash-charts"]',
        en: { title: 'Analytics Charts', desc: 'Visual breakdowns of your business data. Charts include bar charts for comparisons, line charts for trends over time, and donut charts for proportional splits. Hover over any data point to see exact values. Charts adapt to your role — Finance roles see revenue vs collections, Operations roles see inventory health.' },
        ar: { title: 'مخططات التحليلات', desc: 'تحليلات مرئية لبيانات عملك. تتضمن المخططات مخططات شريطية للمقارنات، ومخططات خطية للاتجاهات عبر الزمن، ومخططات دائرية للتوزيعات النسبية. مرّر مؤشر الفأرة فوق أي نقطة بيانات لرؤية القيم الدقيقة. تتكيف المخططات مع دورك — يرى أدوار المالية الإيرادات مقابل التحصيل، وأدوار العمليات صحة المخزون.' },
        position: 'top',
      },
      {
        target: '[data-tutorial="dash-alerts"]',
        en: { title: 'Action Required Alerts', desc: 'High-priority items that need your attention right now. These include overdue invoices, low-stock items, tasks past their due date, and awaiting approvals. Each alert is clickable and takes you directly to the relevant record. Don\'t ignore the red ones — they affect your cash flow.' },
        ar: { title: 'تنبيهات الإجراءات المطلوبة', desc: 'العناصر ذات الأولوية العالية التي تحتاج انتباهك الآن. تشمل الفواتير المتأخرة وعناصر المخزون المنخفضة والمهام المتجاوزة لتاريخ الاستحقاق والموافقات المعلقة. كل تنبيه قابل للنقر ويأخذك مباشرةً إلى السجل المعني. لا تتجاهل العناصر الحمراء — فهي تؤثر على تدفقك النقدي.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // FINANCE TABS TOUR
  // ─────────────────────────────────────────────
  {
    id: 'finance',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'finance',
    en: 'Finance Module',
    ar: 'وحدة المالية',
    route: '/finance',
    steps: [
      {
        target: '[data-tutorial="finance-tabs"]',
        en: { title: 'Finance Tabs', desc: 'The Finance module is divided into specialized sections. Each tab is a complete workflow: Overview gives you the financial health snapshot, Invoices is for receivables, Payables is for vendor bills, Ledger is for accounting, Reports has P&L and balance sheet, and Expenses tracks employee spending.' },
        ar: { title: 'تبويبات المالية', desc: 'وحدة المالية مقسمة إلى أقسام متخصصة. كل تبويب هو سير عمل كامل: نظرة عامة تعطيك لمحة عن الصحة المالية، الفواتير للذمم المدينة، الذمم الدائنة لفواتير الموردين، دفتر الأستاذ للمحاسبة، التقارير تحتوي على الأرباح والخسائر والميزانية، والمصروفات تتتبع إنفاق الموظفين.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-tab-overview"]',
        en: { title: 'Overview Tab', desc: 'Start here for your financial health check. The Overview tab shows open receivables, open payables, what you\'ve billed and collected this month, and an aging breakdown of all outstanding balances. It\'s the fastest way to assess cash flow at a glance.' },
        ar: { title: 'تبويب نظرة عامة', desc: 'ابدأ هنا للتحقق من صحتك المالية. يعرض تبويب النظرة العامة الذمم المدينة المفتوحة والذمم الدائنة المفتوحة وما فوترته وجمعته هذا الشهر، ومعلومات عن الأرصدة المستحقة. إنها أسرع طريقة لتقييم التدفق النقدي في لمحة واحدة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-tab-invoices"]',
        en: { title: 'Invoices Tab', desc: 'Manage all customer invoices here — create new ones, track payment status, record partial payments, and bulk-update statuses. Invoices can be created from billable tasks or sales orders. Use the bulk actions to send all drafts or mark all sent invoices as paid at once.' },
        ar: { title: 'تبويب الفواتير', desc: 'أدر جميع فواتير العملاء هنا — أنشئ فواتير جديدة، تتبع حالة الدفع، سجّل المدفوعات الجزئية، وحدّث الحالات بشكل مجمّع. يمكن إنشاء الفواتير من المهام القابلة للفوترة أو أوامر البيع. استخدم الإجراءات المجمعة لإرسال جميع المسودات أو تحديد جميع الفواتير المرسلة كمدفوعة دفعة واحدة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-tab-payables"]',
        en: { title: 'Payables Tab', desc: 'Track what you owe to vendors. Vendor bills are linked to purchase orders and suppliers from your contacts. Mark bills as paid when you settle them. The payables aging in the Overview tab reflects outstanding balances shown here.' },
        ar: { title: 'تبويب الذمم الدائنة', desc: 'تتبع ما تدين به للموردين. ترتبط فواتير الموردين بأوامر الشراء والموردين من جهات الاتصال. ضع علامة على الفواتير كمدفوعة عند تسويتها. يعكس سياق تقادم الذمم الدائنة في تبويب النظرة العامة الأرصدة المستحقة المعروضة هنا.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-pending-payables"]',
        action: { click: '[data-tutorial="finance-tab-payables"]', delay: 300 },
        optional: true,
        en: { title: 'Payables Awaiting a Bill', desc: 'Above the bill list sits everything you already owe but have not billed: stock received against a purchase order, and campaign deliverables handed to an outside vendor. Until a bill exists these sit outside AP, so your payables understate reality. Preview any line to see the order or campaign that created it, then raise a draft bill for all or part of the balance — partial bills leave the rest outstanding.' },
        ar: { title: 'مستحقات بانتظار الفوترة', desc: 'فوق قائمة الفواتير يظهر كل ما تدين به فعلياً ولم تُصدر له فاتورة بعد: بضاعة مستلمة على أمر شراء، ومخرجات حملات أُسندت إلى مورّد خارجي. وطالما لم تُنشأ فاتورة تبقى هذه المبالغ خارج الذمم الدائنة، فتظهر التزاماتك أقل من حقيقتها. عاين أي سطر لترى الأمر أو الحملة التي أنشأته، ثم أنشئ مسودة فاتورة بكامل الرصيد أو بجزء منه — والفوترة الجزئية تُبقي الباقي مستحقاً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-tab-expenses"]',
        en: { title: 'Expenses Tab', desc: 'Day-to-day spend that does not arrive as a supplier bill — fuel, stationery, small cash purchases. Each expense you record posts to the ledger as an operating cost, so it lands in the P&L and counts against any budget you set for that account.' },
        ar: { title: 'تبويب المصروفات', desc: 'الإنفاق اليومي الذي لا يصل كفاتورة مورّد — الوقود والقرطاسية والمشتريات النقدية الصغيرة. كل مصروف تسجله يُقيَّد في دفتر الأستاذ كتكلفة تشغيلية، فيظهر في قائمة الدخل ويُحتسب ضمن أي موازنة حددتها لذلك الحساب.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-tab-reports"]',
        en: { title: 'Reports Tab', desc: 'Trial balance, profit and loss, budget variance and the VAT return, all built from the ledger rather than from the operational tables. Because they read the journals directly, they only tell the truth if the underlying transactions post — which is why receipts, payroll and expenses all reach the ledger.' },
        ar: { title: 'تبويب التقارير', desc: 'ميزان المراجعة وقائمة الدخل وانحراف الموازنة وإقرار ضريبة القيمة المضافة، جميعها مبنية من دفتر الأستاذ لا من الجداول التشغيلية. ولأنها تقرأ القيود مباشرة، فهي صادقة فقط إذا كانت المعاملات تُقيَّد — ولهذا تصل الاستلامات والرواتب والمصروفات جميعها إلى دفتر الأستاذ.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-tab-ledger"]',
        en: { title: 'Ledger Tab', desc: 'The accounting core — your Chart of Accounts and Journal Entries live here. Every transaction (invoice payment, purchase, expense) creates a journal entry automatically. You can also post manual journal entries for adjustments and accruals. The chart of accounts is pre-seeded with a standard structure.' },
        ar: { title: 'تبويب دفتر الأستاذ', desc: 'القلب المحاسبي — دليل الحسابات وقيود اليومية موجودة هنا. كل معاملة (دفع فاتورة، شراء، مصروف) تُنشئ قيد يومية تلقائياً. يمكنك أيضاً ترحيل قيود يومية يدوية للتسويات والاستحقاقات. يأتي دليل الحسابات مُزوَّداً مسبقاً ببنية قياسية.' },
        position: 'bottom',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // INVOICING TOUR
  // ─────────────────────────────────────────────
  {
    id: 'invoicing',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'finance',
    en: 'Invoicing Workflow',
    ar: 'سير عمل الفوترة',
    route: '/finance',
    steps: [
      {
        target: '[data-tutorial="finance-metric-receivables"]',
        en: { title: 'Open Receivables', desc: 'This card shows the total amount owed to you by clients across all unpaid invoices. It updates automatically when invoices are created or payments are recorded. Watch this number — it represents your uncollected revenue.' },
        ar: { title: 'الذمم المدينة المفتوحة', desc: 'تُظهر هذه البطاقة المبلغ الإجمالي المستحق لك من العملاء عبر جميع الفواتير غير المدفوعة. يتحدث تلقائياً عند إنشاء الفواتير أو تسجيل المدفوعات. راقب هذا الرقم — فهو يمثل إيراداتك غير المحصّلة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-metric-billed"]',
        en: { title: 'Billed This Month', desc: 'Total value of invoices issued in the current calendar month. Comparing this to "Collected This Month" tells you your collection efficiency. A large gap means you\'re billing well but collecting slowly — follow up on outstanding invoices.' },
        ar: { title: 'المُفوتَر هذا الشهر', desc: 'القيمة الإجمالية للفواتير الصادرة في الشهر الحالي. مقارنة هذا بـ "المحصَّل هذا الشهر" يخبرك بكفاءة التحصيل. الفجوة الكبيرة تعني أنك تُفوتر بشكل جيد لكن تجمع ببطء — تابع الفواتير المستحقة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="finance-metric-collected"]',
        en: { title: 'Collected This Month', desc: 'Actual cash collected from clients this month. This is cash flow, not revenue — it reflects payments recorded against invoices, including partial payments. Strong collection relative to billing is a sign of healthy accounts receivable management.' },
        ar: { title: 'المحصَّل هذا الشهر', desc: 'النقد الفعلي المحصَّل من العملاء هذا الشهر. هذا تدفق نقدي وليس إيرادات — يعكس المدفوعات المسجلة مقابل الفواتير بما فيها المدفوعات الجزئية. التحصيل القوي نسبةً للفوترة علامة على إدارة ذمم مدينة صحية.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="invoice-search"]',
        en: { title: 'Search Invoices', desc: 'Search by invoice number, client, or any line-item text. It filters as you type and stacks with the status filter, so "unpaid invoices for Acme" is two clicks and a few keystrokes.' },
        ar: { title: 'البحث في الفواتير', desc: 'ابحث برقم الفاتورة أو العميل أو أي نص في البنود. يصفّي أثناء الكتابة ويتراكب مع فلتر الحالة، فتصبح "فواتير Acme غير المدفوعة" نقرتين وبضع ضغطات.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="invoice-status-filter"]',
        en: { title: 'Status Filter', desc: 'Narrow to Draft, Sent, Paid or Overdue. Status is not decorative: a Draft has not touched the ledger yet, Sent means the revenue and any VAT are recognised, and Overdue is derived from the due date against what is still outstanding.' },
        ar: { title: 'فلتر الحالة', desc: 'ضيّق النتائج إلى مسودة أو مُرسلة أو مدفوعة أو متأخرة. الحالة ليست شكلية: المسودة لم تمس دفتر الأستاذ بعد، و"مُرسلة" تعني الاعتراف بالإيراد وأي ضريبة، و"متأخرة" تُشتق من تاريخ الاستحقاق مقابل المبلغ المتبقي.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="invoice-bulk-actions"]',
        en: { title: 'Bulk Actions', desc: 'Select several invoices and act on them together — send, mark paid, or export. Useful at month end when you are issuing a batch, rather than opening each one in turn.' },
        ar: { title: 'الإجراءات الجماعية', desc: 'حدد عدة فواتير ونفّذ عليها معاً — إرسال أو تعليم كمدفوعة أو تصدير. مفيد في نهاية الشهر عند إصدار دفعة، بدلاً من فتح كل واحدة على حدة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="invoice-create-btn"]',
        en: { title: 'Create Invoice Button', desc: 'Click this to open the invoice creation panel. You\'ll be able to select a client, optionally link to a sales order or template, pick billable tasks from that client\'s project history, and add manual line items. The invoice is saved as a Draft until you\'re ready to send it.' },
        ar: { title: 'زر إنشاء فاتورة', desc: 'انقر هنا لفتح لوحة إنشاء الفاتورة. ستتمكن من اختيار عميل، والربط اختيارياً بأمر بيع أو قالب، واختيار المهام القابلة للفوترة من سجل مشاريع ذلك العميل، وإضافة عناصر بنود يدوية. تُحفظ الفاتورة كمسودة حتى تكون مستعداً لإرسالها.' },
        position: 'bottom',
      },
      {
        // Opens the invoice creation panel so the rest of the tour can walk
        // through it live.
        action: { click: '[data-tutorial="invoice-create-btn"]', delay: 250 },
        optional: true,
        target: '[data-tutorial="invoice-form-client"]',
        en: { title: 'Select Client', desc: 'This is where you choose the client this invoice is for — only contacts with the "Client" role appear here. Once you select a client, the system loads their billable tasks: completed work that has an invoice amount attached but hasn\'t been invoiced yet.' },
        ar: { title: 'اختيار العميل', desc: 'هنا تختار العميل الذي تخص الفاتورة — تظهر هنا فقط جهات الاتصال ذات دور "العميل". بمجرد اختيار عميل، يحمّل النظام مهامه القابلة للفوترة: العمل المكتمل الذي يحتوي على مبلغ فاتورة مرفق ولم يُفوتر بعد.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="invoice-form-sales-order"]',
        en: { title: 'Link to Sales Order', desc: 'If the client has confirmed, uninvoiced Sales Orders, you can select one here to pre-fill the invoice line items automatically. This is the fastest way to invoice — confirm the order in Sales, then come here and select it to generate the invoice in seconds.' },
        ar: { title: 'الربط بأمر البيع', desc: 'إذا كان للعميل أوامر بيع مؤكدة وغير مفوترة، يمكنك اختيار واحد هنا لملء بنود الفاتورة تلقائياً. هذه أسرع طريقة للفوترة — أكد الأمر في المبيعات، ثم تعال هنا واختره لإنشاء الفاتورة في ثوانٍ.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="invoice-form-template"]',
        en: { title: 'Invoice Template', desc: 'Choose how the printed or PDF version of this invoice looks. Templates control the layout, logo placement, colors, and footer text. The default template is selected automatically, but you can switch to any custom template you\'ve designed under Documents \u203a Templates.' },
        ar: { title: 'قالب الفاتورة', desc: 'اختر شكل النسخة المطبوعة أو PDF من هذه الفاتورة. تتحكم القوالب في التخطيط وموضع الشعار والألوان ونص التذييل. يتم تحديد القالب الافتراضي تلقائياً، لكن يمكنك التبديل إلى أي قالب مخصص صمّمته في المستندات › القوالب.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="invoice-form-task-filter"]',
        en: { title: 'Task Filter & Search', desc: 'Filter and search the list of billable tasks for this client. Filter by task status (Done, In Progress, To Do), search by title, vendor, or invoice number, set a minimum amount threshold, and sort by date or amount. This helps you find the exact tasks you want to include on this invoice.' },
        ar: { title: 'تصفية وبحث المهام', desc: 'صفّ وابحث في قائمة المهام القابلة للفوترة لهذا العميل. صفّ حسب حالة المهمة (منجزة، قيد التنفيذ، للعمل)، ابحث حسب العنوان أو المورد أو رقم الفاتورة، حدد حداً أدنى للمبلغ، وفرز حسب التاريخ أو المبلغ. هذا يساعدك في إيجاد المهام التي تريد تضمينها في هذه الفاتورة.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="invoice-form-task-table"]',
        en: { title: 'Billable Task Selection', desc: 'Check the boxes next to the tasks you want to include on this invoice. Each task shows the title, vendor, invoice number reference, and amount. Select all with the top checkbox. Selected tasks become line items on the invoice and are marked as "invoiced" once the invoice is created — they won\'t appear again for future invoices.' },
        ar: { title: 'اختيار المهام القابلة للفوترة', desc: 'ضع علامة على المهام التي تريد تضمينها في هذه الفاتورة. تُظهر كل مهمة العنوان والمورد ومرجع رقم الفاتورة والمبلغ. اختر الكل باستخدام مربع الاختيار العلوي. تصبح المهام المحددة بنوداً في الفاتورة وتُضع عليها علامة "مُفوترة" بمجرد إنشاء الفاتورة — لن تظهر مرة أخرى في الفواتير المستقبلية.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="invoice-form-manual-line"]',
        en: { title: 'Add Manual Line Item', desc: 'Add a custom line item that isn\'t tied to a task. Enter a description, optional SKU or reference code, quantity, and unit price. Click "Add Manual Line" and it\'s appended to the invoice. Useful for services, retainers, expenses reimbursements, or any ad-hoc charge.' },
        ar: { title: 'إضافة بند يدوي', desc: 'أضف بنداً مخصصاً غير مرتبط بمهمة. أدخل وصفاً ورمز SKU أو المرجع الاختياري والكمية وسعر الوحدة. انقر على "إضافة بند يدوي" وسيتم إلحاقه بالفاتورة. مفيد للخدمات والرسوم الثابتة وسداد المصروفات أو أي رسم عرضي.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="invoice-form-total"]',
        en: { title: 'Invoice Total', desc: 'The running total of all selected task line items plus any manual lines you\'ve added. This updates instantly as you check/uncheck tasks or add lines. This is the amount the client will be billed. Currency is set by your company settings.' },
        ar: { title: 'إجمالي الفاتورة', desc: 'الإجمالي المتراكم لجميع بنود المهام المحددة بالإضافة إلى أي بنود يدوية أضفتها. يتحدث فوراً عند تحديد أو إلغاء تحديد المهام أو إضافة البنود. هذا هو المبلغ الذي سيتم محاسبة العميل عليه. العملة محددة بواسطة إعدادات شركتك.' },
        position: 'top',
      },
      {
        target: '[data-tutorial="invoice-form-submit"]',
        en: { title: 'Create Draft Invoice', desc: 'Clicking this creates the invoice in "Draft" status. Draft invoices are visible in the invoices table but not yet sent to the client. Review the draft, then change the status to "Sent" when you\'re ready to bill the client. Drafts can be edited or deleted before being sent.' },
        ar: { title: 'إنشاء مسودة فاتورة', desc: 'النقر هنا يُنشئ الفاتورة بحالة "مسودة". تظهر مسودات الفواتير في جدول الفواتير لكنها لم تُرسل بعد للعميل. راجع المسودة، ثم غيّر الحالة إلى "مُرسلة" عندما تكون مستعداً لمحاسبة العميل. يمكن تعديل المسودات أو حذفها قبل الإرسال.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // LEDGER TOUR
  // ─────────────────────────────────────────────
  {
    id: 'ledger',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'finance',
    en: 'Ledger & Chart of Accounts',
    ar: 'دفتر الأستاذ ودليل الحسابات',
    route: '/finance',
    steps: [
      {
        target: '[data-tutorial="coa-stats"]',
        en: { title: 'Account Type Statistics', desc: 'A summary of your chart of accounts broken down by type: Assets, Liabilities, Equity, Revenue, and Expenses. Each card shows the total number of accounts and how many are active. Click any stat to filter the table below to that account type.' },
        ar: { title: 'إحصائيات أنواع الحسابات', desc: 'ملخص لدليل حساباتك مقسم حسب النوع: الأصول والخصوم وحقوق الملكية والإيرادات والمصروفات. تُظهر كل بطاقة العدد الإجمالي للحسابات وعدد النشطة منها. انقر على أي إحصاء لتصفية الجدول أدناه حسب نوع الحساب ذلك.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="coa-add-account-btn"]',
        en: { title: 'Add Account Button', desc: 'Create a new account in your chart of accounts. You\'ll specify the account type (Asset, Liability, etc.), a detail type for sub-classification, a name, and an optional description. System accounts (auto-created by the platform) cannot be edited or deleted — only custom accounts you create are modifiable.' },
        ar: { title: 'زر إضافة حساب', desc: 'أنشئ حساباً جديداً في دليل حساباتك. ستحدد نوع الحساب (أصل، خصوم، إلخ) ونوع التفصيل للتصنيف الفرعي والاسم ووصفاً اختيارياً. لا يمكن تعديل حسابات النظام (التي تم إنشاؤها تلقائياً بواسطة المنصة) أو حذفها — فقط الحسابات المخصصة التي تنشئها قابلة للتعديل.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="coa-journal-btn"]',
        en: { title: 'Manual Journal Button', desc: 'Post a manual double-entry journal entry. Specify a memo, entry date, amount, a debit account, and a credit account. Use this for period-end accruals, adjustments, error corrections, and opening balances. Every manual entry appears in the Journal Entries table below with a "Manual" source tag.' },
        ar: { title: 'زر اليومية اليدوية', desc: 'رحّل قيد يومية يدوي مزدوج. حدد مذكرة وتاريخ القيد والمبلغ وحساب المدين وحساب الدائن. استخدم هذا لاستحقاقات نهاية الفترة والتسويات وتصحيح الأخطاء والأرصدة الافتتاحية. يظهر كل قيد يدوي في جدول قيود اليومية أدناه بعلامة مصدر "يدوي".' },
        position: 'left',
      },
      {
        target: '[data-tutorial="coa-export-btn"]',
        en: { title: 'Export Accounts', desc: 'Download your entire chart of accounts as a CSV file. The export includes the account code, name, type, detail type, description, active status, and whether it\'s a system or custom account. Useful for audit purposes, importing into external accounting tools, or sharing with your accountant.' },
        ar: { title: 'تصدير الحسابات', desc: 'نزّل دليل حساباتك الكامل كملف CSV. يتضمن التصدير رمز الحساب والاسم والنوع ونوع التفصيل والوصف وحالة النشاط وما إذا كان حساب نظام أو مخصصاً. مفيد لأغراض التدقيق أو الاستيراد إلى أدوات المحاسبة الخارجية أو المشاركة مع محاسبك.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="coa-table"]',
        en: { title: 'Chart of Accounts', desc: 'All your accounts organized by type. Each row shows the account code (auto-generated sequential number within its type), name, detail type, description, active/inactive status, and system/custom class. Use the search and type filter at the top to find accounts quickly. Click Edit on a custom account to update it.' },
        ar: { title: 'دليل الحسابات', desc: 'جميع حساباتك منظمة حسب النوع. تُظهر كل صف رمز الحساب (رقم تسلسلي مُنشأ تلقائياً ضمن نوعه) والاسم ونوع التفصيل والوصف وحالة النشاط/الخمول وفئة النظام/المخصص. استخدم البحث وفلتر النوع في الأعلى للعثور على الحسابات بسرعة. انقر على تعديل في حساب مخصص لتحديثه.' },
        position: 'top',
      },
      {
        target: '[data-tutorial="coa-journal-table"]',
        en: { title: 'Journal Entries', desc: 'Every financial transaction in the system is recorded here as a double-entry journal entry. You\'ll see the date, source (Invoice, Payment, Purchase, Manual, Expense), memo, line count, and the balanced debit/credit totals. Expanding a row shows the individual debit and credit lines. This is your audit trail.' },
        ar: { title: 'قيود اليومية', desc: 'كل معاملة مالية في النظام مسجلة هنا كقيد يومية مزدوج. ستشاهد التاريخ والمصدر (فاتورة، دفعة، شراء، يدوي، مصروف) والمذكرة وعدد البنود وإجماليات المدين/الدائن المتوازنة. توسيع صف يُظهر بنود المدين والدائن الفردية. هذا هو سجل مراجعتك.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // SALES TOUR
  // ─────────────────────────────────────────────
  {
    id: 'sales',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Sales Orders',
    ar: 'أوامر البيع',
    route: '/sales',
    steps: [
      {
        target: '[data-tutorial="sales-metrics"]',
        en: { title: 'Sales Summary Cards', desc: 'Four key metrics at the top give you an instant snapshot: Open Orders (not yet confirmed), Confirmed Value (total value of confirmed orders awaiting invoicing), Invoiced Value (revenue already converted to invoices), and Cancelled orders. Track these to understand your sales pipeline health.' },
        ar: { title: 'بطاقات ملخص المبيعات', desc: 'أربعة مقاييس رئيسية في الأعلى تعطيك لمحة فورية: الأوامر المفتوحة (لم تُؤكد بعد)، القيمة المؤكدة (إجمالي قيمة الأوامر المؤكدة المنتظرة للفوترة)، القيمة المُفوترة (الإيرادات المحولة بالفعل إلى فواتير)، والأوامر الملغاة. تتبع هذه لفهم صحة خط أنابيب مبيعاتك.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="sales-create-btn"]',
        en: { title: 'New Order Button', desc: 'Create a new sales order. You\'ll select a client, set an order date and expected delivery date, choose the initial status (Draft or Confirmed), add notes, and build the line items by selecting inventory items with quantities and prices. The order number is auto-generated.' },
        ar: { title: 'زر الأمر الجديد', desc: 'أنشئ أمر بيع جديداً. ستختار عميلاً وتحدد تاريخ الأمر وتاريخ التسليم المتوقع وتختار الحالة الأولية (مسودة أو مؤكدة) وتضيف ملاحظات وتبني بنود الأسطر باختيار عناصر المخزون مع الكميات والأسعار. يتم إنشاء رقم الأمر تلقائياً.' },
        position: 'bottom',
      },
      {
        // Opens the sales order dialog so the guide can walk it live.
        action: { click: '[data-tutorial="sales-create-btn"]', delay: 250 },
        optional: true,
        target: '[data-tutorial="sales-form-client"]',
        en: { title: 'Choose the Client', desc: 'This is where you pick the client this order is for — only contacts carrying the "Client" role appear. The order number is generated for you from your numbering settings, so you never have to invent one or worry about duplicates.' },
        ar: { title: 'اختيار العميل', desc: 'هنا تختار العميل الذي يخصه هذا الأمر — تظهر فقط جهات الاتصال التي تحمل دور "العميل". يُنشأ رقم الأمر تلقائياً من إعدادات الترقيم، فلا داعي لاختياره يدوياً أو القلق من التكرار.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="sales-form-expected"]',
        en: { title: 'Expected Delivery Date', desc: 'When you have promised the goods. This drives the delivery schedule: once the order is confirmed you can raise deliveries against it, and each dispatch draws stock down and books the cost of what left. Setting a realistic date here keeps the fulfilment view honest.' },
        ar: { title: 'تاريخ التسليم المتوقع', desc: 'الموعد الذي وعدت بتسليم البضاعة فيه. يقود هذا جدول التسليم: بمجرد تأكيد الأمر يمكنك إنشاء عمليات تسليم مقابله، وكل شحنة تخصم المخزون وتسجل تكلفة ما خرج. تحديد تاريخ واقعي هنا يبقي عرض التنفيذ دقيقاً.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="sales-form-status"]',
        en: { title: 'Draft or Confirmed', desc: 'Draft keeps the order editable and commits nothing. Confirmed is the commitment: it makes the order available to invoice and to deliver against. Start as Draft while you are still agreeing terms, then confirm once the customer has signed off.' },
        ar: { title: 'مسودة أم مؤكد', desc: 'المسودة تبقي الأمر قابلاً للتعديل ولا تلتزم بشيء. المؤكد هو الالتزام: يجعل الأمر متاحاً للفوترة وللتسليم مقابله. ابدأ كمسودة أثناء الاتفاق على الشروط، ثم أكّد بعد موافقة العميل.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="sales-form-items"]',
        en: { title: 'Order Line Items', desc: 'Add a row per item being sold: pick the inventory item, set quantity and unit price, and apply a per-line discount if you have agreed one. The order total adds up from these lines, and they carry through to the invoice when you bill the order — so you only enter them once.' },
        ar: { title: 'بنود الأمر', desc: 'أضف صفاً لكل صنف مُباع: اختر صنف المخزون، وحدد الكمية وسعر الوحدة، وطبّق خصماً على السطر إن اتفقت عليه. يُجمع إجمالي الأمر من هذه البنود، وتنتقل إلى الفاتورة عند فوترة الأمر — فتُدخلها مرة واحدة فقط.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="sales-search"]',
        en: { title: 'Search Orders', desc: 'Search across all sales orders by order number, client name, item description, or notes. The search is real-time and filters the table as you type. Combine it with the status filter to narrow results further — for example, find all "Confirmed" orders for a specific client.' },
        ar: { title: 'البحث في الأوامر', desc: 'ابحث في جميع أوامر البيع حسب رقم الأمر أو اسم العميل أو وصف الصنف أو الملاحظات. البحث في الوقت الفعلي ويصفّ الجدول أثناء الكتابة. اجمعه مع فلتر الحالة لتضييق النتائج أكثر — على سبيل المثال، اعثر على جميع الأوامر "المؤكدة" لعميل محدد.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="sales-status-filter"]',
        en: { title: 'Status Filter', desc: 'Filter orders by status: Draft (pending confirmation), Confirmed (approved, awaiting invoicing), Invoiced (fully converted to an invoice), and Cancelled. Use this to focus on what needs action — typically you\'ll want to work through the "Confirmed" orders and convert them to invoices.' },
        ar: { title: 'فلتر الحالة', desc: 'صفّ الأوامر حسب الحالة: مسودة (في انتظار التأكيد)، مؤكدة (موافق عليها، في انتظار الفوترة)، مُفوترة (محولة بالكامل إلى فاتورة)، وملغاة. استخدم هذا للتركيز على ما يحتاج إجراءً — عادةً ستريد العمل على الأوامر "المؤكدة" وتحويلها إلى فواتير.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="sales-table"]',
        en: { title: 'Sales Orders Table', desc: 'The full list of sales orders. Each row shows the order number, client, order and expected dates, a preview of the items, total amount, status, linked invoice (if invoiced), and action buttons. Use the status dropdown on each row to update the order status. Once an order is Invoiced, you cannot change its status — it\'s locked to the invoice.' },
        ar: { title: 'جدول أوامر البيع', desc: 'القائمة الكاملة لأوامر البيع. تُظهر كل صف رقم الأمر والعميل وتواريخ الأمر والتوقع ومعاينة الأصناف والمبلغ الإجمالي والحالة والفاتورة المرتبطة (إذا تمت فوترتها) وأزرار الإجراءات. استخدم منسدلة الحالة في كل صف لتحديث حالة الأمر. بمجرد أن يُفوتَر الأمر، لا يمكن تغيير حالته — فهو مقفل بالفاتورة.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PURCHASES TOUR
  // ─────────────────────────────────────────────
  {
    id: 'purchases',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Purchase Orders',
    ar: 'أوامر الشراء',
    route: '/purchases',
    steps: [
      {
        target: '[data-tutorial="purchases-metrics"]',
        en: { title: 'Procurement Summary', desc: 'Five metrics that give you a full picture of your procurement status. Open Orders is how many POs are active, Ordered Spend is the total value committed, Awaiting Receipt shows units expected to arrive, Received This Month tracks goods received, and Unbilled PO Value shows what you\'ve received but not yet been billed for.' },
        ar: { title: 'ملخص المشتريات', desc: 'خمسة مقاييس تعطيك صورة كاملة عن حالة مشترياتك. الأوامر المفتوحة هو عدد أوامر الشراء النشطة، والإنفاق المطلوب هو القيمة الإجمالية المُلتزَم بها، وفي انتظار الاستلام يُظهر الوحدات المتوقع وصولها، ومستلمة هذا الشهر تتتبع البضائع المستلمة، وقيمة أوامر الشراء غير المُفوترة تُظهر ما استلمته لكن لم تتلقَ له فاتورة بعد.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="purchases-create-btn"]',
        en: { title: 'New Purchase Order', desc: 'Create a purchase order from your inventory catalog. Select a supplier from your contacts, set the order and expected dates, and add line items using your inventory items. Each item shows its current cost price. Once you receive the goods, use the "Receive" button on the table row to update inventory automatically.' },
        ar: { title: 'أمر شراء جديد', desc: 'أنشئ أمر شراء من كتالوج مخزونك. اختر مورداً من جهات اتصالك وحدد تواريخ الأمر والتوقع وأضف بنوداً باستخدام عناصر مخزونك. يُظهر كل صنف سعر تكلفته الحالي. بمجرد استلام البضائع، استخدم زر "استلام" في صف الجدول لتحديث المخزون تلقائياً.' },
        position: 'bottom',
      },
      {
        // Opens the purchase order dialog to walk it live.
        action: { click: '[data-tutorial="purchases-create-btn"]', delay: 250 },
        optional: true,
        target: '[data-tutorial="purchases-form-supplier"]',
        en: { title: 'Choose the Supplier', desc: 'This is where you pick who you are buying from — the supplier carries the payment terms and default currency that follow through to the bill. The order number is generated from your numbering settings.' },
        ar: { title: 'اختيار المورّد', desc: 'هنا تختار الجهة التي تشتري منها — يحمل المورّد شروط الدفع والعملة الافتراضية التي تنتقل إلى الفاتورة. يُنشأ رقم الأمر من إعدادات الترقيم.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="purchases-form-expected"]',
        en: { title: 'Expected Arrival', desc: 'When the goods are due. Receiving against this order is what puts stock on hand and capitalises its value — the receipt debits Inventory and raises a goods-received accrual that the supplier bill later clears, so the cost is recognised exactly once.' },
        ar: { title: 'تاريخ الوصول المتوقع', desc: 'موعد استحقاق البضاعة. الاستلام مقابل هذا الأمر هو ما يضيف المخزون ويرسمل قيمته — يقيّد الاستلام المخزون مديناً وينشئ استحقاق بضاعة مستلمة تسدده فاتورة المورّد لاحقاً، فتُعترف التكلفة مرة واحدة فقط.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="purchases-form-status"]',
        en: { title: 'Initial Status & Approval', desc: 'Draft is a working copy; Ordered commits it to the supplier. If the order value is at or above your company approval threshold, it must be approved before anyone can receive against it — the gate is enforced on the server, not just hidden in the UI.' },
        ar: { title: 'الحالة الأولية والموافقة', desc: 'المسودة نسخة عمل؛ و"مطلوب" يلتزم بها تجاه المورّد. إذا كانت قيمة الأمر عند حد الموافقة في شركتك أو أعلى، فيجب اعتمادها قبل أن يتمكن أحد من الاستلام مقابلها — والقيد مطبَّق على الخادم لا مخفي في الواجهة فقط.' },
        position: 'right',
      },
      {
        target: '[data-tutorial="purchases-search"]',
        en: { title: 'Search Purchase Orders', desc: 'Search by order number, supplier name, item description, or notes. Use this to quickly find a specific order, especially useful when reconciling vendor invoices against your purchase orders. Combining with the status filter helps isolate orders that are partially received or still outstanding.' },
        ar: { title: 'البحث في أوامر الشراء', desc: 'ابحث برقم الأمر أو اسم المورد أو وصف الصنف أو الملاحظات. استخدم هذا للعثور بسرعة على أمر محدد، مفيد بشكل خاص عند تسوية فواتير الموردين مقابل أوامر الشراء. الجمع مع فلتر الحالة يساعد على عزل الأوامر المستلمة جزئياً أو ما زالت معلقة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="purchases-status-filter"]',
        en: { title: 'PO Status Filter', desc: 'Filter purchase orders by their lifecycle status: Draft (not yet submitted to supplier), Ordered (submitted, awaiting shipment), Partially Received (some goods arrived), Received (fully received), and Cancelled. Orders at "Ordered" or "Partially Received" status are your active procurement queue.' },
        ar: { title: 'فلتر حالة أوامر الشراء', desc: 'صفّ أوامر الشراء حسب حالة دورة حياتها: مسودة (لم تُقدَّم للمورد بعد)، مطلوبة (مُقدَّمة، في انتظار الشحنة)، مستلمة جزئياً (وصل بعض البضائع)، مستلمة (مستلمة بالكامل)، وملغاة. الأوامر في حالة "مطلوبة" أو "مستلمة جزئياً" هي طابور مشترياتك النشط.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="purchases-table"]',
        en: { title: 'Purchase Orders Table', desc: 'Full list of all POs. Each row shows the order number, supplier (with contact reference), dates, items ordered, total amount, billing status (how much has been billed vs remaining), current status, and action buttons. Use "Receive" to record a goods receipt — it adds a receipt record and updates on-hand inventory quantities.' },
        ar: { title: 'جدول أوامر الشراء', desc: 'القائمة الكاملة لجميع أوامر الشراء. تُظهر كل صف رقم الأمر والمورد (مع مرجع جهة الاتصال) والتواريخ والأصناف المطلوبة والمبلغ الإجمالي وحالة الفوترة (كم تم فوترته مقابل ما تبقى) والحالة الحالية وأزرار الإجراءات. استخدم "استلام" لتسجيل إيصال البضائع — يُضيف سجل إيصال ويُحدث كميات المخزون المتاحة.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // INVENTORY TOUR
  // ─────────────────────────────────────────────
  {
    id: 'inventory',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Inventory Management',
    ar: 'إدارة المخزون',
    route: '/inventory',
    steps: [
      {
        target: '[data-tutorial="inventory-metrics"]',
        en: { title: 'Inventory Health Summary', desc: 'Six cards at a glance: Active SKUs (total tracked items), Low Stock (items at or below their reorder point, shown in amber), Out of Stock (items at zero, shown in red), Incoming Units (expected from open POs), Stock Value (total cost of current on-hand inventory), and Tracked Locations (distinct warehouse/shelf locations in use).' },
        ar: { title: 'ملخص صحة المخزون', desc: 'ست بطاقات في لمحة واحدة: الأصناف النشطة (إجمالي العناصر المتتبعة)، المخزون المنخفض (العناصر عند نقطة إعادة الطلب أو أدناها، باللون العنبري)، نفد المخزون (العناصر عند الصفر، باللون الأحمر)، الوحدات الواردة (المتوقعة من أوامر الشراء المفتوحة)، قيمة المخزون (التكلفة الإجمالية للمخزون المتاح حالياً)، والمواقع المتتبعة (مواقع المستودع/الرف المتميزة قيد الاستخدام).' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="inventory-create-btn"]',
        en: { title: 'New Inventory Item', desc: 'Add a new SKU to your catalog. Set the name, barcode (optional), category, unit of measure, VAT applicability, and whether to track this item\'s stock quantity. Set the initial on-hand quantity, reorder point, unit cost, and sale price. Link a preferred supplier for easy reordering. The SKU code is auto-generated.' },
        ar: { title: 'عنصر مخزون جديد', desc: 'أضف رمز SKU جديداً إلى كتالوجك. حدد الاسم والباركود (اختياري) والفئة ووحدة القياس وقابلية تطبيق ضريبة القيمة المضافة وما إذا كنت تريد تتبع كمية مخزون هذا العنصر. حدد الكمية المتاحة الأولية ونقطة إعادة الطلب وتكلفة الوحدة وسعر البيع. اربط مورداً مفضلاً لإعادة الطلب بسهولة. يتم إنشاء رمز SKU تلقائياً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="inventory-search"]',
        en: { title: 'Search Inventory', desc: 'Search items by SKU code, item name, vendor reference, or storage location. Combine with the stock filter buttons (All, Needs Attention, Healthy) to focus on specific item groups. For example, search "Warehouse A" to see everything stored at that location, then filter to "Needs Attention" to find what needs reordering there.' },
        ar: { title: 'البحث في المخزون', desc: 'ابحث عن العناصر حسب رمز SKU أو اسم الصنف أو مرجع المورد أو موقع التخزين. اجمع مع أزرار فلتر المخزون (الكل، تحتاج انتباهاً، جيد) للتركيز على مجموعات عناصر محددة. على سبيل المثال، ابحث عن "المستودع أ" لرؤية كل ما خُزّن في ذلك الموقع، ثم صفّ إلى "تحتاج انتباهاً" لمعرفة ما يحتاج إعادة طلب هناك.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="inventory-stock-filter"]',
        en: { title: 'Stock Status Filters', desc: '"All" shows every item, "Needs Attention" shows items that are low stock or out of stock — these are the items that may disrupt your operations or sales. "Healthy" filters to items with comfortable stock levels above their reorder point. Check "Needs Attention" daily to stay on top of your procurement needs.' },
        ar: { title: 'فلاتر حالة المخزون', desc: '"الكل" يُظهر كل عنصر، "تحتاج انتباهاً" يُظهر العناصر ذات المخزون المنخفض أو النافد — هذه هي العناصر التي قد تُعطل عملياتك أو مبيعاتك. "جيد" يُصفّ إلى العناصر ذات مستويات المخزون المريحة فوق نقطة إعادة الطلب. تحقق من "تحتاج انتباهاً" يومياً لمواكبة احتياجات المشتريات.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="inventory-table"]',
        en: { title: 'Inventory Table', desc: 'Each row is an inventory item showing SKU, name, category, on-hand quantity, incoming (from open POs), reorder point, unit cost, preferred vendor, and status badge. The action buttons let you Adjust stock (corrections and write-offs), Issue stock (to projects or staff), and Transfer between locations. All three create movement records automatically.' },
        ar: { title: 'جدول المخزون', desc: 'كل صف يمثل عنصر مخزون يُظهر الـ SKU والاسم والفئة والكمية المتاحة والوارد (من أوامر الشراء المفتوحة) ونقطة إعادة الطلب وتكلفة الوحدة والمورد المفضل وبادج الحالة. تتيح لك أزرار الإجراءات تعديل المخزون (التصحيحات والشطب) وصرف المخزون (للمشاريع أو الموظفين) والتحويل بين المواقع. الثلاثة يُنشئون سجلات حركة تلقائياً.' },
        position: 'top',
      },
      {
        target: '[data-tutorial="inventory-warehouses"]',
        optional: true,
        en: { title: 'Warehouses', desc: 'Stock is held per location, not just as one company-wide number. Transfers move quantity between warehouses, and every issue is checked against the balance at that specific location — which is why a delivery can fail even when the item shows stock elsewhere.' },
        ar: { title: 'المستودعات', desc: 'يُحفظ المخزون لكل موقع، لا كرقم واحد على مستوى الشركة. تنقل التحويلات الكمية بين المستودعات، ويُفحص كل صرف مقابل رصيد ذلك الموقع تحديداً — ولهذا قد يفشل التسليم رغم ظهور رصيد للصنف في مكان آخر.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="inventory-movements"]',
        en: { title: 'Stock Movements Log', desc: 'A complete audit trail of every stock movement — receipts from purchase orders, issuances to projects, adjustments, transfers between locations, and sales fulfillments. Each row shows the date, affected item, movement type, quantity change (positive or negative), reference ID, and any notes. This is your inventory history and cannot be modified.' },
        ar: { title: 'سجل حركات المخزون', desc: 'سجل تدقيق كامل لكل حركة مخزون — الاستلامات من أوامر الشراء والصرف للمشاريع والتسويات والتحويلات بين المواقع والوفاء بالمبيعات. تُظهر كل صف التاريخ والعنصر المتأثر ونوع الحركة وتغيير الكمية (إيجابي أو سلبي) ومعرف المرجع وأي ملاحظات. هذا هو تاريخ مخزونك ولا يمكن تعديله.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PROJECTS TOUR
  // ─────────────────────────────────────────────
  {
    id: 'projects',
    category: 'people',
    en: 'Projects & Tasks',
    ar: 'المشاريع والمهام',
    route: '/projects',
    steps: [
      {
        target: '[data-tutorial="projects-create-btn"]',
        en: { title: 'Create Project', desc: 'Start a new project by clicking here. Projects are linked to a client, have a name, description, status, and optional deadline. Once created, you can add tasks to the project, assign team members, and set billable amounts per task. Projects appear in the project list below.' },
        ar: { title: 'إنشاء مشروع', desc: 'ابدأ مشروعاً جديداً بالنقر هنا. المشاريع مرتبطة بعميل ولها اسم ووصف وحالة وموعد نهائي اختياري. بمجرد الإنشاء، يمكنك إضافة مهام للمشروع وتعيين أعضاء الفريق وتحديد مبالغ قابلة للفوترة لكل مهمة. تظهر المشاريع في قائمة المشاريع أدناه.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="projects-list"]',
        en: { title: 'Project List', desc: 'All active projects displayed as cards. Each card shows the project name, linked client, status (Active, On Hold, Completed, etc.), task completion progress, and the project owner. Click on a project card to open the detail view, where you can manage tasks, update the status, and view project-level activity.' },
        ar: { title: 'قائمة المشاريع', desc: 'جميع المشاريع النشطة معروضة كبطاقات. تُظهر كل بطاقة اسم المشروع والعميل المرتبط والحالة (نشط، معلق، مكتمل، إلخ) وتقدم إنجاز المهام ومالك المشروع. انقر على بطاقة مشروع لفتح عرض التفاصيل، حيث يمكنك إدارة المهام وتحديث الحالة وعرض نشاط مستوى المشروع.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="projects-tasks-table"]',
        en: { title: 'All Tasks Table', desc: 'A flat list of every task across all projects. Filter, sort, and search tasks by status, assignee, due date, or project. Tasks can have a billable amount, vendor reference, and invoice number that feeds directly into the invoicing workflow — when you create an invoice, billable tasks from this table appear as selectable line items.' },
        ar: { title: 'جدول جميع المهام', desc: 'قائمة مسطحة لكل مهمة عبر جميع المشاريع. صفّ وفرز وابحث في المهام حسب الحالة أو المُعين أو تاريخ الاستحقاق أو المشروع. يمكن أن تحتوي المهام على مبلغ قابل للفوترة ومرجع مورد ورقم فاتورة يتغذى مباشرةً في سير عمل الفوترة — عند إنشاء فاتورة، تظهر المهام القابلة للفوترة من هذا الجدول كعناصر بنود قابلة للاختيار.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // CONTACTS TOUR
  // ─────────────────────────────────────────────
  {
    id: 'contacts',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Contacts & Leads',
    ar: 'جهات الاتصال والعملاء المحتملون',
    route: '/contacts',
    steps: [
      {
        target: '[data-tutorial="contacts-create"]',
        en: { title: 'Add a Contact', desc: 'Click here to create a new contact. Choose between Person or Organization, add their roles (Lead, Client, Vendor, Influencer, Partner), and fill in their details. A single contact can hold multiple roles simultaneously — you never need to duplicate a record.' },
        ar: { title: 'إضافة جهة اتصال', desc: 'انقر هنا لإنشاء جهة اتصال جديدة. اختر بين شخص أو مؤسسة، أضف أدوارهم (عميل محتمل، عميل، مورد، مؤثر، شريك) وامل التفاصيل. يمكن لجهة اتصال واحدة أن تحمل أدواراً متعددة في آنٍ واحد — لن تحتاج أبداً إلى تكرار سجل.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="contacts-search"]',
        en: { title: 'Search & Filter', desc: 'Search by name, email, or phone. Use the role filter tabs to see only Leads, Clients, Vendors, Influencers, or Partners. Combine search with role filters to quickly find "all vendors matching the name Ahmad" or "all leads from Instagram". The search is instant and works across all contact fields.' },
        ar: { title: 'البحث والتصفية', desc: 'ابحث بالاسم أو البريد الإلكتروني أو الهاتف. استخدم علامات تبويب الأدوار لعرض العملاء المحتملين أو العملاء أو الموردين أو المؤثرين أو الشركاء فقط. اجمع البحث مع فلاتر الأدوار للعثور بسرعة على "جميع الموردين المطابقين لاسم أحمد" أو "جميع العملاء المحتملين من إنستغرام". البحث فوري ويعمل عبر جميع حقول جهة الاتصال.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="contacts-table"]',
        en: { title: 'Contact List', desc: 'All contacts in one view. Roles are shown as colored badges. The 🔒 icon marks private leads — only visible to their owner and managers. Click the ⋯ menu to edit, manage roles, or open the CRM panel for that contact. Private leads cannot be seen by other team members, protecting your sourced opportunities.' },
        ar: { title: 'قائمة جهات الاتصال', desc: 'جميع جهات الاتصال في عرض واحد. الأدوار تظهر كعلامات ملونة. رمز 🔒 يعني عميل محتمل خاص — مرئي للمالك والمديرين فقط. انقر على قائمة ⋯ للتعديل أو إدارة الأدوار أو فتح لوحة CRM لتلك الجهة. لا يمكن لأعضاء الفريق الآخرين رؤية العملاء المحتملين الخاصين، مما يحمي فرصك المكتسبة.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // CRM PANEL TOUR
  // ─────────────────────────────────────────────
  {
    id: 'crm-panel',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'CRM Panel',
    ar: 'لوحة إدارة العلاقات',
    route: '/contacts',
    steps: [
      {
        target: '[data-tutorial="proposals-create"]',
        optional: true,
        en: { title: 'Proposals', desc: 'Draft a priced proposal against an opportunity. It is the document you send before anything is committed — win it and the numbers carry into a sales order rather than being retyped.' },
        ar: { title: 'العروض', desc: 'أنشئ عرضاً مسعّراً مقابل فرصة. هو المستند الذي ترسله قبل أي التزام — وعند الفوز تنتقل الأرقام إلى أمر بيع بدلاً من إعادة كتابتها.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="campaigns-create"]',
        optional: true,
        en: { title: 'Campaigns', desc: 'Group marketing spend and deliverables under one campaign. Deliverables can generate supplier bills, and campaign expenses post to the ledger when approved — so a campaign shows real cost, not just a plan.' },
        ar: { title: 'الحملات', desc: 'اجمع الإنفاق التسويقي والمخرجات تحت حملة واحدة. يمكن للمخرجات إنشاء فواتير موردين، وتُقيَّد مصروفات الحملة في دفتر الأستاذ عند اعتمادها — فتظهر الحملة بتكلفة حقيقية لا مجرد خطة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="vendor-requests-create"]',
        optional: true,
        en: { title: 'Vendor Requests', desc: 'Ask a vendor to quote or schedule work for a campaign deliverable. Accepted requests carry their cost forward, which is what lets a campaign be measured against what it actually spent.' },
        ar: { title: 'طلبات الموردين', desc: 'اطلب من مورّد تسعيراً أو جدولة عمل لمخرج حملة. تحمل الطلبات المقبولة تكلفتها للأمام، وهو ما يتيح قياس الحملة مقابل ما أنفقته فعلاً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="crm-lead-status"]',
        en: { title: 'Lead Status', desc: 'Track where this contact is in your sales funnel: New → Qualified → Follow-up → Proposal → Won / Lost. The status automatically changes to Won when you create an invoice for this contact. Tracking status accurately is critical for pipeline reporting and commission calculations.' },
        ar: { title: 'حالة العميل المحتمل', desc: 'تتبع أين تقع جهة الاتصال في قمع مبيعاتك: جديد ← مؤهل ← متابعة ← مقترح ← فوز / خسارة. تتغير الحالة تلقائياً إلى "فوز" عند إنشاء فاتورة لهذه الجهة. تتبع الحالة بدقة أمر بالغ الأهمية لتقارير خط الأنابيب وحسابات العمولات.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="crm-source"]',
        en: { title: 'Lead Source', desc: 'Where did this lead come from? Instagram, TikTok, WhatsApp, referral, website, campaign, or a former client. This data feeds into the performance dashboard — you can analyze which channels produce the most won deals and highest revenue, letting you optimize your marketing spend.' },
        ar: { title: 'مصدر العميل المحتمل', desc: 'من أين جاء هذا العميل المحتمل؟ إنستغرام، تيك توك، واتساب، إحالة، موقع، حملة، أو عميل سابق. تتغذى هذه البيانات في لوحة الأداء — يمكنك تحليل القنوات التي تُنتج أكثر الصفقات فوزاً وأعلى الإيرادات، مما يتيح لك تحسين إنفاقك التسويقي.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="crm-owner"]',
        en: { title: 'Owner Assignment', desc: 'Assign a sales rep as the owner of this lead. Owners can always see their private contacts, and their performance stats (leads owned, deals won, revenue generated) appear in the performance leaderboard. Reassigning ownership transfers the contact to another rep\'s pipeline.' },
        ar: { title: 'تعيين المالك', desc: 'عيّن مندوب مبيعات كمالك لهذا العميل المحتمل. يمكن للمالكين دائماً رؤية جهات اتصالهم الخاصة، وتظهر إحصائياتهم (العملاء المحتملون المملوكون، الصفقات المُبرمة، الإيرادات المحققة) في لوحة صدارة الأداء. إعادة تعيين الملكية تنقل جهة الاتصال إلى خط أنابيب مندوب آخر.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="crm-followup"]',
        en: { title: 'Next Follow-up', desc: 'Set a date and description for the next follow-up action. It automatically appears in the Follow-Up Center when due. The system highlights overdue follow-ups in red across the app. Consistent follow-up scheduling is one of the biggest drivers of conversion rates in any sales team.' },
        ar: { title: 'المتابعة التالية', desc: 'حدد تاريخاً ووصفاً لإجراء المتابعة التالي. يظهر تلقائياً في مركز المتابعة عند حلول موعده. يُبرز النظام المتابعات المتأخرة باللون الأحمر عبر التطبيق. جدولة المتابعة المتسقة هي أحد أهم محركات معدلات التحويل في أي فريق مبيعات.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="crm-visibility"]',
        en: { title: 'Visibility Setting', desc: 'Public contacts are visible to everyone on the team. Private leads are only visible to the owner and managers — protecting sourced prospects from being "poached" internally. A contact automatically becomes Public when they convert to a Client, Vendor, or Partner role, as those relationships need to be shared company-wide.' },
        ar: { title: 'إعداد الرؤية', desc: 'جهات الاتصال العامة مرئية لجميع أعضاء الفريق. العملاء المحتملون الخاصون مرئيون للمالك والمديرين فقط — لحماية العملاء المحتملين من "الاختطاف" الداخلي. تصبح جهة الاتصال عامة تلقائياً عند تحويلها إلى دور عميل أو مورد أو شريك، لأن تلك العلاقات تحتاج إلى مشاركة على مستوى الشركة.' },
        position: 'left',
      },
      {
        target: '[data-tutorial="crm-log-activity"]',
        en: { title: 'Log an Activity', desc: 'Record every touchpoint with this contact: calls, WhatsApp messages, emails, meetings, proposals, and more. Each activity is timestamped and added to the contact\'s timeline. Detailed activity logging shows management what\'s happening with each deal, and helps you maintain context between follow-ups even weeks apart.' },
        ar: { title: 'تسجيل نشاط', desc: 'سجّل كل نقطة تواصل مع هذه الجهة: المكالمات ورسائل واتساب والبريد الإلكتروني والاجتماعات والمقترحات والمزيد. يتم ختم كل نشاط بالوقت وإضافته إلى الجدول الزمني لجهة الاتصال. يُظهر تسجيل النشاط التفصيلي للإدارة ما يحدث مع كل صفقة، ويساعدك على الحفاظ على السياق بين المتابعات حتى لو كانت بفارق أسابيع.' },
        position: 'left',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PIPELINE TOUR
  // ─────────────────────────────────────────────
  {
    id: 'pipeline',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'CRM Pipeline',
    ar: 'خط أنابيب المبيعات',
    route: '/crm/opportunities',
    steps: [
      {
        target: '[data-tutorial="opportunities-kanban"]',
        optional: true,
        en: { title: 'Opportunity Board', desc: 'Drag an opportunity between stages to move it through the pipeline. Closing one as Won is what triggers the commission calculation for everyone credited on it; closing as Lost records the outcome without any accrual.' },
        ar: { title: 'لوحة الفرص', desc: 'اسحب الفرصة بين المراحل لتحريكها في خط الأنابيب. إغلاقها كـ"مكسوبة" هو ما يشغّل احتساب العمولة لكل من له نصيب فيها؛ وإغلاقها كـ"مفقودة" يسجل النتيجة دون أي استحقاق.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="pipeline-tabs"]',
        en: { title: 'Pipeline Sections', desc: 'The Pipeline module is divided into four sections. Opportunities tracks your active deals through stages. Vendor Requests handles employee requests to add new vendors. Campaigns tracks marketing campaigns. Commissions shows what your sales team has earned based on won deals.' },
        ar: { title: 'أقسام خط الأنابيب', desc: 'وحدة خط الأنابيب مقسمة إلى أربعة أقسام. الفرص تتتبع صفقاتك النشطة عبر المراحل. طلبات الموردين تتعامل مع طلبات الموظفين لإضافة موردين جدد. الحملات تتتبع الحملات التسويقية. العمولات تُظهر ما حققه فريق مبيعاتك بناءً على الصفقات المُبرمة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="opportunities-view-toggle"]',
        en: { title: 'Kanban or List View', desc: 'View opportunities as a Kanban board (drag cards between stages) or as a sortable table list. The Kanban view makes it easy to visualize pipeline flow — each column is a stage (New, Qualified, Proposal, Won, Lost). Drag a card to a new column to advance it through the funnel. The list view is better for sorting and filtering many deals.' },
        ar: { title: 'عرض كانبان أو قائمة', desc: 'اعرض الفرص كلوحة كانبان (اسحب البطاقات بين المراحل) أو كجدول قائمة قابل للفرز. عرض كانبان يجعل من السهل تصور تدفق خط الأنابيب — كل عمود يمثل مرحلة (جديد، مؤهل، مقترح، فوز، خسارة). اسحب بطاقة إلى عمود جديد لتقدمها في القمع. عرض القائمة أفضل لفرز وتصفية الصفقات الكثيرة.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="pipeline-create-opp"]',
        en: { title: 'New Opportunity', desc: 'Create a deal linked to a contact. Set the expected revenue, close date, service type, and assign it to a sales rep. When the deal is marked Won, commissions are auto-calculated based on the commission rates configured for each rep. The opportunity also updates the contact\'s lead status to Won automatically.' },
        ar: { title: 'فرصة جديدة', desc: 'أنشئ صفقة مرتبطة بجهة اتصال. حدد الإيراد المتوقع وتاريخ الإغلاق ونوع الخدمة وعيّنها لمندوب مبيعات. عند تحديد الصفقة كـ "فوز"، تُحسب العمولات تلقائياً بناءً على معدلات العمولة المُهيأة لكل مندوب. تُحدّث الفرصة أيضاً حالة عميل جهة الاتصال المحتمل إلى "فوز" تلقائياً.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="vendor-requests-table"]',
        en: { title: 'Vendor & Influencer Requests', desc: 'When employees need to add a new vendor or influencer, they submit a request here instead of creating contacts directly. Managers review and approve (or reject with a written reason). An approved request automatically creates a Contact with the appropriate role. This workflow maintains data quality and prevents unauthorized additions to your supplier network.' },
        ar: { title: 'طلبات الموردين والمؤثرين', desc: 'عندما يحتاج الموظفون إلى إضافة مورد أو مؤثر جديد، يُقدمون طلباً هنا بدلاً من إنشاء جهات اتصال مباشرةً. يراجع المديرون ويوافقون (أو يرفضون مع ذكر سبب مكتوب). الطلب الموافق عليه يُنشئ تلقائياً جهة اتصال بالدور المناسب. يحافظ هذا السير على جودة البيانات ويمنع الإضافات غير المصرح بها لشبكة المورّدين.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // FOLLOW-UPS TOUR
  // ─────────────────────────────────────────────
  {
    id: 'followups',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Follow-Up Center',
    ar: 'مركز المتابعة',
    route: '/crm/followups',
    steps: [
      {
        target: '[data-tutorial="followups-filters"]',
        en: { title: 'Filter Your Follow-ups', desc: 'Filter the list by assigned user (see only your own or all team members\' follow-ups), by contact name, or by completion status. Overdue items are highlighted in red — they are follow-ups where the scheduled date has passed without being marked complete. Managers can filter by user to coach their reps.' },
        ar: { title: 'تصفية متابعاتك', desc: 'صفّ القائمة حسب المستخدم المُعيَّن (شاهد متابعاتك فقط أو لجميع أعضاء الفريق)، أو حسب اسم جهة الاتصال، أو حسب حالة الإنجاز. العناصر المتأخرة مميزة باللون الأحمر — هي متابعات انقضى تاريخها المجدول دون تحديد كمكتملة. يمكن للمديرين التصفية حسب المستخدم لتدريب مندوبيهم.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="followups-list"]',
        en: { title: 'Follow-up Items', desc: 'Each item shows the contact name, the planned next action description, the due date, and the assigned owner. Use the quick-action buttons to mark it done (which logs a completion activity on the contact), reschedule (opens the CRM panel to set a new follow-up date), or jump directly to the contact record to see their full history before making the call.' },
        ar: { title: 'عناصر المتابعة', desc: 'يُظهر كل عنصر اسم جهة الاتصال ووصف الإجراء التالي المخطط وتاريخ الاستحقاق والمالك المُعيَّن. استخدم أزرار الإجراءات السريعة لتحديده كمكتمل (مما يسجّل نشاط إتمام على جهة الاتصال)، أو إعادة الجدولة (تفتح لوحة CRM لتحديد تاريخ متابعة جديد)، أو الانتقال مباشرةً إلى سجل جهة الاتصال لرؤية تاريخها الكامل قبل إجراء الاتصال.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PERFORMANCE TOUR
  // ─────────────────────────────────────────────
  {
    id: 'performance',
    roles: ['Admin', 'Manager'],
    category: 'crm',
    en: 'Performance Dashboard',
    ar: 'لوحة الأداء',
    route: '/crm/performance',
    steps: [
      {
        target: '[data-tutorial="perf-period"]',
        optional: true,
        en: { title: 'Reporting Period', desc: 'Every figure on this page is scoped to the period you pick here. Change it before reading anything — a target that looks missed this month may simply be measured against the wrong window.' },
        ar: { title: 'فترة التقرير', desc: 'كل رقم في هذه الصفحة محصور بالفترة التي تختارها هنا. غيّرها قبل قراءة أي شيء — فالهدف الذي يبدو غير محقق هذا الشهر قد يكون مقيساً على نافذة زمنية خاطئة فحسب.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="perf-stats"]',
        en: { title: 'Company-Wide Stats', desc: 'The header row shows aggregated numbers across the whole company: total leads in the system, active deals in the pipeline, total revenue in the pipeline, and deals won this period. These are the baseline numbers for the leaderboard below — context for individual rankings.' },
        ar: { title: 'إحصائيات على مستوى الشركة', desc: 'يُظهر صف الرأس أرقاماً مجمّعة عبر الشركة بأكملها: إجمالي العملاء المحتملين في النظام والصفقات النشطة في خط الأنابيب وإجمالي الإيرادات في خط الأنابيب والصفقات المُبرمة في هذه الفترة. هذه هي الأرقام الأساسية للوحة الصدارة أدناه — سياق للتصنيفات الفردية.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="perf-sort"]',
        en: { title: 'Sort Metric Selector', desc: 'Rank the team by different metrics: Leads (contacts owned), Deals Won (opportunities marked Won), Revenue (total won deal values), Follow-ups (completed follow-up actions), Tasks (completed tasks), or Commissions (earned commission amounts). Switching metrics gives a complete picture — someone might be top in follow-ups but not in revenue, which reveals coaching opportunities.' },
        ar: { title: 'محدد مقياس الترتيب', desc: 'رتّب الفريق حسب مقاييس مختلفة: العملاء المحتملون (جهات الاتصال المملوكة)، الصفقات المُبرمة (الفرص المحددة كـ "فوز")، الإيرادات (إجمالي قيم الصفقات المُبرمة)، المتابعات (إجراءات المتابعة المكتملة)، المهام (المهام المكتملة)، أو العمولات (مبالغ العمولة المحققة). تبديل المقاييس يعطي صورة كاملة — شخص ما قد يكون الأول في المتابعات لكن ليس في الإيرادات، مما يكشف فرص التدريب.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="perf-leaderboard"]',
        en: { title: 'Team Leaderboard', desc: 'A ranked list of all sales team members showing their stats for the selected metric. The top three get gold, silver, and bronze medals with colored row highlighting. The leaderboard encourages healthy competition and gives management instant visibility into who\'s performing, who needs support, and whether coaching interventions are working.' },
        ar: { title: 'لوحة صدارة الفريق', desc: 'قائمة مرتبة لجميع أعضاء فريق المبيعات تُظهر إحصائياتهم للمقياس المحدد. يحصل الثلاثة الأوائل على ميداليات ذهبية وفضية وبرونزية مع تمييز ملون للصف. تشجع لوحة الصدارة المنافسة الصحية وتمنح الإدارة رؤية فورية لمن يؤدي بشكل جيد ومن يحتاج دعماً وما إذا كانت تدخلات التدريب تعمل.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // MANUFACTURING
  // ─────────────────────────────────────────────
  {
    id: 'manufacturing',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Manufacturing',
    ar: 'التصنيع',
    route: '/manufacturing',
    steps: [
      {
        target: '[data-tutorial="nav-manufacturing"]',
        route: '/',
        en: { title: 'Manufacturing Module', desc: 'Manufacturing turns raw materials into finished goods. It has two parts: Recipes (a bill of materials — what each product is made of) and Work Orders (a production run that consumes components and produces output). Let\'s open it.' },
        ar: { title: 'وحدة التصنيع', desc: 'تحوّل وحدة التصنيع المواد الخام إلى منتجات نهائية. تتكوّن من جزأين: الوصفات (قائمة المكوّنات — ممّ يتكوّن كل منتج) وأوامر العمل (دورة إنتاج تستهلك المكوّنات وتنتج المخرجات). لنفتحها.' },
        position: 'right',
      },
      {
        target: '[role="tablist"]',
        en: { title: 'Work Orders & Recipes', desc: 'The page opens on Work Orders — your production runs. Switch to the Recipes tab to define what each product is built from. A recipe says: "one batch of French Fries = 10 kg potatoes + 2 L oil → 8 kg fries." You define the recipe once and reuse it for every production run.' },
        ar: { title: 'أوامر العمل والوصفات', desc: 'تفتح الصفحة على أوامر العمل — دورات الإنتاج. انتقل إلى تبويب الوصفات لتحديد مكوّنات كل منتج. تقول الوصفة: "دفعة واحدة من البطاطس المقلية = 10 كجم بطاطس + 2 لتر زيت ← 8 كجم بطاطس". تُعرّف الوصفة مرة وتُعاد لكل دورة إنتاج.' },
        position: 'bottom',
        optional: true,
      },
      {
        action: { click: '[data-tutorial="mfg-create-wo"]', delay: 200 },
        optional: true,
        target: '[role="dialog"], [data-tutorial="mfg-create-wo"]',
        en: { title: 'Create a Work Order', desc: 'Pick a recipe and the number of batches, then create the work order. When you complete it, the system atomically deducts every component from stock, adds the finished goods to inventory, and records the material cost — so your Yield (produced vs expected) and unit cost are calculated automatically. If any component is short, the whole run rolls back.' },
        ar: { title: 'إنشاء أمر عمل', desc: 'اختر وصفة وعدد الدفعات ثم أنشئ أمر العمل. عند إكماله، يخصم النظام كل مكوّن من المخزون، ويضيف المنتجات النهائية، ويسجّل تكلفة المواد — فيُحتسب العائد (المنتَج مقابل المتوقع) وتكلفة الوحدة تلقائياً. وإن نقص أي مكوّن، تُلغى العملية بالكامل.' },
        position: 'left',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // RFQ / REQUEST FOR QUOTATION
  // ─────────────────────────────────────────────
  {
    id: 'rfq',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Requests for Quotation',
    ar: 'طلبات عروض الأسعار',
    route: '/purchases/rfq',
    steps: [
      {
        target: '[data-tutorial="nav-rfq"]',
        route: '/',
        en: { title: 'Requests for Quotation', desc: 'Before you commit to a purchase order, an RFQ lets you shop around. You list what you need, collect price quotes from several suppliers, compare them side by side, and award the winner. This drives down cost and creates an audit trail of why a supplier was chosen.' },
        ar: { title: 'طلبات عروض الأسعار', desc: 'قبل إصدار أمر شراء، يتيح لك طلب عروض الأسعار المقارنة. تُدرج ما تحتاجه، وتجمع عروض الأسعار من عدة موردين، وتقارنها جنباً إلى جنب، وترسي على الأفضل. هذا يخفض التكلفة ويوثّق سبب اختيار المورّد.' },
        position: 'right',
      },
      {
        action: { click: '[data-tutorial="rfq-create"]', delay: 200 },
        optional: true,
        target: '[role="dialog"], [data-tutorial="rfq-create"]',
        en: { title: 'Raise an RFQ', desc: 'Give the request a title and list the line items you need — description, quantity, and unit. Once saved, you record each supplier\'s quote against it. The cheapest quote is flagged automatically, and awarding one stamps the RFQ as decided. This is the first step of a disciplined procurement process.' },
        ar: { title: 'إنشاء طلب عروض', desc: 'أعطِ الطلب عنواناً وأدرج الأصناف المطلوبة — الوصف والكمية والوحدة. بعد الحفظ، تسجّل عرض كل مورّد مقابله. يُميَّز أقل عرض تلقائياً، والترسية تُثبّت الطلب كمحسوم. هذه أولى خطوات عملية شراء منضبطة.' },
        position: 'left',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // 3-WAY INVOICE MATCHING
  // ─────────────────────────────────────────────
  {
    id: 'invoice-matching',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Invoice Matching',
    ar: 'مطابقة الفواتير',
    route: '/purchases/matching',
    steps: [
      {
        target: '[data-tutorial="nav-matching"]',
        route: '/',
        en: { title: 'Three-Way Matching', desc: 'A financial control that catches over-billing and short deliveries before you pay. For every vendor bill it compares three numbers: what you ordered (the purchase order), what you received (goods receipts), and what you were billed. When they agree it\'s "Matched"; when they don\'t it\'s flagged as a "Variance" for you to investigate.' },
        ar: { title: 'المطابقة الثلاثية', desc: 'ضابط مالي يكشف الفوترة الزائدة والتوريد الناقص قبل الدفع. لكل فاتورة مورّد يقارن ثلاثة أرقام: ما طلبته (أمر الشراء)، وما استلمته (سندات الاستلام)، وما فُوترت به. عند التطابق تكون "مطابقة"، وعند الاختلاف تُوسم بـ "اختلاف" لتتحقق منها.' },
        position: 'right',
      },
      {
        target: 'table, .rounded-lg.border',
        en: { title: 'Reading the Match', desc: 'The summary tiles at the top count how many bills are matched, have a variance, or have no linked PO. In the table, each row shows the billed / ordered / received figures with the price and receipt variances colour-coded — red where you were billed more than received. Focus your review on the variance rows; the matched ones are safe to pay.' },
        ar: { title: 'قراءة المطابقة', desc: 'تُظهر البطاقات العلوية عدد الفواتير المطابقة وذات الاختلاف وتلك بلا أمر شراء مرتبط. في الجدول، يعرض كل صف قيم المفوتر/المطلوب/المستلَم مع فروق السعر والاستلام بألوان — الأحمر حيث فُوترت أكثر ممّا استلمت. ركّز مراجعتك على صفوف الاختلاف؛ أما المطابقة فآمنة للدفع.' },
        position: 'top',
        optional: true,
      },
    ],
  },

  // ─────────────────────────────────────────────
  // CYCLE COUNTS
  // ─────────────────────────────────────────────
  {
    id: 'stock-counts',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Stock Counts',
    ar: 'جرد المخزون',
    route: '/inventory/counts',
    steps: [
      {
        target: '[data-tutorial="nav-stock-counts"]',
        route: '/',
        en: { title: 'Cycle Counts', desc: 'System stock and physical stock drift apart over time — breakage, miscounts, theft. A cycle count reconciles them. You open a count, walk the warehouse entering what you physically see, and post it. On posting, the system adjusts on-hand to match your count and records an audit movement for every difference.' },
        ar: { title: 'جرد المخزون', desc: 'يتباعد مخزون النظام عن المخزون الفعلي مع الوقت — كسر أو أخطاء عدّ أو سرقة. يوفّق الجرد بينهما. تفتح جرداً، وتتجوّل في المستودع مُدخلاً ما تراه فعلياً، ثم تُرحّله. عند الترحيل يعدّل النظام المخزون ليطابق جردك ويسجّل حركة تدقيق لكل فرق.' },
        position: 'right',
      },
      {
        action: { click: '[data-tutorial="count-create"]', delay: 250 },
        optional: true,
        target: 'table, .rounded-lg.border',
        en: { title: 'Open & Post a Count', desc: 'Opening a count snapshots the current on-hand for every tracked item. Enter the physical quantity next to each — the variance is shown live and colour-coded. When you post, those variances become real stock adjustments and the count is locked so it can\'t be edited afterward. Count little and often (a "cycle") rather than one giant annual stocktake.' },
        ar: { title: 'فتح الجرد وترحيله', desc: 'فتح الجرد يلتقط المخزون الحالي لكل صنف مُتتبَّع. أدخل الكمية الفعلية بجانب كلٍّ — ويظهر الفرق مباشرةً بالألوان. عند الترحيل تصبح تلك الفروق تعديلات مخزون فعلية ويُقفل الجرد فلا يمكن تعديله. اجرد قليلاً وبتكرار ("دورة") بدل جرد سنوي ضخم واحد.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // PAYROLL
  // ─────────────────────────────────────────────
  {
    id: 'payroll',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'people',
    en: 'Payroll',
    ar: 'الرواتب',
    route: '/hr/payroll',
    steps: [
      {
        target: '[data-tutorial="nav-payroll"]',
        route: '/',
        en: { title: 'Payroll', desc: 'Run monthly payroll from the salaries stored on each employee record. First set each employee\'s basic salary, allowances, deductions and bank/IBAN under Employees. Then here you pick a pay period and generate a run — a payslip per active employee, with net = basic + allowances − deductions.' },
        ar: { title: 'الرواتب', desc: 'شغّل مسير الرواتب الشهري من الرواتب المخزّنة في سجل كل موظف. أولاً حدّد الراتب الأساسي والبدلات والاستقطاعات وبيانات البنك/الآيبان لكل موظف في صفحة الموظفين. ثم هنا تختار فترة الدفع وتُنشئ مسيراً — قسيمة راتب لكل موظف نشط، حيث الصافي = الأساسي + البدلات − الاستقطاعات.' },
        position: 'right',
      },
      {
        action: { click: '[data-tutorial="payroll-run"]', delay: 250 },
        optional: true,
        target: '.rounded-lg.border, table',
        en: { title: 'Run & Export WPS', desc: 'Each run expands into its payslips. When you\'re ready to pay salaries, download the WPS file — a bank-ready CSV containing every employee\'s ID, bank, IBAN, and net pay, formatted for the Wage Protection System. Upload it to your bank and salaries are paid in one batch.' },
        ar: { title: 'التشغيل وتصدير حماية الأجور', desc: 'يتوسّع كل مسير إلى قسائم رواتبه. وعند الاستعداد لدفع الرواتب، نزّل ملف حماية الأجور (WPS) — ملف CSV جاهز للبنك يحتوي على رقم كل موظف وبنكه والآيبان وصافي راتبه، بصيغة نظام حماية الأجور. ارفعه إلى بنكك لتُدفع الرواتب دفعة واحدة.' },
        position: 'top',
      },
    ],
  },

  // ─────────────────────────────────────────────
  // DOCUMENT BUILDER
  // ─────────────────────────────────────────────
  {
    id: 'documents',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'finance',
    en: 'Document Builder',
    ar: 'منشئ المستندات',
    route: '/documents',
    steps: [
      {
        target: '[data-tutorial="nav-settings"]',
        route: '/',
        en: { title: 'Document Builder', desc: 'Design letterhead-backed documents — letters, memos, quotes, certificates — with live merge fields. Templates live in Settings. Upload your letterhead PDF, drag a content box that clears the printed header and footer, then lay out text blocks with fields like {{client.name}} or {{today}} that fill in automatically.' },
        ar: { title: 'منشئ المستندات', desc: 'صمّم مستندات بترويسة — خطابات ومذكّرات وعروض أسعار وشهادات — بحقول دمج مباشرة. القوالب في الإعدادات. ارفع ملف الترويسة PDF، واسحب صندوق محتوى يتجنّب الترويسة والتذييل المطبوعين، ثم رتّب كتل النص بحقول مثل {{client.name}} أو {{today}} تُملأ تلقائياً.' },
        position: 'right',
      },
      {
        target: '[role="tablist"], .rounded-lg.border',
        en: { title: 'Templates → Documents', desc: 'Under the Documents panel you build reusable templates, then generate individual documents from them. Creating a document freezes a snapshot of the design, binds it to a record (a client, an invoice), and resolves the merge fields. From there you download a pixel-perfect, multi-page PDF rendered on the server.' },
        ar: { title: 'من القوالب إلى المستندات', desc: 'في لوحة المستندات تبني قوالب قابلة لإعادة الاستخدام، ثم تُنشئ منها مستندات فردية. إنشاء مستند يجمّد نسخة من التصميم، ويربطه بسجلّ (عميل أو فاتورة)، ويحلّ حقول الدمج. ومن هناك تنزّل ملف PDF متعدد الصفحات دقيقاً يُولَّد على الخادم.' },
        position: 'bottom',
        optional: true,
      },
    ],
  },
  {
    id: 'clients',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'finance',
    en: 'Client Directory',
    ar: 'دليل العملاء',
    route: '/clients',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Who Your Clients Are', desc: 'Every contact carrying the Client role appears here with their billing history attached. Clients are not a separate table — they are contacts with a role, which is why the same organisation can be both a client and a supplier without being entered twice.' },
        ar: { title: 'من هم عملاؤك', desc: 'تظهر هنا كل جهة اتصال تحمل دور العميل مع سجل الفوترة الخاص بها. العملاء ليسوا جدولاً منفصلاً — بل جهات اتصال تحمل دوراً، ولهذا يمكن أن تكون المؤسسة نفسها عميلاً ومورّداً دون إدخالها مرتين.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Balances and Exposure', desc: 'Each row carries what has been billed and what is still outstanding. Outstanding is the invoice total less payments and any credit notes applied — so a credited invoice stops inflating what the client appears to owe.' },
        ar: { title: 'الأرصدة والانكشاف', desc: 'يحمل كل صف ما تمت فوترته وما زال مستحقاً. المستحق هو إجمالي الفاتورة ناقص المدفوعات وأي إشعارات دائنة مطبّقة — فلا تضخّم الفاتورة المدائنة ما يبدو أن العميل مديناً به.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Opening a Client', desc: 'Selecting a client opens their 360° profile: invoices, sales orders, projects and opportunities in one place, counted from the records actually linked to them.' },
        ar: { title: 'فتح ملف العميل', desc: 'اختيار عميل يفتح ملفه الشامل: الفواتير وأوامر البيع والمشاريع والفرص في مكان واحد، محسوبة من السجلات المرتبطة به فعلاً.' },
      },
    ],
  },
  {
    id: 'suppliers',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'operations',
    en: 'Supplier Directory',
    ar: 'دليل الموردين',
    route: '/suppliers',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Your Supply Base', desc: 'Contacts carrying the Vendor role, with their purchase orders and payables alongside. Payment terms set here flow into every bill you raise against them.' },
        ar: { title: 'قاعدة التوريد', desc: 'جهات الاتصال التي تحمل دور المورّد، ومعها أوامر الشراء والذمم الدائنة. تنتقل شروط الدفع المحددة هنا إلى كل فاتورة تصدرها مقابلهم.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Open Payables', desc: 'What you still owe each supplier, net of payments already made. This is the same figure the finance module reports — both read the vendor bills rather than keeping separate counts.' },
        ar: { title: 'الذمم الدائنة المفتوحة', desc: 'ما زلت مديناً به لكل مورّد بعد خصم المدفوعات. وهو الرقم نفسه الذي تعرضه وحدة المالية — كلاهما يقرأ فواتير الموردين بدل الاحتفاظ بأرقام منفصلة.' },
      },
    ],
  },
  {
    id: 'tasks',
    category: 'people',
    en: 'Tasks & Time',
    ar: 'المهام والوقت',
    route: '/tasks',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Work in Flight', desc: 'Every task across your projects, filterable by status, assignee and priority. Tasks are where billable work is captured before it reaches an invoice.' },
        ar: { title: 'العمل الجاري', desc: 'كل المهام عبر مشاريعك، قابلة للتصفية حسب الحالة والمسؤول والأولوية. المهام هي حيث يُلتقط العمل القابل للفوترة قبل وصوله إلى الفاتورة.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Private Tasks', desc: 'A task marked private is visible only to its owner and assignees — it overrides the usual role-based visibility, so a manager does not automatically see it.' },
        ar: { title: 'المهام الخاصة', desc: 'المهمة المعلّمة كخاصة مرئية لمالكها والمكلفين بها فقط — وهي تتجاوز الرؤية المعتادة القائمة على الدور، فلا يراها المدير تلقائياً.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Time and Cost', desc: 'Logging time against a task records a cost using the user\'s hourly rate at the moment it is logged. That is what makes project profitability measurable rather than estimated.' },
        ar: { title: 'الوقت والتكلفة', desc: 'تسجيل الوقت على مهمة يسجّل تكلفة بسعر ساعة المستخدم وقت التسجيل. وهذا ما يجعل ربحية المشروع قابلة للقياس بدل التقدير.' },
      },
    ],
  },
  {
    id: 'campaigns',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Marketing Campaigns',
    ar: 'الحملات التسويقية',
    route: '/crm/campaigns',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Campaigns', desc: 'Group deliverables, vendors and spend under one campaign so its true cost is visible. Approved campaign expenses post to the ledger, so a campaign is measured against money actually recognised.' },
        ar: { title: 'الحملات', desc: 'اجمع المخرجات والموردين والإنفاق تحت حملة واحدة لتظهر تكلفتها الحقيقية. تُقيَّد مصروفات الحملة المعتمدة في دفتر الأستاذ، فتُقاس الحملة مقابل مال معترف به فعلاً.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Deliverables', desc: 'Each deliverable can generate a supplier bill when fulfilled, linking what you promised to what you paid for it.' },
        ar: { title: 'المخرجات', desc: 'يمكن لكل مخرج إنشاء فاتورة مورّد عند تنفيذه، فيربط ما وعدت به بما دفعته مقابله.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Campaign Invoice', desc: 'A campaign can raise a single invoice covering its deliverables, and re-syncing it after a change issues a supplementary invoice or a credit note rather than silently editing an issued document.' },
        ar: { title: 'فاتورة الحملة', desc: 'يمكن للحملة إصدار فاتورة واحدة تغطي مخرجاتها، وإعادة مزامنتها بعد التغيير تُصدر فاتورة تكميلية أو إشعاراً دائناً بدل التعديل الصامت لمستند صادر.' },
      },
    ],
  },
  {
    id: 'commissions',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Commissions',
    ar: 'العمولات',
    route: '/crm/commissions',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'How Commission Is Earned', desc: 'Commission is calculated when an opportunity closes as Won, split across everyone credited on it by their contribution weight. Nothing accrues from a Lost opportunity.' },
        ar: { title: 'كيف تُكتسب العمولة', desc: 'تُحتسب العمولة عند إغلاق الفرصة كمكسوبة، وتُقسَّم على كل من له نصيب فيها حسب وزن مساهمته. ولا يُستحق شيء من فرصة مفقودة.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Approve Before Paying', desc: 'Draft, Approved, Paid — in that order. Approving posts the expense and the payable; paying clears the payable against cash. Paying without approving is refused, because approval is the control that authorises the spend.' },
        ar: { title: 'الاعتماد قبل الدفع', desc: 'مسودة، معتمدة، مدفوعة — بهذا الترتيب. الاعتماد يقيّد المصروف والالتزام؛ والدفع يسدد الالتزام مقابل النقد. ويُرفض الدفع دون اعتماد، لأن الاعتماد هو الضابط الذي يجيز الإنفاق.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Voiding', desc: 'Void reverses an approved accrual cleanly. A commission that has already been paid cannot be voided — the money has left, so it is recovered with a repayment rather than erased from the books.' },
        ar: { title: 'الإلغاء', desc: 'يعكس الإلغاء الاستحقاق المعتمد بشكل نظيف. أما العمولة المدفوعة فلا يمكن إلغاؤها — فالمال قد خرج، ويُسترد بسداد عكسي بدل محوه من الدفاتر.' },
      },
    ],
  },
  {
    id: 'vendor-requests',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Vendor Requests',
    ar: 'طلبات الموردين',
    route: '/crm/vendor-requests',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Asking Vendors to Quote', desc: 'Send a scoped request to a vendor for a campaign deliverable — scope, schedule and cost in one place, so what was agreed is recorded rather than living in email.' },
        ar: { title: 'طلب عروض من الموردين', desc: 'أرسل طلباً محدد النطاق إلى مورّد لمخرج حملة — النطاق والجدول والتكلفة في مكان واحد، فيُسجَّل ما اتُفق عليه بدل بقائه في البريد.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'From Request to Cost', desc: 'An accepted request carries its agreed cost onto the deliverable, which is what lets a campaign be compared against what it actually spent.' },
        ar: { title: 'من الطلب إلى التكلفة', desc: 'الطلب المقبول ينقل تكلفته المتفق عليها إلى المخرج، وهو ما يتيح مقارنة الحملة بما أنفقته فعلاً.' },
      },
    ],
  },
  {
    id: 'pipeline-board',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Opportunity Board',
    ar: 'لوحة الفرص',
    route: '/crm/pipeline',
    steps: [
      {
        optional: true,
        target: '[data-tutorial="opportunities-kanban"]',
        en: { title: 'Dragging Through Stages', desc: 'Move an opportunity between stages to reflect where it really is. The board is the same data as the list — this view just makes the shape of the pipeline obvious at a glance.' },
        ar: { title: 'السحب بين المراحل', desc: 'حرّك الفرصة بين المراحل لتعكس موقعها الحقيقي. اللوحة هي البيانات نفسها الموجودة في القائمة — لكن هذا العرض يُظهر شكل خط الأنابيب بوضوح.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Closing an Opportunity', desc: 'Closing as Won is the event that triggers commission and lets the opportunity convert into a sales order. Closing as Lost records the outcome and the reason without any financial effect.' },
        ar: { title: 'إغلاق الفرصة', desc: 'الإغلاق كمكسوبة هو الحدث الذي يشغّل العمولة ويتيح تحويل الفرصة إلى أمر بيع. والإغلاق كمفقودة يسجل النتيجة والسبب دون أي أثر مالي.' },
      },
    ],
  },
  {
    id: 'hr-employees',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'people',
    en: 'Employee Directory',
    ar: 'دليل الموظفين',
    route: '/hr/employees',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'The Employee Record', desc: 'Job details, manager, employment type and salary components live here. Basic, allowances and deductions are what payroll reads when it builds a payslip — so a wrong figure here becomes a wrong payment.' },
        ar: { title: 'سجل الموظف', desc: 'تفاصيل الوظيفة والمدير ونوع التوظيف ومكوّنات الراتب موجودة هنا. الأساسي والبدلات والاستقطاعات هي ما تقرؤه الرواتب عند إنشاء قسيمة الراتب — فالرقم الخاطئ هنا يصبح دفعة خاطئة.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Bank Details Matter', desc: 'The IBAN recorded here is what goes into the WPS bank file. An employee without one now blocks the file from being generated at all, rather than being silently skipped at the bank.' },
        ar: { title: 'أهمية البيانات البنكية', desc: 'رقم الآيبان المسجَّل هنا هو ما يدخل ملف حماية الأجور. والموظف الذي بلا آيبان يمنع الآن إنشاء الملف بالكامل بدل تخطيه بصمت لدى البنك.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Linking to a User', desc: 'An employee can be linked to a login account. That link is what lets time logged by a user turn into a labour cost against the right person.' },
        ar: { title: 'الربط بحساب مستخدم', desc: 'يمكن ربط الموظف بحساب دخول. هذا الربط هو ما يجعل الوقت الذي يسجله المستخدم يتحول إلى تكلفة عمالة على الشخص الصحيح.' },
      },
    ],
  },
  {
    id: 'hr-leave',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'people',
    en: 'Leave Management',
    ar: 'إدارة الإجازات',
    route: '/hr/leave',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Requests and Balances', desc: 'Employees request leave against an annual allowance; approving one draws the balance down. Leave types can be paid or unpaid, which is what decides whether the balance is touched.' },
        ar: { title: 'الطلبات والأرصدة', desc: 'يطلب الموظفون إجازة من رصيد سنوي؛ والموافقة تخصم من الرصيد. وأنواع الإجازات قد تكون مدفوعة أو غير مدفوعة، وهو ما يحدد إن كان الرصيد سيُمس.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Approval Flow', desc: 'A request stays pending until a manager acts on it. Nothing is deducted while it is pending, so a rejected request leaves the balance untouched.' },
        ar: { title: 'مسار الموافقة', desc: 'يبقى الطلب معلقاً حتى يتصرف فيه المدير. ولا يُخصم شيء أثناء التعليق، فالطلب المرفوض يترك الرصيد كما هو.' },
      },
    ],
  },
  {
    id: 'hr-attendance',
    roles: ['Admin', 'Manager', 'Accountant'],
    category: 'people',
    en: 'Attendance',
    ar: 'الحضور',
    route: '/hr/attendance',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Daily Attendance', desc: 'Present, absent, on leave or holiday, recorded per employee per day. Approved leave shows here automatically, so the two views never disagree.' },
        ar: { title: 'الحضور اليومي', desc: 'حاضر أو غائب أو في إجازة أو عطلة، مسجَّل لكل موظف يومياً. وتظهر الإجازات المعتمدة هنا تلقائياً، فلا يتعارض العرضان أبداً.' },
      },
    ],
  },
  {
    id: 'influencers',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'Influencers',
    ar: 'المؤثرون',
    route: '/influencers',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Influencer Profiles', desc: 'Reach, platform and rate for each influencer you work with, kept alongside the campaigns they appear in. They can be imported from a CSV and exported back out.' },
        ar: { title: 'ملفات المؤثرين', desc: 'الوصول والمنصة والسعر لكل مؤثر تتعامل معه، محفوظة إلى جانب الحملات التي يظهرون فيها. ويمكن استيرادهم من ملف CSV وتصديرهم مجدداً.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'From Profile to Deliverable', desc: 'An influencer attached to a campaign deliverable carries their agreed rate with them, so the campaign cost builds itself rather than being retyped.' },
        ar: { title: 'من الملف إلى المخرج', desc: 'المؤثر المرتبط بمخرج حملة يحمل معه سعره المتفق عليه، فتُبنى تكلفة الحملة تلقائياً بدل إعادة كتابتها.' },
      },
    ],
  },
  {
    id: 'whatsapp',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'crm',
    en: 'WhatsApp Inbox',
    ar: 'صندوق واتساب',
    route: '/whatsapp',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Conversations in Context', desc: 'Inbound messages are matched to the contact they came from, so a conversation sits with that contact\'s history rather than in a separate silo.' },
        ar: { title: 'المحادثات في سياقها', desc: 'تُطابق الرسائل الواردة مع جهة الاتصال التي أرسلتها، فتبقى المحادثة مع سجل تلك الجهة بدل أن تكون في صومعة منفصلة.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Automatic Follow-Ups', desc: 'An inbound message from a known contact schedules a same-day reply reminder, so an enquiry does not quietly go cold.' },
        ar: { title: 'المتابعات التلقائية', desc: 'الرسالة الواردة من جهة معروفة تجدول تذكيراً بالرد في اليوم نفسه، فلا يبرد الاستفسار بصمت.' },
      },
    ],
  },
  {
    id: 'notifications',
    roles: ['Admin', 'Manager', 'Employee', 'Accountant'],
    category: 'admin',
    en: 'Notifications',
    ar: 'الإشعارات',
    route: '/notifications',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'What Reaches You', desc: 'Task assignments, due dates, overdue invoices, low stock and expiring lots all raise notifications. Critical ones email immediately; the rest collect into a digest.' },
        ar: { title: 'ما يصلك', desc: 'تُنشئ إسنادات المهام وتواريخ الاستحقاق والفواتير المتأخرة وانخفاض المخزون والدفعات المنتهية إشعارات. العاجلة تُرسل بالبريد فوراً، والباقي يُجمع في ملخص.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Preferences', desc: 'Choose which categories reach you. Preferences are per user, so a manager and an accountant can watch entirely different things without affecting each other.' },
        ar: { title: 'التفضيلات', desc: 'اختر الفئات التي تصلك. التفضيلات لكل مستخدم على حدة، فيمكن للمدير والمحاسب متابعة أمور مختلفة تماماً دون تأثير متبادل.' },
      },
    ],
  },
  {
    id: 'diagram',
    category: 'start',
    en: 'Company Diagram',
    ar: 'مخطط الشركة',
    route: '/diagram',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Seeing the Shape of the Business', desc: 'A visual map of how your records connect — clients to orders, orders to invoices, invoices to payments. Useful for spotting where a chain breaks before it shows up as a wrong number.' },
        ar: { title: 'رؤية شكل العمل', desc: 'خريطة بصرية لكيفية ارتباط سجلاتك — العملاء بالأوامر، والأوامر بالفواتير، والفواتير بالمدفوعات. مفيدة لاكتشاف انقطاع السلسلة قبل أن يظهر كرقم خاطئ.' },
      },
    ],
  },
  {
    id: 'users',
    roles: ['Admin', 'Manager'],
    category: 'admin',
    en: 'Users & Roles',
    ar: 'المستخدمون والأدوار',
    route: '/users',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Roles Decide Access', desc: 'Admin, Manager, Employee and Accountant each see a different system. Roles are assigned per company, so the same person can be an Admin in one and an Employee in another.' },
        ar: { title: 'الأدوار تحدد الوصول', desc: 'المدير العام والمدير والموظف والمحاسب — كل منهم يرى نظاماً مختلفاً. وتُسند الأدوار لكل شركة، فيمكن للشخص نفسه أن يكون مديراً عاماً في واحدة وموظفاً في أخرى.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Commission Profile', desc: 'A user can be marked commission-eligible with a default rate and basis. These are the defaults the commission engine falls back to when a rule does not specify its own.' },
        ar: { title: 'ملف العمولة', desc: 'يمكن تعليم المستخدم كمستحق للعمولة مع نسبة وأساس افتراضيين. وهذه هي القيم التي يرجع إليها محرك العمولات عندما لا تحدد القاعدة قيمها الخاصة.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Cost Rate', desc: 'The hourly cost rate is what turns logged time into a labour cost. Without it, time is recorded but contributes nothing to project profitability.' },
        ar: { title: 'سعر التكلفة', desc: 'سعر التكلفة بالساعة هو ما يحوّل الوقت المسجل إلى تكلفة عمالة. وبدونه يُسجَّل الوقت لكنه لا يسهم في ربحية المشروع.' },
      },
    ],
  },
  {
    id: 'companies',
    category: 'admin',
    en: 'Multi-Company',
    ar: 'تعدد الشركات',
    // /companies only redirects (super-admins to /admin, everyone else home), so
    // this runs against the switcher in the header, which is on every page.
    route: '/',
    steps: [
      {
        optional: true,
        target: '[data-tutorial="company-switcher"]',
        en: { title: 'One Company at a Time', desc: 'Each company keeps its own ledger, numbering, currency and data. Nothing crosses between them — a user must be assigned to a company to see anything in it at all.' },
        ar: { title: 'تعدد الشركات', desc: 'تحتفظ كل شركة بدفتر أستاذها وترقيمها وعملتها وبياناتها. ولا يعبر شيء بينها — فيجب إسناد المستخدم إلى شركة ليرى أي شيء فيها.' },
      },
      {
        optional: true,
        target: '[data-tutorial="company-switcher"]',
        en: { title: 'Switching Company', desc: 'This control changes which company you are working in. Every figure on every page is scoped to it, so check it before reading anything that surprises you.' },
        ar: { title: 'تبديل الشركة', desc: 'يغيّر المبدّل في الأعلى الشركة التي تعمل فيها. وكل رقم في كل صفحة محصور بها، فتحقق منه قبل قراءة أي شيء يفاجئك.' },
      },
    ],
  },
  {
    id: 'company-profile',
    roles: ['Admin', 'Manager'],
    category: 'admin',
    en: 'Company Profile',
    ar: 'ملف الشركة',
    route: '/company-profile',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Details That Print', desc: 'Legal name, address, tax number and logo are pulled onto every invoice, quotation and delivery note. Setting them once here means never retyping them onto a document.' },
        ar: { title: 'التفاصيل التي تُطبع', desc: 'يُسحب الاسم القانوني والعنوان والرقم الضريبي والشعار إلى كل فاتورة وعرض سعر وإشعار تسليم. وضبطها مرة هنا يعني عدم إعادة كتابتها على أي مستند.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Tax Details', desc: 'The tax registration shown on documents comes from here. If you are VAT registered, this is what makes your invoices compliant documents rather than just receipts.' },
        ar: { title: 'التفاصيل الضريبية', desc: 'يأتي التسجيل الضريبي الظاهر على المستندات من هنا. وإن كنت مسجلاً في ضريبة القيمة المضافة، فهذا ما يجعل فواتيرك مستندات مطابقة لا مجرد إيصالات.' },
      },
    ],
  },

  {
    id: 'settings',
    roles: ['Admin'],
    category: 'admin',
    en: 'Settings & Numbering',
    ar: 'الإعدادات والترقيم',
    route: '/settings',
    steps: [
      {
        optional: true,
        target: 'main',
        en: { title: 'Document Numbering', desc: 'Prefix, padding and next number for each document type — invoices, orders, deliveries. Numbers are generated from these settings, which is what guarantees they are sequential and never collide.' },
        ar: { title: 'ترقيم المستندات', desc: 'البادئة وعدد الخانات والرقم التالي لكل نوع مستند — الفواتير والأوامر والتسليمات. تُنشأ الأرقام من هذه الإعدادات، وهو ما يضمن تسلسلها وعدم تكرارها.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Currency & Fiscal Year', desc: 'The company currency is the currency the ledger is kept in. Everything posts here in base currency, and a foreign-currency invoice must carry a rate so it can be converted rather than silently added as a plain number.' },
        ar: { title: 'العملة والسنة المالية', desc: 'عملة الشركة هي العملة التي يُمسك بها دفتر الأستاذ. ويُقيَّد كل شيء هنا بالعملة الأساسية، ويجب أن تحمل الفاتورة بالعملة الأجنبية سعر صرف ليتم تحويلها بدل جمعها كرقم عادي.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Locking a Period', desc: 'Setting a lock date closes everything on or before it. Postings, edits and deletions in a locked period are all refused — including deleting a document, which would otherwise remove its ledger entries and quietly rewrite a closed month.' },
        ar: { title: 'إقفال الفترة', desc: 'تحديد تاريخ إقفال يغلق كل ما قبله وحتى تاريخه. وتُرفض القيود والتعديلات والحذف في الفترة المقفلة — بما في ذلك حذف مستند، وهو ما كان سيزيل قيوده ويعيد كتابة شهر مقفل بصمت.' },
      },
      {
        optional: true,
        target: 'main',
        en: { title: 'Approval Threshold', desc: 'Purchase orders at or above this amount must be approved before anyone can receive against them. The gate is enforced on the server, so it cannot be bypassed by going around the interface.' },
        ar: { title: 'حد الموافقة', desc: 'يجب اعتماد أوامر الشراء عند هذا المبلغ أو أعلى قبل أن يتمكن أحد من الاستلام مقابلها. والقيد مطبَّق على الخادم، فلا يمكن تجاوزه بالالتفاف على الواجهة.' },
      },
    ],
  },

];
