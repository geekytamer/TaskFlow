/**
 * Step-by-step guidance for each Academy objective, keyed `missionId/objectiveId`.
 * The overlay walks these in order: it opens `route` if given, rings `target`
 * when it is on screen (otherwise shows the card on its own), and moves on when
 * the target is clicked. The objective itself is ticked only when the server
 * sees the result in the practice company.
 */
export interface GuideStep {
  route?: string;
  target?: string;
  en: string;
  ar: string;
}

const nav = (key: string) => `[data-tutorial="${key}"]`;

export const GUIDES: Record<string, GuideStep[]> = {
  'first-day/open-dashboard': [
    { target: nav('nav-dashboard'), en: 'Open the dashboard: the day at a glance.', ar: 'افتح لوحة التحكم: يومك في لمحة.' },
  ],
  'first-day/open-notifications': [
    { target: '[data-academy="notifications"]', en: 'Open your notifications. Approvals and reminders land here.', ar: 'افتح الإشعارات. تصلك هنا الموافقات والتذكيرات.' },
  ],
  'first-day/switch-language': [
    { target: '[data-academy="language"]', en: 'Switch the language. Everything works in English and Arabic.', ar: 'غيّر اللغة. كل شيء يعمل بالعربية والإنجليزية.' },
  ],

  'get-work-done/project': [
    { target: nav('nav-projects'), en: 'Open Projects.', ar: 'افتح المشاريع.' },
    { route: '/projects', target: nav('projects-create-btn'), en: 'Create a project called "Warehouse tidy-up".', ar: 'أنشئ مشروعاً باسم "ترتيب المستودع".' },
  ],
  'get-work-done/task': [
    { route: '/projects', target: nav('projects-list'), en: 'Open your project, then add a task such as "Label the shelves".', ar: 'افتح مشروعك ثم أضف مهمة مثل "ترقيم الرفوف".' },
  ],
  'get-work-done/assign': [
    { route: '/projects', target: nav('projects-tasks-table'), en: 'Open the task and assign it to yourself.', ar: 'افتح المهمة وأسندها إلى نفسك.' },
  ],
  'get-work-done/time': [
    { route: '/projects', target: nav('projects-tasks-table'), en: 'In the task, log the time you spent (try 45 minutes).', ar: 'في المهمة، سجّل الوقت الذي قضيته (جرّب 45 دقيقة).' },
  ],
  'get-work-done/done': [
    { route: '/projects', target: nav('projects-tasks-table'), en: 'Set the task to Done. Billable time can now be invoiced.', ar: 'اجعل المهمة منجزة. يمكن الآن فوترة الوقت.' },
  ],

  'win-customer/client': [
    { target: nav('nav-contacts'), en: 'Open Contacts.', ar: 'افتح جهات الاتصال.' },
    { route: '/contacts', target: nav('contacts-create'), en: 'Add "Al Noor Hotel" as a contact with the Client role.', ar: 'أضف "فندق النور" كجهة اتصال بدور عميل.' },
  ],
  'win-customer/opportunity': [
    { target: nav('nav-pipeline'), en: 'Open the pipeline.', ar: 'افتح مسار المبيعات.' },
    { route: '/crm/pipeline', target: nav('pipeline-create-opp'), en: 'Create an opportunity: "Iftar dates for Al Noor Hotel", expected OMR 1,200.', ar: 'أنشئ فرصة: "تمور الإفطار لفندق النور"، بقيمة متوقعة 1,200 ر.ع.' },
  ],
  'win-customer/follow-up': [
    { route: '/crm/pipeline', target: nav('opportunities-kanban'), en: 'Open the opportunity and schedule a follow-up call for tomorrow.', ar: 'افتح الفرصة وجدول مكالمة متابعة غداً.' },
  ],
  'win-customer/advance': [
    { route: '/crm/pipeline', target: nav('opportunities-kanban'), en: 'Move the opportunity to Qualified. The pipeline value updates.', ar: 'انقل الفرصة إلى "مؤهلة". تتحدث قيمة المسار.' },
  ],

  'buy-restock/supplier': [
    { route: '/suppliers', en: 'Add "Nakheel Farms" as a supplier.', ar: 'أضف "مزارع النخيل" كمورّد.' },
  ],
  'buy-restock/item': [
    { target: nav('nav-inventory'), en: 'Open Inventory.', ar: 'افتح المخزون.' },
    { route: '/inventory', target: nav('inventory-create-btn'), en: 'Create "Khalas dates 5 kg", tracked in stock, cost OMR 12, price OMR 18.', ar: 'أنشئ "تمر خلاص 5 كغ" بمخزون متتبَّع، التكلفة 12 ر.ع والسعر 18 ر.ع.' },
  ],
  'buy-restock/requisition': [
    { route: '/purchases/requisitions', en: 'Raise a requisition for 50 boxes, submit it, then approve it (you are the manager here).', ar: 'أنشئ طلب شراء لـ 50 علبة، قدّمه ثم اعتمده (أنت المدير هنا).' },
  ],
  'buy-restock/rfq': [
    { target: nav('nav-rfq'), en: 'Open RFQs.', ar: 'افتح طلبات عروض الأسعار.' },
    { route: '/purchases/rfq', target: nav('rfq-create'), en: 'Ask for quotes, add two supplier quotes, and award the better one.', ar: 'اطلب عروضاً، أضف عرضَي مورّدين، ورسِّ الأفضل.' },
  ],
  'buy-restock/receive': [
    { target: nav('nav-purchases'), en: 'Open Purchases.', ar: 'افتح المشتريات.' },
    { route: '/purchases', target: nav('purchases-table'), en: 'Approve the purchase order and receive the goods. Watch stock value rise.', ar: 'اعتمد أمر الشراء واستلم البضاعة. لاحظ ارتفاع قيمة المخزون.' },
  ],
  'buy-restock/bill': [
    { route: '/finance?tab=payables', target: nav('finance-tab-payables'), en: 'In Payables, approve the supplier bill. You now owe the supplier.', ar: 'في المستحقات، اعتمد فاتورة المورّد. أصبحت مديناً للمورّد.' },
  ],
  'buy-restock/pay-bill': [
    { route: '/finance?tab=payables', target: nav('finance-tab-payables'), en: 'Record the payment. Cash goes down, and so does what you owe.', ar: 'سجّل الدفعة. ينخفض النقد وتنخفض معه المديونية.' },
  ],

  'sell-get-paid/quote': [
    { target: nav('nav-sales'), en: 'Open Sales.', ar: 'افتح المبيعات.' },
    { route: '/sales', en: 'In Quotations, quote 20 boxes to Al Noor Hotel, send it, and mark it accepted.', ar: 'في عروض الأسعار، قدّم عرضاً لـ 20 علبة لفندق النور، أرسله، وعلّمه مقبولاً.' },
  ],
  'sell-get-paid/order': [
    { route: '/sales', en: 'Convert the accepted quotation into a sales order.', ar: 'حوّل العرض المقبول إلى أمر بيع.' },
  ],
  'sell-get-paid/deliver': [
    { route: '/sales', target: nav('sales-table'), en: 'Deliver the order. Stock goes down and its cost moves to cost of sales.', ar: 'سلّم الأمر. ينخفض المخزون وتنتقل تكلفته إلى تكلفة المبيعات.' },
  ],
  'sell-get-paid/invoice': [
    { route: '/finance?tab=invoices', target: nav('invoice-create-btn'), en: 'Invoice the order and send it. Revenue and VAT owed appear.', ar: 'أصدر فاتورة الأمر وأرسلها. تظهر الإيرادات والضريبة المستحقة.' },
  ],
  'sell-get-paid/part-paid': [
    { route: '/finance?tab=invoices', target: nav('invoice-table'), en: 'The hotel pays half. Record a part payment.', ar: 'دفع الفندق النصف. سجّل دفعة جزئية.' },
  ],
  'sell-get-paid/fully-paid': [
    { route: '/finance?tab=invoices', target: nav('invoice-table'), en: 'Now record the rest. The invoice turns Paid.', ar: 'سجّل الباقي الآن. تصبح الفاتورة مدفوعة.' },
  ],
  'sell-get-paid/credit': [
    { route: '/finance?tab=invoices', target: nav('invoice-table'), en: 'One box arrived damaged: issue a credit note from the invoice’s actions.', ar: 'وصلت علبة تالفة: أصدر إشعار دائن من إجراءات الفاتورة.' },
  ],

  'make/recipe': [
    { target: nav('nav-manufacturing'), en: 'Open Manufacturing.', ar: 'افتح التصنيع.' },
    { route: '/manufacturing', en: 'In Recipes, write "Gift box": 1 kg dates + 1 empty box makes 1 gift box.', ar: 'في الوصفات، اكتب "علبة هدية": 1 كغ تمر + علبة فارغة تصنع علبة هدية.' },
  ],
  'make/work-order': [
    { route: '/manufacturing', target: nav('mfg-create-wo'), en: 'Create a work order for the recipe and complete it.', ar: 'أنشئ أمر عمل للوصفة وأكمله.' },
  ],

  'run-books/expense': [
    { route: '/finance?tab=expenses', target: nav('finance-tab-expenses'), en: 'Record this month’s electricity: OMR 85.', ar: 'سجّل كهرباء الشهر: 85 ر.ع.' },
  ],
  'run-books/reverse': [
    { route: '/finance?tab=ledger', target: nav('coa-journal-btn'), en: 'Post a journal entry, then reverse it from the journal list.', ar: 'سجّل قيداً ثم اعكسه من قائمة اليومية.' },
  ],
  'run-books/budget': [
    { route: '/finance?tab=budgets', en: 'Set next year’s budget for a couple of expense accounts.', ar: 'ضع ميزانية العام القادم لحسابين من المصروفات.' },
  ],
  'run-books/vat': [
    { route: '/finance?tab=vat', en: 'Prepare a VAT return for this quarter.', ar: 'جهّز إقرار ضريبة القيمة المضافة لهذا الربع.' },
  ],
  'run-books/lock': [
    { route: '/settings', en: 'In finance settings, lock last month so nobody can change it.', ar: 'في إعدادات المالية، أقفل الشهر الماضي كي لا يغيّره أحد.' },
  ],

  'people-pay/employee': [
    { route: '/hr/employees', en: 'Add your storekeeper with a basic salary of OMR 400.', ar: 'أضف أمين المستودع براتب أساسي 400 ر.ع.' },
  ],
  'people-pay/attendance': [
    { route: '/hr/attendance', en: 'Mark today’s attendance.', ar: 'سجّل حضور اليوم.' },
  ],
  'people-pay/leave': [
    { route: '/hr/leave', en: 'Request a day of leave for them.', ar: 'قدّم طلب إجازة يوم لهم.' },
  ],
  'people-pay/payroll': [
    { target: nav('nav-payroll'), en: 'Open Payroll.', ar: 'افتح الرواتب.' },
    { route: '/hr/payroll', target: nav('payroll-run'), en: 'Run this month’s payroll, approve it, and pay it. Salary expense and cash move.', ar: 'شغّل رواتب الشهر واعتمدها وادفعها. يتحرك مصروف الرواتب والنقد.' },
  ],

  'campaigns/campaign': [
    { route: '/crm/campaigns', target: nav('campaigns-create'), en: 'Plan a campaign and add a deliverable (an Instagram reel).', ar: 'خطّط حملة وأضف مخرَجاً (ريل إنستغرام).' },
  ],
  'campaigns/rule': [
    { route: '/crm/commissions', en: 'Add a commission rule: 5% of revenue.', ar: 'أضف قاعدة عمولة: 5% من الإيراد.' },
  ],
  'campaigns/commission': [
    { route: '/crm/pipeline', en: 'Win an opportunity with an owner; their commission is calculated.', ar: 'اكسب فرصة لها مسؤول؛ تُحتسب عمولته.' },
  ],

  'run-company/details': [
    { route: '/company-profile', en: 'Fill in the company tax number. It prints on every document.', ar: 'أدخل الرقم الضريبي للشركة. يُطبع على كل مستند.' },
  ],
  'run-company/field': [
    { route: '/settings', en: 'Add a custom field you need, such as "Delivery zone" on contacts.', ar: 'أضف حقلاً مخصصاً تحتاجه، مثل "منطقة التوصيل" للجهات.' },
  ],
  'run-company/template': [
    { route: '/documents', en: 'Create a letter template.', ar: 'أنشئ قالب خطاب.' },
  ],

  'month-end/balanced': [
    { route: '/finance?tab=accounting', en: 'Open the trial balance and check that debits equal credits.', ar: 'افتح ميزان المراجعة وتحقق أن المدين يساوي الدائن.' },
  ],
  'month-end/no-overdue': [
    { route: '/finance?tab=invoices', target: nav('invoice-status-filter'), en: 'Filter overdue invoices and collect any that are left.', ar: 'صفِّ الفواتير المتأخرة واقبض المتبقي منها.' },
  ],
  'month-end/profit': [
    { route: '/finance?tab=reports', en: 'Check the profit and loss. If it is a loss, sell more than you spend.', ar: 'راجع الأرباح والخسائر. إن كانت خسارة، بِع أكثر مما تنفق.' },
  ],
};
