/**
 * TaskFlow Academy missions. Each objective is checked on the trainee's own
 * practice company: a number from the database that must grow past what the
 * practice company had when it was created (its baseline), so seeded defaults
 * never count and progress cannot be faked from the browser. A few first-day
 * objectives are about looking around the app; the browser reports those.
 */

export type AcademyRole = 'Admin' | 'Manager' | 'Accountant' | 'Employee';

/** Counts rows: `count(sql, ...params)`. The practice company id is the first parameter of every check. */
export type Count = (sql: string, ...params: unknown[]) => number;

export interface ObjectiveContext {
  count: Count;
  companyId: string;
  /** Net profit of the practice company so far (from the real P&L). */
  profit: () => number;
  /** Whether the practice company's trial balance balances. */
  balanced: () => boolean;
}

export interface Objective {
  id: string;
  title: { en: string; ar: string };
  /** A number that must exceed its baseline. Absent for objectives the browser reports. */
  measure?: (ctx: ObjectiveContext) => number;
}

export interface Mission {
  id: string;
  order: number;
  xp: number;
  /** Roles that must complete it. */
  roles: AcademyRole[];
  /** Real-company modules (route permission modules) it unlocks. */
  modules: string[];
  title: { en: string; ar: string };
  story: { en: string; ar: string };
  objectives: Objective[];
  /** Missions that must be done first (only the month-end check uses this). */
  after?: string[];
}

const ALL: AcademyRole[] = ['Admin', 'Manager', 'Accountant', 'Employee'];
const MONEY: AcademyRole[] = ['Admin', 'Manager', 'Accountant'];

const rows = (table: string, where = '') => (c: ObjectiveContext) =>
  c.count(`SELECT COUNT(*) AS n FROM ${table} WHERE companyId = ?${where ? ` AND ${where}` : ''}`, c.companyId);

