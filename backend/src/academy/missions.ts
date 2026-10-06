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
  /** Browser-reported when the trainee opens this page (screens that only show things). */
  visit?: string;
}

export interface Mission {
  id: string;
  order: number;
  xp: number;
  /** Roles whose daily work this is: their path puts it first. Everyone does every mission. */
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
      { id: 'private', title: { en: 'Make a personal task private', ar: 'اجعل مهمة شخصية خاصة' }, measure: rows('tasks', 'isPrivate = 1') },
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
    id: 'buy-restock', order: 5, xp: 150, roles: MONEY, modules: ['purchasing', 'inventory', 'vendor-bills'],
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
    id: 'sell-get-paid', order: 8, xp: 150, roles: MONEY, modules: ['sales', 'invoices'],
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
    id: 'make', order: 10, xp: 100, roles: ['Admin', 'Manager'], modules: ['manufacturing'],
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
    id: 'run-books', order: 13, xp: 150, roles: ['Admin', 'Accountant'], modules: ['finance'],
    title: { en: 'Run the books', ar: 'أدِر الدفاتر' },
    story: {
      en: 'Day-to-day books: record what was spent, fix a mistake the right way, and plan next year.',
      ar: 'الدفاتر اليومية: سجّل المصروفات، وصحّح خطأً بالطريقة الصحيحة، وخطّط للعام القادم.',
    },
    objectives: [
      { id: 'expense', title: { en: 'Record an expense', ar: 'سجّل مصروفاً' }, measure: rows('expenses') },
      { id: 'reverse', title: { en: 'Post a journal entry, then reverse it', ar: 'سجّل قيداً ثم اعكسه' }, measure: rows('journal_entries', "sourceType = 'journal_reversal'") },
      { id: 'budget', title: { en: 'Set a budget', ar: 'ضع ميزانية' }, measure: rows('budgets') },
    ],
  },
  {
    id: 'people-pay', order: 15, xp: 120, roles: MONEY, modules: ['hr', 'payroll'],
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
    id: 'campaigns', order: 11, xp: 120, roles: ['Admin', 'Manager'], modules: ['campaigns', 'commissions'],
    title: { en: 'Campaigns and commissions', ar: 'الحملات والعمولات' },
    story: {
      en: 'Promote the gift boxes with an influencer campaign, and reward the salesperson who closed the deal.',
      ar: 'روّج لعلب الهدايا بحملة مؤثرين، وكافئ مندوب المبيعات الذي أغلق الصفقة.',
    },
    objectives: [
      { id: 'influencer', title: { en: 'Add an influencer', ar: 'أضف مؤثراً' }, measure: rows('contact_roles', "role = 'Influencer'") },
      { id: 'campaign', title: { en: 'Plan a campaign with a deliverable', ar: 'خطّط حملة بمخرَج' }, measure: rows('campaign_deliverables') },
      { id: 'rule', title: { en: 'Set a commission rule', ar: 'ضع قاعدة عمولة' }, measure: rows('commission_rules') },
      { id: 'commission', title: { en: 'Earn a commission', ar: 'احتسب عمولة' }, measure: rows('commissions') },
    ],
  },
  {
    id: 'run-company', order: 16, xp: 100, roles: ['Admin'], modules: ['settings'],
    title: { en: 'Run the company', ar: 'أدِر الشركة' },
    story: {
      en: 'Make the system yours: company details on every document, and a field you need.',
      ar: 'اجعل النظام خاصاً بك: بيانات الشركة على كل مستند، وحقل تحتاجه.',
    },
    objectives: [
      { id: 'details', title: { en: 'Fill in the VAT Number', ar: 'أدخل رقم ضريبة القيمة المضافة' }, measure: (c) => c.count("SELECT COUNT(*) AS n FROM companies WHERE id = ? AND taxNumber IS NOT NULL AND taxNumber != ''", c.companyId) },
      { id: 'field', title: { en: 'Add a custom field', ar: 'أضف حقلاً مخصصاً' }, measure: rows('custom_field_definitions') },
    ],
  },
  {
    id: 'month-end', order: 18, xp: 200, roles: MONEY, modules: [], after: ['sell-get-paid', 'buy-restock', 'run-books'],
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

  {
    id: 'follow-through', order: 3, xp: 80, roles: ['Admin', 'Manager', 'Employee'], modules: [],
    title: { en: 'Follow through', ar: 'تابع حتى النهاية' },
    story: {
      en: 'Deals are won by following up. Clear today\u2019s follow-ups: finish one, push one to later.',
      ar: 'الصفقات تُكسب بالمتابعة. أنهِ متابعات اليوم: أكمل واحدة وأجّل أخرى.',
    },
    objectives: [
      { id: 'complete', title: { en: 'Complete a follow-up with its outcome', ar: 'أكمل متابعة مع نتيجتها' }, measure: rows('follow_ups', "status = 'completed'") },
      { id: 'snooze', title: { en: 'Snooze one to later', ar: 'أجّل متابعة إلى وقت لاحق' }, measure: rows('follow_ups', 'snoozedUntil IS NOT NULL') },
    ],
  },
  {
    id: 'see-the-work', order: 4, xp: 60, roles: ['Admin', 'Manager', 'Employee'], modules: [],
    title: { en: 'See the work', ar: 'شاهد العمل' },
    story: {
      en: 'The same work, seen three ways: your own list, how tasks depend on each other, and how the team is doing.',
      ar: 'العمل نفسه من ثلاث زوايا: قائمتك، وكيف تعتمد المهام على بعضها، وأداء الفريق.',
    },
    objectives: [
      { id: 'my-tasks', title: { en: 'Open your task list', ar: 'افتح قائمة مهامك' }, visit: '/tasks' },
      { id: 'diagram', title: { en: 'Open the task diagram', ar: 'افتح مخطط المهام' }, visit: '/diagram' },
      { id: 'performance', title: { en: 'Open the performance dashboard', ar: 'افتح لوحة الأداء' }, visit: '/crm/performance' },
    ],
  },

  {
    id: 'stock-control', order: 6, xp: 120, roles: ['Admin', 'Manager', 'Accountant'], modules: [],
    title: { en: 'Stock control', ar: 'ضبط المخزون' },
    story: {
      en: 'Dates spoil. Store them in the right place, track each batch\u2019s expiry, and count what is really on the shelf.',
      ar: 'التمر يتلف. خزّنه في مكانه الصحيح، وتتبّع انتهاء كل دفعة، واعدد ما على الرف فعلاً.',
    },
    objectives: [
      { id: 'warehouse', title: { en: 'Add a warehouse', ar: 'أضف مستودعاً' }, measure: rows('warehouses') },
      { id: 'lot', title: { en: 'Receive a batch with an expiry date', ar: 'استلم دفعة بتاريخ انتهاء' }, measure: rows('inventory_lots', 'expiryDate IS NOT NULL') },
      { id: 'count', title: { en: 'Post a stock count', ar: 'رحّل جرداً للمخزون' }, measure: rows('stock_counts', "status = 'posted'") },
    ],
  },
  {
    id: 'match-bill', order: 7, xp: 80, roles: ['Admin', 'Manager', 'Accountant'], modules: [],
    title: { en: 'Match a bill', ar: 'طابق فاتورة' },
    story: {
      en: 'Before paying, check the bill against what you ordered and what arrived. That is how overcharges get caught.',
      ar: 'قبل الدفع، طابق الفاتورة مع ما طلبته وما وصل. هكذا تُكتشف المبالغ الزائدة.',
    },
    objectives: [
      { id: 'linked', title: { en: 'Approve a supplier bill linked to its purchase order', ar: 'اعتمد فاتورة مورّد مرتبطة بأمر الشراء' }, measure: rows('vendor_bills', "purchaseOrderId IS NOT NULL AND status != 'Draft'") },
      { id: 'matching', title: { en: 'Review it on the matching screen', ar: 'راجعها في شاشة المطابقة' }, visit: '/purchases/matching' },
    ],
  },

  {
    id: 'credit-currency', order: 9, xp: 90, roles: ['Admin', 'Manager', 'Accountant'], modules: [],
    title: { en: 'Credit and currency', ar: 'الائتمان والعملات' },
    story: {
      en: 'A Dubai hotel wants to buy on credit, in dirhams. Set how much they may owe, and invoice them in their currency.',
      ar: 'فندق في دبي يريد الشراء بالآجل وبالدرهم. حدّد ما يمكنه أن يدين به، وأصدر فاتورته بعملته.',
    },
    objectives: [
      { id: 'limit', title: { en: 'Give a client a credit limit', ar: 'حدّد سقف ائتمان لعميل' }, measure: rows('clients', 'creditLimit > 0') },
      { id: 'fx', title: { en: 'Send an invoice in another currency', ar: 'أرسل فاتورة بعملة أخرى' }, measure: rows('invoices', "currency IS NOT NULL AND currency != 'OMR' AND status != 'Draft'") },
    ],
  },

  {
    id: 'documents', order: 12, xp: 80, roles: ['Admin', 'Manager', 'Accountant', 'Employee'], modules: ['documents'],
    title: { en: 'Documents and letters', ar: 'المستندات والخطابات' },
    story: {
      en: 'The hotel needs a letter confirming the Ramadan supply. Design a template once, then produce the letter from it.',
      ar: 'يحتاج الفندق خطاباً يؤكد توريد رمضان. صمّم قالباً مرة واحدة، ثم أنتج الخطاب منه.',
    },
    objectives: [
      { id: 'template', title: { en: 'Create a letter template', ar: 'أنشئ قالب خطاب' }, measure: rows('document_templates') },
      { id: 'document', title: { en: 'Produce a letter from it', ar: 'أنتج خطاباً منه' }, measure: rows('documents') },
      { id: 'final', title: { en: 'Finalize it', ar: 'اعتمده نهائياً' }, measure: rows('documents', "status = 'final'") },
    ],
  },

  {
    id: 'close-quarter', order: 14, xp: 120, roles: ['Admin', 'Accountant'], modules: [],
    title: { en: 'Close the quarter', ar: 'أغلق الربع' },
    story: {
      en: 'Quarter end: work out the VAT, file it, and lock the period so nobody changes what was reported.',
      ar: 'نهاية الربع: احسب ضريبة القيمة المضافة وقدّمها، وأقفل الفترة كي لا يغيّر أحد ما أُبلغ عنه.',
    },
    objectives: [
      { id: 'vat', title: { en: 'File the quarter\u2019s VAT return', ar: 'قدّم إقرار ضريبة القيمة المضافة للربع' }, measure: rows('vat_returns', "status = 'filed'") },
      { id: 'lock', title: { en: 'Lock the closed period', ar: 'أقفل الفترة المنتهية' }, measure: rows('company_finance_settings', 'lockedThroughDate IS NOT NULL') },
    ],
  },

  {
    id: 'look-around', order: 17, xp: 50, roles: ['Admin', 'Manager', 'Accountant', 'Employee'], modules: ['whatsapp'],
    title: { en: 'Look around', ar: 'جولة سريعة' },
    story: {
      en: 'Two more places you will use: the WhatsApp inbox (a practice company has no number, so just look), and the influencer roster.',
      ar: 'مكانان آخران ستستخدمهما: صندوق واتساب (لا رقم للشركة التدريبية، فاكتفِ بالنظر)، وقائمة المؤثرين.',
    },
    objectives: [
      { id: 'whatsapp', title: { en: 'Open the WhatsApp inbox', ar: 'افتح صندوق واتساب' }, visit: '/whatsapp' },
      { id: 'influencers', title: { en: 'Open the influencer roster', ar: 'افتح قائمة المؤثرين' }, visit: '/influencers' },
    ],
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

const RANK: Record<AcademyRole, number> = { Employee: 0, Accountant: 1, Manager: 2, Admin: 3 };

/** The highest of a user's real-company roles decides their path. */
export function highestRole(roles: string[]): AcademyRole {
  return roles.reduce<AcademyRole>((best, r) => (r in RANK && RANK[r as AcademyRole] > RANK[best] ? (r as AcademyRole) : best), 'Employee');
}

/**
 * Every mission, for everyone: understanding how one person's work lands in
 * someone else's numbers is the point. The role only decides the order — the
 * missions of their own daily work first — so they unlock what they need
 * soonest. The month-end check always comes last. Missions whose modules are
 * switched off in all their companies are skipped.
 */
export function requiredMissions(role: AcademyRole, disabledEverywhere: Set<string> = new Set()): Mission[] {
  const available = MISSIONS.filter((m) => m.modules.length === 0 || m.modules.some((mod) => !disabledEverywhere.has(mod)));
  const rank = (m: Mission) => (m.id === 'first-day' ? 0 : m.id === 'month-end' ? 3 : m.roles.includes(role) ? 1 : 2);
  return available.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

export const LEVEL_XP = 200;
export const levelOf = (xp: number) => Math.floor(xp / LEVEL_XP) + 1;
