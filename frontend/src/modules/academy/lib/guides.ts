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
  'get-work-done/private': [
    { route: '/projects', target: nav('projects-tasks-table'), en: 'Add a personal task such as "Renew my visa" and tick Private.', ar: 'أضف مهمة شخصية مثل "تجديد تأشيرتي" وفعّل خيار خاص.' },
  ],
  'get-work-done/time': [
    { route: '/projects', target: nav('projects-tasks-table'), en: 'In the task, under Time tracking, log the hours you spent (try 0.75 for 45 minutes).', ar: 'في المهمة، ضمن تتبّع الوقت، سجّل الساعات التي قضيتها (جرّب 0.75 أي 45 دقيقة).' },
  ],
  'get-work-done/done': [
    { route: '/projects', target: nav('projects-tasks-table'), en: 'Set the task to Done. Billable time can now be invoiced.', ar: 'اجعل المهمة منجزة. يمكن الآن فوترة الوقت.' },
  ],

  'win-customer/client': [
    { target: nav('nav-contacts'), en: 'Open Contacts.', ar: 'افتح جهات الاتصال.' },
    { route: '/contacts', target: nav('contacts-create'), en: 'Add "Al Noor Hotel" as a contact with the Client role.', ar: 'أضف "فندق النور" كجهة اتصال بدور عميل.' },
  ],
  'win-customer/opportunity': [
    { target: nav('nav-opportunities'), en: 'Open Opportunities.', ar: 'افتح الفرص.' },
    { route: '/crm/opportunities', target: nav('pipeline-create-opp'), en: 'Create an opportunity: "Iftar dates for Al Noor Hotel", expected OMR 1,200.', ar: 'أنشئ فرصة: "تمور الإفطار لفندق النور"، بقيمة متوقعة 1,200 ر.ع.' },
  ],
  'win-customer/follow-up': [
    { target: nav('nav-followups'), en: 'Open Follow-ups.', ar: 'افتح المتابعات.' },
    { route: '/crm/followups', en: 'Press New follow-up: call Al Noor Hotel tomorrow about the dates.', ar: 'اضغط "متابعة جديدة": اتصل بفندق النور غداً بخصوص التمور.' },
  ],
  'win-customer/advance': [
    { route: '/crm/opportunities', target: nav('opportunities-kanban'), en: 'Move the opportunity to Qualified. The pipeline value updates.', ar: 'انقل الفرصة إلى "مؤهلة". تتحدث قيمة المسار.' },
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
    { route: '/purchases/rfq', target: nav('rfq-create'), en: 'Add a second supplier, then ask for quotes. Name the line exactly like your stock item (Khalas dates 5 kg), add both quotes, award the better one and create the purchase order.', ar: 'أضف مورّداً ثانياً، ثم اطلب عروض الأسعار. سمِّ البند باسم صنف المخزون نفسه (تمر خلاص 5 كغ)، وأضف العرضين، وامنح الأفضل، وأنشئ أمر الشراء.' },
  ],
  'buy-restock/receive': [
    { target: nav('nav-purchases'), en: 'Open Purchases.', ar: 'افتح المشتريات.' },
    { route: '/purchases', target: nav('purchases-table'), en: 'Place the order, then Receive it. Watch stock value rise.', ar: 'اضغط "تقديم الطلب" ثم استلمه. راقب ارتفاع قيمة المخزون.' },
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
  'sell-get-paid/credit': [
    { route: '/finance?tab=invoices', target: nav('invoice-table'), en: 'One box arrived damaged: preview the invoice and issue a credit note for one box (OMR 18).', ar: 'وصلت علبة تالفة: افتح معاينة الفاتورة وأصدر إشعار دائن لعلبة واحدة (18 ر.ع).' },
  ],
  'sell-get-paid/fully-paid': [
    { route: '/finance?tab=invoices', target: nav('invoice-table'), en: 'Now record what is left after the credit. The invoice turns Paid.', ar: 'سجّل ما تبقّى بعد الإشعار الدائن. تصبح الفاتورة مدفوعة.' },
  ],

  'make/recipe': [
    { route: '/inventory', target: nav('inventory-create-btn'), en: 'First add two stock items: "Empty gift box" with 30 on hand at OMR 1, and "Dates gift box" with a sale price of OMR 25.', ar: 'أضف أولاً صنفين: "علبة هدايا فارغة" برصيد 30 بسعر تكلفة 1 ر.ع، و"علبة تمر هدية" بسعر بيع 25 ر.ع.' },
    { target: nav('nav-manufacturing'), en: 'Open Manufacturing.', ar: 'افتح التصنيع.' },
    { route: '/manufacturing', en: 'In Recipes, write "Gift box": it produces 1 Dates gift box from 1 Khalas dates box + 1 Empty gift box.', ar: 'في الوصفات، اكتب "علبة هدية": تُنتج علبة تمر هدية واحدة من علبة تمر خلاص + علبة هدايا فارغة.' },
  ],
  'make/work-order': [
    { route: '/manufacturing', target: nav('mfg-create-wo'), en: 'Create a work order for the recipe, then Complete it and enter how many you made.', ar: 'أنشئ أمر عمل للوصفة وأكمله.' },
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
    { route: '/crm/opportunities', en: 'Create a new opportunity and move it all the way to Won. The rule turns its value into your commission.', ar: 'أنشئ فرصة جديدة وانقلها حتى "مكسوبة". تحوّل القاعدة قيمتها إلى عمولتك.' },
  ],

  'run-company/details': [
    { route: '/company-profile', en: 'Fill in the company VAT Number. It prints on every document.', ar: 'أدخل رقم ضريبة القيمة المضافة للشركة. يُطبع على كل مستند.' },
  ],
  'run-company/field': [
    { route: '/settings', en: 'Add a custom field you need, such as "Delivery zone" on contacts.', ar: 'أضف حقلاً مخصصاً تحتاجه، مثل "منطقة التوصيل" للجهات.' },
  ],

  'follow-through/complete': [
    { target: nav('nav-followups'), en: 'Open Follow-ups.', ar: 'افتح المتابعات.' },
    { route: '/crm/followups', en: 'Complete the follow-up you planned for Al Noor Hotel and note how it went.', ar: 'أكمل المتابعة التي خطّطتها لفندق النور ودوّن نتيجتها.' },
  ],
  'follow-through/snooze': [
    { route: '/crm/followups', en: 'Plan another follow-up, then snooze it to next week.', ar: 'خطّط متابعة أخرى ثم أجّلها إلى الأسبوع القادم.' },
  ],

  'stock-control/warehouse': [
    { target: nav('nav-inventory'), en: 'Open Inventory.', ar: 'افتح المخزون.' },
    { route: '/inventory', target: nav('inventory-warehouses'), en: 'Add a warehouse called "Cold store".', ar: 'أضف مستودعاً باسم "المخزن المبرّد".' },
  ],
  'stock-control/lot': [
    { target: nav('nav-purchases'), en: 'Open Purchases.', ar: 'افتح المشتريات.' },
    { route: '/purchases', target: nav('purchases-table'), en: 'Order more dates and, when you receive them, enter a batch number and an expiry date.', ar: 'اطلب مزيداً من التمور، وعند استلامها أدخل رقم الدفعة وتاريخ الانتهاء.' },
  ],
  'stock-control/count': [
    { target: nav('nav-stock-counts'), en: 'Open Stock counts.', ar: 'افتح جرد المخزون.' },
    { route: '/inventory/counts', target: nav('count-create'), en: 'Count the shelf, enter what you found and post it. Any difference moves stock value.', ar: 'اعدد الرف وأدخل ما وجدته ثم رحّله. أي فرق يحرّك قيمة المخزون.' },
  ],

  'match-bill/linked': [
    { route: '/purchases', target: nav('purchases-table'), en: 'From a received purchase order, create the supplier bill and approve it.', ar: 'من أمر شراء مستلَم، أنشئ فاتورة المورّد واعتمدها.' },
  ],
  'match-bill/matching': [
    { target: nav('nav-matching'), en: 'Open Bill matching: ordered, received and billed side by side.', ar: 'افتح مطابقة الفواتير: المطلوب والمستلَم والمفوتَر جنباً إلى جنب.' },
  ],

  'credit-currency/fx': [
    { route: '/finance?tab=invoices', target: nav('invoice-create-btn'), en: 'Create an invoice, type AED as its currency and the rate (1 AED = 0.105 OMR), then send it. The books still record it in OMR.', ar: 'أنشئ فاتورة، واكتب AED عملةً لها مع السعر (1 درهم = 0.105 ر.ع)، ثم أرسلها. تبقى الدفاتر مسجّلة بالريال.' },
  ],

  'documents/template': [
    { target: nav('nav-documents'), en: 'Open Documents.', ar: 'افتح المستندات.' },
    { route: '/documents?tab=templates', en: 'Under "What are you designing?" choose Business letter, press New Template, name it and save.', ar: 'من "ماذا تصمم؟" اختر رسالة عمل، ثم اضغط قالب جديد، وسمّه واحفظه.' },
  ],
  'documents/document': [
    { route: '/documents', en: 'Write a letter to Al Noor Hotel from the template.', ar: 'اكتب خطاباً لفندق النور من القالب.' },
  ],
  'documents/final': [
    { route: '/documents', en: 'Finalize the letter. A final letter can no longer be edited.', ar: 'اعتمد الخطاب نهائياً. لا يمكن تعديل الخطاب المعتمد.' },
  ],

  'close-quarter/vat': [
    { route: '/finance?tab=vat', en: 'Review this quarter: output VAT on sales minus input VAT on purchases. Then file the return; what you owe the tax authority is now on the books.', ar: 'راجع الربع: ضريبة المبيعات ناقص ضريبة المشتريات. ثم قدّم الإقرار؛ صار المستحق للجهة الضريبية في الدفاتر.' },
  ],
  'close-quarter/lock': [
    { route: '/settings', en: 'In Settings, Finance Controls: set Locked Through Date to the last day of the quarter that has ended (not today, or new work would be blocked), then Save Finance Controls.', ar: 'في الإعدادات، ضوابط المالية: اجعل "مقفل حتى تاريخ" آخر يوم في الربع المنتهي (لا اليوم، وإلا مُنع العمل الجديد)، ثم احفظ ضوابط المالية.' },
  ],

  'campaigns/influencer': [
    { target: nav('nav-contacts'), en: 'Open Contacts.', ar: 'افتح جهات الاتصال.' },
    { route: '/contacts', en: 'Add an influencer: a new contact with the Influencer role.', ar: 'أضف مؤثراً: جهة اتصال جديدة بدور مؤثر.' },
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