export const MISSIONS: Mission[] = [
  {
    id: 'first-day', order: 0, xp: 50, roles: ALL, modules: ['dashboard'],
    title: { en: 'First day', ar: 'اليوم الأول' },
    story: {
      en: 'Welcome to Al Waha Trading, your practice company. Nothing here is real, so explore freely. First, find your way around.',
      ar: 'مرحباً بك في شركة الواحة للتجارة، شركتك التدريبية. لا شيء هنا حقيقي، فاستكشف بحرية. أولاً، تعرّف على المكان.',
    },
    objectives: [
      { id: 'open-dashboard', title: { en: 'Open the dashboard', ar: 'افتح لوحة التحكم' } },
      { id: 'open-notifications', title: { en: 'Open your notifications', ar: 'افتح الإشعارات' } },
      { id: 'switch-language', title: { en: 'Switch the language once', ar: 'غيّر اللغة مرة واحدة' } },
    ],
  },
  {
    id: 'get-work-done', order: 1, xp: 100, roles: ALL, modules: ['projects', 'tasks'],
    title: { en: 'Get work done', ar: 'أنجز العمل' },
    story: {
      en: 'The warehouse needs reorganising before the Ramadan rush. Plan it as a project and see it through.',
      ar: 'يحتاج المستودع إلى إعادة ترتيب قبل موسم رمضان. خطّط له كمشروع وأنجزه.',
    },
    objectives: [
      { id: 'project', title: { en: 'Create a project', ar: 'أنشئ مشروعاً' }, measure: rows('projects') },
      { id: 'task', title: { en: 'Add a task to it', ar: 'أضف مهمة إليه' }, measure: rows('tasks', 'projectId IS NOT NULL') },
      { id: 'assign', title: { en: 'Assign the task to yourself', ar: 'أسند المهمة إلى نفسك' }, measure: rows('tasks', "assignedUserIds IS NOT NULL AND assignedUserIds NOT IN ('', '[]')") },
      { id: 'time', title: { en: 'Log time on it', ar: 'سجّل وقتاً عليها' }, measure: rows('time_entries') },
      { id: 'done', title: { en: 'Mark it done', ar: 'علّمها كمنجزة' }, measure: rows('tasks', "status = 'Done'") },
    ],
  },
  {
    id: 'win-customer', order: 2, xp: 100, roles: ALL, modules: ['contacts', 'crm'],
    title: { en: 'Win a customer', ar: 'اكسب عميلاً' },
    story: {
      en: 'Al Noor Hotel wants dates for its iftar buffet. Add them, open an opportunity and keep it moving.',
      ar: 'يريد فندق النور تموراً لبوفيه الإفطار. أضفهم، وافتح فرصة بيع، وتابعها.',
    },
    objectives: [
      { id: 'client', title: { en: 'Add the hotel as a client', ar: 'أضف الفندق كعميل' }, measure: rows('contact_roles', "role = 'Client'") },
      { id: 'opportunity', title: { en: 'Open an opportunity', ar: 'افتح فرصة بيع' }, measure: rows('opportunities') },
      { id: 'follow-up', title: { en: 'Schedule a follow-up', ar: 'جدول متابعة' }, measure: rows('follow_ups') },
      { id: 'advance', title: { en: 'Move the opportunity forward', ar: 'قدّم الفرصة إلى مرحلة تالية' }, measure: rows('opportunities', "stage != 'New'") },
    ],
  },
  {
    id: 'buy-restock', order: 3, xp: 150, roles: MONEY, modules: ['purchasing', 'inventory', 'vendor-bills'],
    title: { en: 'Buy and restock', ar: 'اشترِ وأعد التخزين' },
    story: {
      en: 'You need stock before you can sell. Buy Khalas dates from Nakheel Farms the proper way, and watch cash turn into stock.',
      ar: 'تحتاج مخزوناً قبل أن تبيع. اشترِ تمور الخلاص من مزارع النخيل بالطريقة الصحيحة، وشاهد النقد يتحوّل إلى مخزون.',
    },
    objectives: [
      { id: 'supplier', title: { en: 'Add the supplier', ar: 'أضف المورّد' }, measure: rows('suppliers') },
      { id: 'item', title: { en: 'Create a stock item', ar: 'أنشئ صنف مخزون' }, measure: rows('inventory_items', 'tracksInventory = 1') },
      { id: 'requisition', title: { en: 'Get a purchase requisition approved', ar: 'احصل على اعتماد طلب شراء' }, measure: rows('purchase_requisitions', "status IN ('Approved', 'Converted')") },
      {
        id: 'rfq', title: { en: 'Compare two supplier quotes and award one', ar: 'قارن عرضَي مورّدين ورسِّ أحدهما' },
        measure: (c) => c.count('SELECT COUNT(*) AS n FROM rfqs r WHERE r.companyId = ? AND r.awardedQuoteId IS NOT NULL AND (SELECT COUNT(*) FROM rfq_quotes q WHERE q.rfqId = r.id) >= 2', c.companyId),
      },
      { id: 'receive', title: { en: 'Receive a purchase order', ar: 'استلم أمر شراء' }, measure: rows('purchase_orders', "status IN ('Received', 'Partially Received')") },
      { id: 'bill', title: { en: 'Approve the supplier bill', ar: 'اعتمد فاتورة المورّد' }, measure: rows('vendor_bills', "status IN ('Approved', 'Paid', 'Overdue')") },
      {
        id: 'pay-bill', title: { en: 'Pay the supplier', ar: 'ادفع للمورّد' },
        measure: (c) => c.count('SELECT COUNT(*) AS n FROM vendor_bill_payments p JOIN vendor_bills b ON b.id = p.billId WHERE b.companyId = ?', c.companyId),
      },
    ],
  },
  {
    id: 'sell-get-paid', order: 4, xp: 150, roles: MONEY, modules: ['sales', 'invoices'],
    title: { en: 'Sell and get paid', ar: 'بِع واقبض' },
    story: {
      en: 'The hotel accepted your price. Quote, deliver, invoice and collect — and see where every rial lands.',
      ar: 'قبل الفندق سعرك. قدّم عرض السعر، وسلّم، وأصدر الفاتورة، واقبض — وشاهد أين يذهب كل ريال.',
    },
    objectives: [
      { id: 'quote', title: { en: 'Get a quotation accepted', ar: 'احصل على قبول عرض سعر' }, measure: rows('quotations', "status = 'Accepted'") },
      { id: 'order', title: { en: 'Turn it into a sales order', ar: 'حوّله إلى أمر بيع' }, measure: rows('sales_orders') },
      { id: 'deliver', title: { en: 'Deliver the goods', ar: 'سلّم البضاعة' }, measure: rows('deliveries', "status IN ('Shipped', 'Delivered')") },
      { id: 'invoice', title: { en: 'Send the invoice', ar: 'أرسل الفاتورة' }, measure: rows('invoices', "status != 'Draft'") },
      {
        id: 'part-paid', title: { en: 'Record a part payment', ar: 'سجّل دفعة جزئية' },
        measure: (c) => c.count('SELECT COUNT(*) AS n FROM payments p JOIN invoices i ON i.id = p.invoiceId WHERE i.companyId = ?', c.companyId),
      },
      {
        id: 'fully-paid', title: { en: 'Collect the rest', ar: 'اقبض الباقي' },
        measure: (c) => c.count("SELECT COUNT(*) AS n FROM invoices i WHERE i.companyId = ? AND i.status = 'Paid' AND (SELECT COUNT(*) FROM payments p WHERE p.invoiceId = i.id) >= 2", c.companyId),
      },
      { id: 'credit', title: { en: 'Credit a damaged box', ar: 'أصدر إشعار دائن لعلبة تالفة' }, measure: rows('credit_notes') },
    ],
  },
  {
    id: 'make', order: 5, xp: 100, roles: ['Admin', 'Manager'], modules: ['manufacturing'],
    title: { en: 'Make gift boxes', ar: 'اصنع علب الهدايا' },
    story: {
      en: 'Loose dates sell; gift boxes sell better. Write the recipe and run a batch.',
      ar: 'التمر السائب يُباع، وعلب الهدايا تُباع أكثر. اكتب الوصفة وشغّل دفعة.',
    },
    objectives: [
      { id: 'recipe', title: { en: 'Write a recipe', ar: 'اكتب وصفة' }, measure: rows('recipes') },
      { id: 'work-order', title: { en: 'Complete a work order', ar: 'أكمل أمر عمل' }, measure: rows('work_orders', "status = 'completed'") },
    ],
  },
  {
    id: 'run-books', order: 6, xp: 150, roles: ['Admin', 'Accountant'], modules: ['finance'],
    title: { en: 'Run the books', ar: 'أدِر الدفاتر' },
    story: {
      en: 'Month end. Record what was spent, fix a mistake the right way, plan next year, file VAT and close the month.',
      ar: 'نهاية الشهر. سجّل المصروفات، وصحّح خطأً بالطريقة الصحيحة، وخطّط للعام القادم، وقدّم إقرار الضريبة، وأغلق الشهر.',
    },
    objectives: [
      { id: 'expense', title: { en: 'Record an expense', ar: 'سجّل مصروفاً' }, measure: rows('expenses') },
      { id: 'reverse', title: { en: 'Post a journal entry, then reverse it', ar: 'سجّل قيداً ثم اعكسه' }, measure: rows('journal_entries', "sourceType = 'journal_reversal'") },
      { id: 'budget', title: { en: 'Set a budget', ar: 'ضع ميزانية' }, measure: rows('budgets') },
      { id: 'vat', title: { en: 'Prepare a VAT return', ar: 'جهّز إقرار ضريبة القيمة المضافة' }, measure: rows('vat_returns') },
      { id: 'lock', title: { en: 'Lock a closed period', ar: 'أقفل فترة منتهية' }, measure: rows('company_finance_settings', 'lockedThroughDate IS NOT NULL') },
    ],
  },
  {
    id: 'people-pay', order: 7, xp: 120, roles: MONEY, modules: ['hr', 'payroll'],
    title: { en: 'People and pay', ar: 'الموظفون والرواتب' },
    story: {
      en: 'You hired a storekeeper. Add them, track a working day, handle a leave request and pay the month.',
      ar: 'عيّنت أمين مستودع. أضفه، وسجّل يوم عمل، وتعامل مع طلب إجازة، وادفع راتب الشهر.',
    },
    objectives: [
      { id: 'employee', title: { en: 'Add an employee', ar: 'أضف موظفاً' }, measure: rows('employees') },
      { id: 'attendance', title: { en: 'Record attendance', ar: 'سجّل الحضور' }, measure: rows('attendance') },
      { id: 'leave', title: { en: 'Handle a leave request', ar: 'عالج طلب إجازة' }, measure: rows('leave_requests') },
      { id: 'payroll', title: { en: 'Run and pay payroll', ar: 'شغّل الرواتب وادفعها' }, measure: rows('payroll_runs', "status = 'paid'") },
    ],
  },
  {
    id: 'campaigns', order: 8, xp: 120, roles: ['Admin', 'Manager'], modules: ['campaigns', 'commissions'],
    title: { en: 'Campaigns and commissions', ar: 'الحملات والعمولات' },
    story: {
      en: 'Promote the gift boxes with an influencer campaign, and reward the salesperson who closed the deal.',
      ar: 'روّج لعلب الهدايا بحملة مؤثرين، وكافئ مندوب المبيعات الذي أغلق الصفقة.',
    },
    objectives: [
      { id: 'campaign', title: { en: 'Plan a campaign with a deliverable', ar: 'خطّط حملة بمخرَج' }, measure: rows('campaign_deliverables') },
      { id: 'rule', title: { en: 'Set a commission rule', ar: 'ضع قاعدة عمولة' }, measure: rows('commission_rules') },
      { id: 'commission', title: { en: 'Earn a commission', ar: 'احتسب عمولة' }, measure: rows('commissions') },
    ],
  },
  {
    id: 'run-company', order: 9, xp: 100, roles: ['Admin'], modules: ['settings'],
    title: { en: 'Run the company', ar: 'أدِر الشركة' },
    story: {
      en: 'Make the system yours: company details on every document, a field you need, and a letter template.',
      ar: 'اجعل النظام خاصاً بك: بيانات الشركة على كل مستند، وحقل تحتاجه، وقالب خطاب.',
    },
    objectives: [
      { id: 'details', title: { en: 'Fill in the tax number', ar: 'أدخل الرقم الضريبي' }, measure: (c) => c.count("SELECT COUNT(*) AS n FROM companies WHERE id = ? AND taxNumber IS NOT NULL AND taxNumber != ''", c.companyId) },
      { id: 'field', title: { en: 'Add a custom field', ar: 'أضف حقلاً مخصصاً' }, measure: rows('custom_field_definitions') },
      { id: 'template', title: { en: 'Create a document template', ar: 'أنشئ قالب مستند' }, measure: rows('document_templates') },
    ],
  },
  {
    id: 'month-end', order: 10, xp: 200, roles: MONEY, modules: [], after: ['sell-get-paid', 'buy-restock'],
    title: { en: 'Month-end check', ar: 'مراجعة نهاية الشهر' },
    story: {
      en: 'The owner asks three questions: do the books balance, has every customer paid on time, and did we make money?',
      ar: 'يسأل المالك ثلاثة أسئلة: هل الدفاتر متوازنة، وهل دفع كل العملاء في موعدهم، وهل حققنا ربحاً؟',
    },
    objectives: [
      { id: 'balanced', title: { en: 'The trial balance balances', ar: 'ميزان المراجعة متوازن' }, measure: (c) => (c.balanced() ? 1 : 0) },
      { id: 'no-overdue', title: { en: 'No overdue invoices', ar: 'لا فواتير متأخرة' }, measure: (c) => (c.count("SELECT COUNT(*) AS n FROM invoices WHERE companyId = ? AND status = 'Overdue'", c.companyId) === 0 && c.count("SELECT COUNT(*) AS n FROM invoices WHERE companyId = ? AND status = 'Paid'", c.companyId) > 0 ? 1 : 0) },
      { id: 'profit', title: { en: 'The month made a profit', ar: 'حقق الشهر ربحاً' }, measure: (c) => (c.profit() > 0 ? 1 : 0) },
    ],
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

const RANK: Record<AcademyRole, number> = { Employee: 0, Accountant: 1, Manager: 2, Admin: 3 };

/** The highest of a user's real-company roles decides their path. */
export function highestRole(roles: string[]): AcademyRole {
  return roles.reduce<AcademyRole>((best, r) => (r in RANK && RANK[r as AcademyRole] > RANK[best] ? (r as AcademyRole) : best), 'Employee');
}

/** Missions a role must complete, in order. Missions for modules switched off everywhere are skipped. */
export function requiredMissions(role: AcademyRole, disabledEverywhere: Set<string> = new Set()): Mission[] {
  return MISSIONS
    .filter((m) => m.roles.includes(role))
    .filter((m) => m.modules.length === 0 || m.modules.some((mod) => !disabledEverywhere.has(mod)))
    .sort((a, b) => a.order - b.order);
}

export const LEVEL_XP = 200;
export const levelOf = (xp: number) => Math.floor(xp / LEVEL_XP) + 1;
