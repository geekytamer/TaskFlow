/**
 * "How this works" notes for Academy objectives, keyed `missionId/objectiveId`.
 * The dock shows the note for the step in progress; the Academy page keeps the
 * ones already met as a reference. Each note explains a rule of the system the
 * trainee would otherwise have to discover by accident: who can see what, what
 * a step does to the books, what can no longer be changed afterwards.
 * Keep them true to the code: when a rule changes, change its note.
 */
export interface Explainer {
  title: { en: string; ar: string };
  en: string;
  ar: string;
}

export const EXPLAINERS: Record<string, Explainer> = {
  'first-day/open-notifications': {
    title: { en: 'Notifications', ar: 'الإشعارات' },
    en: 'Assignments, approvals, overdue invoices and follow-up reminders arrive here. Some are also emailed; in a practice company nothing is ever emailed.',
    ar: 'تصلك هنا الإسنادات والموافقات والفواتير المتأخرة وتذكيرات المتابعة. بعضها يُرسل بالبريد أيضاً؛ أما في الشركة التدريبية فلا يُرسل شيء أبداً.',
  },
  'first-day/switch-language': {
    title: { en: 'One system, two languages', ar: 'نظام واحد بلغتين' },
    en: 'The language is yours alone; colleagues keep theirs. Records are not translated: a client named in English stays in English.',
    ar: 'اللغة خاصة بك وحدك؛ ويحتفظ زملاؤك بلغتهم. السجلات لا تُترجم: العميل المسجّل بالإنجليزية يبقى بالإنجليزية.',
  },

  'get-work-done/project': {
    title: { en: 'Who sees a project', ar: 'من يرى المشروع' },
    en: 'A Public project is visible to everyone in the company. A Private project is visible to its members only. Admins, Managers and Accountants see every project either way.',
    ar: 'المشروع العام يراه كل من في الشركة. المشروع الخاص يراه أعضاؤه فقط. المدير العام والمدير والمحاسب يرون كل المشاريع في الحالتين.',
  },
  'get-work-done/task': {
    title: { en: 'Who sees a task', ar: 'من يرى المهمة' },
    en: 'A task follows its project: if you can see the project, you see its tasks. You also always see tasks assigned to you, even in a project you are not part of.',
    ar: 'المهمة تتبع مشروعها: إن رأيت المشروع رأيت مهامه. وترى دائماً المهام المسندة إليك حتى لو لم تكن عضواً في مشروعها.',
  },
  'get-work-done/assign': {
    title: { en: 'Assigning', ar: 'الإسناد' },
    en: 'The people you assign are notified and the task appears in their Tasks list. A task can have several assignees.',
    ar: 'يُبلَّغ من تسند إليهم المهمة وتظهر في قائمة مهامهم. يمكن أن يكون للمهمة أكثر من مسؤول.',
  },
  'get-work-done/private': {
    title: { en: 'Private tasks', ar: 'المهام الخاصة' },
    en: 'A private task is seen only by the person who created it and its assignees. It overrides everything else: not even an Admin or Manager sees it in lists. Use it for personal items, not to hide company work.',
    ar: 'المهمة الخاصة لا يراها إلا منشئها والمسندة إليهم. وهي تتجاوز كل القواعد الأخرى: حتى المدير العام والمدير لا يرونها في القوائم. استخدمها للأمور الشخصية لا لإخفاء عمل الشركة.',
  },
  'get-work-done/time': {
    title: { en: 'Time is cost', ar: 'الوقت تكلفة' },
    en: 'Logged time is priced at your hourly cost rate. It shows what a project really cost, and billable time can be put on a client invoice.',
    ar: 'يُسعَّر الوقت المسجّل بتكلفة ساعتك. يبيّن كم كلّف المشروع فعلاً، ويمكن إضافة الوقت القابل للفوترة إلى فاتورة العميل.',
  },

  'win-customer/client': {
    title: { en: 'Contacts and their roles', ar: 'جهات الاتصال وأدوارها' },
    en: 'One contact can be a Lead, Client, Vendor, Influencer or Partner at once, so the same company is never typed twice. A Private contact is seen by its owner, Admins and Managers only.',
    ar: 'يمكن لجهة الاتصال أن تكون عميلاً محتملاً وعميلاً ومورّداً ومؤثراً وشريكاً معاً، فلا تُكتب الشركة نفسها مرتين. جهة الاتصال الخاصة يراها مالكها والمدير العام والمدير فقط.',
  },
  'win-customer/opportunity': {
    title: { en: 'Opportunities are forecasts', ar: 'الفرص توقعات' },
    en: 'An opportunity is a deal you hope to win: expected revenue × probability is your forecast. Nothing reaches the books until you invoice.',
    ar: 'الفرصة صفقة تأمل كسبها: الإيراد المتوقع × الاحتمال هو توقعك. لا يصل شيء إلى الدفاتر حتى تصدر الفاتورة.',
  },
  'win-customer/follow-up': {
    title: { en: 'Who sees your pipeline', ar: 'من يرى مسار مبيعاتك' },
    en: 'You see your own opportunities and follow-ups. Admins, Managers and Accountants see everyone’s, so the team can cover for you.',
    ar: 'ترى فرصك ومتابعاتك أنت. ويرى المدير العام والمدير والمحاسب ما للجميع، كي يغطي الفريق عنك عند الحاجة.',
  },

  'follow-through/snooze': {
    title: { en: 'Snoozing', ar: 'التأجيل' },
    en: 'A snoozed follow-up leaves today’s list and comes back by itself when the snooze ends.',
    ar: 'تخرج المتابعة المؤجلة من قائمة اليوم وتعود وحدها عند انتهاء التأجيل.',
  },

  'buy-restock/requisition': {
    title: { en: 'Ask before you buy', ar: 'اطلب قبل أن تشتري' },
    en: 'A requisition is a request, not a purchase: nothing is owed and no stock moves until a purchase order is placed and received.',
    ar: 'طلب الشراء الداخلي طلبٌ لا شراء: لا دين ولا حركة مخزون حتى يصدر أمر الشراء ويُستلم.',
  },
  'buy-restock/rfq': {
    title: { en: 'Quotes from suppliers', ar: 'عروض الموردين' },
    en: 'Ask several suppliers for prices and award the best. Once awarded, the requested items are fixed so the comparison stays honest.',
    ar: 'اطلب أسعاراً من عدة موردين وأرسِ على الأفضل. بعد الترسية تُثبَّت الأصناف المطلوبة كي تبقى المقارنة نزيهة.',
  },
  'buy-restock/receive': {
    title: { en: 'Receiving stock', ar: 'استلام المخزون' },
    en: 'Receiving adds the quantity to stock at its cost. Watch Stock rise in the impact panel.',
    ar: 'الاستلام يضيف الكمية إلى المخزون بتكلفتها. راقب ارتفاع المخزون في لوحة الأثر.',
  },
  'buy-restock/bill': {
    title: { en: 'What a supplier bill does', ar: 'ماذا تفعل فاتورة المورّد' },
    en: 'Approving the bill records what you owe the supplier and the VAT you can reclaim (input VAT). A draft bill changes nothing.',
    ar: 'اعتماد الفاتورة يسجّل ما تدين به للمورّد والضريبة التي يمكنك استردادها (ضريبة المدخلات). الفاتورة المسودة لا تغيّر شيئاً.',
  },
  'buy-restock/pay-bill': {
    title: { en: 'Paying', ar: 'الدفع' },
    en: 'Paying moves money out of the bank and clears what you owed. Profit does not change: the cost was already counted.',
    ar: 'الدفع يُخرج المال من البنك ويسدّد ما عليك. لا يتغير الربح: التكلفة احتُسبت سابقاً.',
  },

  'stock-control/lot': {
    title: { en: 'Batches and expiry', ar: 'الدفعات وتواريخ الانتهاء' },
    en: 'Each batch keeps its own expiry date. When you sell or use stock, the batch that expires first goes first (FEFO), and expiring batches are flagged on Inventory.',
    ar: 'لكل دفعة تاريخ انتهائها. عند البيع أو الاستخدام تخرج الدفعة الأقرب انتهاءً أولاً، وتُنبَّه الدفعات القريبة من الانتهاء في المخزون.',
  },
  'stock-control/count': {
    title: { en: 'Stock counts', ar: 'جرد المخزون' },
    en: 'Posting a count sets the system quantity to what you counted, and stock value follows the difference. A draft count changes nothing.',
    ar: 'ترحيل الجرد يجعل الكمية في النظام مساويةً لما عددته، وتتبع قيمة المخزون الفرق. الجرد المسودة لا يغيّر شيئاً.',
  },

  'match-bill/matching': {
    title: { en: 'Three-way match', ar: 'المطابقة الثلاثية' },
    en: 'Ordered, received and billed should agree. A bill for more than you received, or at a higher price than ordered, shows up here before you pay it.',
    ar: 'يجب أن يتطابق المطلوب والمستلَم والمفوتَر. الفاتورة بأكثر مما استلمت أو بسعر أعلى مما طلبت تظهر هنا قبل أن تدفعها.',
  },

  'sell-get-paid/quote': {
    title: { en: 'Quotations', ar: 'عروض الأسعار' },
    en: 'A quotation is an offer. It changes nothing in the books, even when accepted; it becomes a sales order.',
    ar: 'عرض السعر عرضٌ فقط. لا يغيّر شيئاً في الدفاتر ولو قُبل؛ بل يتحول إلى أمر بيع.',
  },
  'sell-get-paid/deliver': {
    title: { en: 'Delivering', ar: 'التسليم' },
    en: 'Delivering takes the goods out of stock. Stock value goes down by what they cost you.',
    ar: 'التسليم يُخرج البضاعة من المخزون. تنخفض قيمة المخزون بمقدار تكلفتها عليك.',
  },
  'sell-get-paid/invoice': {
    title: { en: 'What an invoice does', ar: 'ماذا تفعل الفاتورة' },
    en: 'Sending an invoice records revenue, the VAT you must pay over (output VAT), and what the client owes you. From then on it is locked: to change it, issue a credit note.',
    ar: 'إرسال الفاتورة يسجّل الإيراد والضريبة المستحقة عليك (ضريبة المخرجات) وما يدين لك به العميل. بعدها تُقفل: لتغييرها أصدر إشعاراً دائناً.',
  },
  'sell-get-paid/part-paid': {
    title: { en: 'Payments', ar: 'الدفعات' },
    en: 'A payment moves money into the bank and reduces what the client owes. Revenue does not change: it was counted when you invoiced.',
    ar: 'الدفعة تُدخل المال إلى البنك وتخفّض ما يدين به العميل. لا يتغير الإيراد: احتُسب عند الفوترة.',
  },
  'sell-get-paid/credit': {
    title: { en: 'Credit notes, not deletes', ar: 'إشعار دائن لا حذف' },
    en: 'A sent invoice is never deleted. A credit note reverses part or all of it: revenue, VAT and what the client owes all go down, and the history stays.',
    ar: 'الفاتورة المرسلة لا تُحذف أبداً. الإشعار الدائن يعكس جزءاً منها أو كلها: ينخفض الإيراد والضريبة وما يدين به العميل، ويبقى السجل.',
  },

  'credit-currency/limit': {
    title: { en: 'Credit limits', ar: 'سقف الائتمان' },
    en: 'The limit is the most a client may owe at once: unpaid invoices plus confirmed orders. Sending an invoice or confirming an order that goes past it is refused; Admins and Accountants can go ahead anyway, and are asked first.',
    ar: 'السقف هو أقصى ما يجوز أن يدين به العميل في وقت واحد: الفواتير غير المدفوعة والطلبات المؤكدة. يُرفض إرسال فاتورة أو تأكيد طلب يتجاوزه؛ ويمكن للمدير العام والمحاسب المتابعة رغم ذلك بعد سؤالهم.',
  },
  'credit-currency/fx': {
    title: { en: 'Other currencies', ar: 'العملات الأخرى' },
    en: 'The client sees the invoice in their currency. Your books record it in the company currency at the invoice’s exchange rate.',
    ar: 'يرى العميل الفاتورة بعملته. وتسجّلها دفاترك بعملة الشركة بسعر صرف الفاتورة.',
  },

  'make/work-order': {
    title: { en: 'Making turns stock into stock', ar: 'التصنيع يحوّل مخزوناً إلى مخزون' },
    en: 'Completing a work order uses up the ingredients and adds the finished goods at their combined cost. Total stock value barely moves; what you hold changes.',
    ar: 'إكمال أمر العمل يستهلك المكوّنات ويضيف المنتج النهائي بتكلفتها المجمّعة. لا تكاد قيمة المخزون الإجمالية تتغير؛ بل يتغير ما تملكه.',
  },

  'campaigns/influencer': {
    title: { en: 'Influencers are contacts', ar: 'المؤثرون جهات اتصال' },
    en: 'An influencer is a contact with the Influencer role. Their rates are pricing, which only Admins, Managers and Accountants can see.',
    ar: 'المؤثر جهة اتصال بدور مؤثر. أسعاره بيانات تسعير لا يراها إلا المدير العام والمدير والمحاسب.',
  },
  'campaigns/commission': {
    title: { en: 'Commissions', ar: 'العمولات' },
    en: 'When a deal with an owner is won, their commission is accrued: an expense now, owed to them until it is paid.',
    ar: 'عند كسب صفقة لها مسؤول تُستحق عمولته: مصروف الآن، ودين له حتى تُدفع.',
  },

  'documents/final': {
    title: { en: 'Final means final', ar: 'المعتمد نهائي' },
    en: 'A draft can be edited and reopened. A final document can no longer be changed, so what was sent is what stays on file.',
    ar: 'المسودة يمكن تعديلها وإعادة فتحها. المستند المعتمد لا يمكن تغييره، فيبقى في الملف ما أُرسل فعلاً.',
  },

  'run-books/expense': {
    title: { en: 'Expenses', ar: 'المصروفات' },
    en: 'An expense lowers profit straight away. Paid now, it lowers cash too.',
    ar: 'المصروف يخفّض الربح فوراً. وإن دُفع الآن خفّض النقد أيضاً.',
  },
  'run-books/reverse': {
    title: { en: 'Reverse, don’t delete', ar: 'اعكس ولا تحذف' },
    en: 'A posted journal entry is never edited or deleted. Reversing posts its exact opposite, so the mistake and its correction both stay visible to an auditor.',
    ar: 'القيد المرحّل لا يُعدّل ولا يُحذف. العكس يرحّل قيداً معاكساً تماماً، فيبقى الخطأ وتصحيحه ظاهرين للمدقق.',
  },
  'run-books/budget': {
    title: { en: 'Budgets', ar: 'الميزانيات' },
    en: 'A budget is a plan, not a posting. Reports compare it with what actually happened.',
    ar: 'الميزانية خطة لا قيد. تقارنها التقارير بما حدث فعلاً.',
  },

  'close-quarter/vat': {
    title: { en: 'VAT', ar: 'ضريبة القيمة المضافة' },
    en: 'You collect VAT on sales (output) and pay it on purchases (input). The return pays the difference to the tax authority, or claims it back.',
    ar: 'تحصّل الضريبة على المبيعات (مخرجات) وتدفعها على المشتريات (مدخلات). الإقرار يدفع الفرق للجهة الضريبية أو يطالب باسترداده.',
  },
  'close-quarter/lock': {
    title: { en: 'Locked periods', ar: 'الفترات المقفلة' },
    en: 'Nothing dated on or before the lock date can be posted or changed, by anyone. That keeps filed figures true.',
    ar: 'لا يمكن لأحد ترحيل أو تعديل أي شيء بتاريخ يسبق تاريخ القفل أو يساويه. هكذا تبقى الأرقام المُقدَّمة صحيحة.',
  },

  'people-pay/leave': {
    title: { en: 'Leave', ar: 'الإجازات' },
    en: 'A leave request waits for approval. Approved days come off the employee’s yearly allowance.',
    ar: 'طلب الإجازة ينتظر الموافقة. وتُخصم الأيام الموافق عليها من رصيد الموظف السنوي.',
  },
  'people-pay/payroll': {
    title: { en: 'Payroll', ar: 'الرواتب' },
    en: 'A draft run changes nothing. Approving it books the month’s net pay as salary expense and takes it out of the bank; marking it paid records that staff received it. A run only moves forward.',
    ar: 'مسودة الرواتب لا تغيّر شيئاً. اعتمادها يسجّل صافي رواتب الشهر مصروفاً ويُخرجه من البنك؛ ووسمها مدفوعة يسجّل أن الموظفين استلموها. ولا تعود المسيرة إلى الخلف.',
  },

  'run-company/field': {
    title: { en: 'Custom fields', ar: 'الحقول المخصصة' },
    en: 'A custom field appears on every record of that kind, for everyone in the company.',
    ar: 'يظهر الحقل المخصص في كل سجل من ذلك النوع، لكل من في الشركة.',
  },

  'look-around/whatsapp': {
    title: { en: 'Who sees a chat', ar: 'من يرى المحادثة' },
    en: 'Chats are shared by default. A private chat is seen by its owner, Admins and Managers only.',
    ar: 'المحادثات مشتركة افتراضياً. المحادثة الخاصة يراها مالكها والمدير العام والمدير فقط.',
  },

  'month-end/balanced': {
    title: { en: 'Why it always balances', ar: 'لماذا يتوازن دائماً' },
    en: 'Every step you took posted equal debits and credits. If the trial balance does not balance, something was entered outside the system’s rules.',
    ar: 'كل خطوة قمت بها رحّلت مديناً ودائناً متساويين. إن لم يتوازن ميزان المراجعة فهناك ما أُدخل خارج قواعد النظام.',
  },
};
