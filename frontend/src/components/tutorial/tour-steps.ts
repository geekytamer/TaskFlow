export interface TourStep {
  target: string;
  en: { title: string; desc: string };
  ar: { title: string; desc: string };
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface Tour {
  id: string;
  en: string;
  ar: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  // ─────────────────────────────────────────────
  // SYSTEM OVERVIEW
  // ─────────────────────────────────────────────
  {
    id: 'overview',
    en: 'System Overview',
    ar: 'نظرة عامة على النظام',
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
    en: 'Dashboard Tour',
    ar: 'جولة لوحة التحكم',
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
    en: 'Finance Module',
    ar: 'وحدة المالية',
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
    en: 'Invoicing Workflow',
    ar: 'سير عمل الفوترة',
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
        target: '[data-tutorial="invoice-create-btn"]',
        en: { title: 'Create Invoice Button', desc: 'Click this to open the invoice creation panel. You\'ll be able to select a client, optionally link to a sales order or template, pick billable tasks from that client\'s project history, and add manual line items. The invoice is saved as a Draft until you\'re ready to send it.' },
        ar: { title: 'زر إنشاء فاتورة', desc: 'انقر هنا لفتح لوحة إنشاء الفاتورة. ستتمكن من اختيار عميل، والربط اختيارياً بأمر بيع أو قالب، واختيار المهام القابلة للفوترة من سجل مشاريع ذلك العميل، وإضافة عناصر بنود يدوية. تُحفظ الفاتورة كمسودة حتى تكون مستعداً لإرسالها.' },
        position: 'bottom',
      },
      {
        target: '[data-tutorial="invoice-form-client"]',
        en: { title: 'Select Client', desc: 'Choose the client this invoice is for. Only contacts with the "Client" role appear here. Once you select a client, the system loads their billable tasks — completed work that has an invoice amount attached but hasn\'t been invoiced yet.' },
        ar: { title: 'اختيار العميل', desc: 'اختر العميل الذي تخص الفاتورة. تظهر هنا فقط جهات الاتصال ذات دور "العميل". بمجرد اختيار عميل، يقوم النظام بتحميل مهامه القابلة للفوترة — العمل المكتمل الذي يحتوي على مبلغ فاتورة مرفق ولم يتم فوترته بعد.' },
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
        en: { title: 'Invoice Template', desc: 'Choose how the printed or PDF version of this invoice looks. Templates control the layout, logo placement, colors, and footer text. The default template is selected automatically, but you can switch to any custom template you\'ve created in the Invoice Templates tab.' },
        ar: { title: 'قالب الفاتورة', desc: 'اختر شكل النسخة المطبوعة أو PDF من هذه الفاتورة. تتحكم القوالب في التخطيط وموضع الشعار والألوان ونص التذييل. يتم تحديد القالب الافتراضي تلقائياً، لكن يمكنك التبديل إلى أي قالب مخصص أنشأته في تبويب قوالب الفواتير.' },
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
    en: 'Ledger & Chart of Accounts',
    ar: 'دفتر الأستاذ ودليل الحسابات',
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
    en: 'Sales Orders',
    ar: 'أوامر البيع',
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
    en: 'Purchase Orders',
    ar: 'أوامر الشراء',
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
    en: 'Inventory Management',
    ar: 'إدارة المخزون',
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
    en: 'Projects & Tasks',
    ar: 'المشاريع والمهام',
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
    en: 'Contacts & Leads',
    ar: 'جهات الاتصال والعملاء المحتملون',
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
    en: 'CRM Panel',
    ar: 'لوحة إدارة العلاقات',
    steps: [
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
    en: 'CRM Pipeline',
    ar: 'خط أنابيب المبيعات',
    steps: [
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
    en: 'Follow-Up Center',
    ar: 'مركز المتابعة',
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
    en: 'Performance Dashboard',
    ar: 'لوحة الأداء',
    steps: [
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
];
