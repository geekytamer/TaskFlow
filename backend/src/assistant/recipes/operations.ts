import type { Recipe, RecipeContext } from './types';
import { addDays, argsOf, co, dateArg, dayOf, norm, oneOf, pickOne, round, sameName, say } from './util';
import { listTasks } from './tasks';

/**
 * The wider day-to-day work: projects, quotations, money going out (supplier
 * bills, purchase orders, expenses), people, follow-ups, approvals, task
 * comments and sending an invoice. Every call goes through the API as the
 * person; changes only propose.
 */

const nameMatches = (want: string, raw: unknown, label: string) => norm(label).includes(want) || sameName(String(raw ?? ''), label);

// ── projects ────────────────────────────────────────────────────────────────

interface ProjectRow { id: string; name: string; status?: string; priority?: string; clientId?: string; endDate?: string | null }
interface TaskRow { id: string; title: string; status: string; projectId?: string; dueDate?: string | null }

export const projects: Recipe = {
  name: 'projects',
  params: ['status', 'search'],
  needs: [['GET', '/projects'], ['GET', '/tasks']],
  signature: "projects({ status?: 'open'|'all'|'Planning'|'Active'|'On Hold'|'Done', search?: words })",
  returns: 'projects [{ id, name, status, priority, client, endDate, late, openTasks, overdueTasks }]; open (not Done or Archived) by default',
  example: "const late = (await tf.projects()).filter((p) => p.late); await show(late); return { late: late.length };",
  words: ['project', 'projects', 'progress', 'late', 'deadline', 'campaign', 'work'],
  async run(ctx, args) {
    const a = argsOf(args);
    const status = String(a.status ?? 'open');
    const want = norm(a.search ?? a.text);
    const [all, tasks] = await Promise.all([
      ctx.get<Array<ProjectRow & { companyId?: string }>>(`/projects?companyId=${encodeURIComponent(ctx.companyId)}`),
      listTasks(ctx) as Promise<TaskRow[]>,
    ]);
    // Like tasks, the project list may answer for more than this company.
    const list = all.filter((p) => !p.companyId || p.companyId === ctx.companyId);
    return list
      .filter((p) => status === 'all' || (status === 'open' ? !['Done', 'Archived'].includes(p.status ?? 'Active') : (p.status ?? 'Active').toLowerCase() === status.toLowerCase()))
      .filter((p) => !want || nameMatches(want, a.search ?? a.text, p.name))
      .map((p) => {
        const mine = tasks.filter((t) => t.projectId === p.id && t.status !== 'Done');
        const end = dayOf(p.endDate);
        return {
          id: p.id, name: p.name, status: p.status ?? 'Active', priority: p.priority ?? 'Medium',
          ...(p.clientId && ctx.names.client(p.clientId) ? { client: ctx.names.client(p.clientId) } : {}),
          ...(end ? { endDate: end } : {}),
          late: Boolean(end && end < ctx.today && !['Done', 'Archived'].includes(p.status ?? 'Active')),
          openTasks: mine.length,
          overdueTasks: mine.filter((t) => (dayOf(t.dueDate) ?? '9999') < ctx.today).length,
        };
      });
  },
};

// ── quotations ──────────────────────────────────────────────────────────────

interface QuoteRow { id: string; quoteNumber: string; clientId: string; status: string; totalAmount: number; currency?: string; issueDate?: string; validUntil?: string }
const QUOTE_STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'] as const;

export const quotations: Recipe = {
  name: 'quotations',
  params: ['status', 'client', 'text'],
  needs: [['GET', '/companies/:companyId/quotations']],
  signature: "quotations({ status?: 'open'|'all'|'Draft'|'Sent'|'Accepted'|'Declined'|'Expired', client?: name })",
  returns: 'quotations [{ id, quoteNumber, client, status, total, currency, issueDate, validUntil, expiringSoon }]; open (Draft or Sent) by default, newest first',
  example: "const open = await tf.quotations({ status: 'Sent' }); await show(open); return { waiting: open.length };",
  words: ['quotation', 'quotations', 'quote', 'quotes', 'offer', 'proposal', 'estimate'],
  async run(ctx, args) {
    const a = argsOf(args);
    const status = String(a.status ?? 'open');
    const want = norm(a.client ?? a.text);
    return (await ctx.get<QuoteRow[]>(co(ctx, '/quotations')))
      .map((q) => ({
        id: q.id, quoteNumber: q.quoteNumber, client: ctx.names.client(q.clientId) ?? q.clientId, status: q.status,
        total: round(Number(q.totalAmount)), currency: q.currency ?? ctx.currency, issueDate: dayOf(q.issueDate), validUntil: dayOf(q.validUntil),
        expiringSoon: ['Draft', 'Sent'].includes(q.status) && (dayOf(q.validUntil) ?? '9999') <= addDays(ctx.today, 7),
      }))
      .filter((q) => status === 'all' || (status === 'open' ? ['Draft', 'Sent'].includes(q.status) : q.status.toLowerCase() === status.toLowerCase()))
      .filter((q) => !want || nameMatches(want, a.client ?? a.text, q.client))
      .sort((x, y) => (y.issueDate ?? '').localeCompare(x.issueDate ?? ''));
  },
};

export const createQuote: Recipe = {
  name: 'createQuote',
  params: ['client', 'lines', 'validUntil', 'notes'],
  needs: [['GET', '/companies/:companyId/clients'], ['POST', '/companies/:companyId/quotations']],
  signature: "createQuote({ client: name, lines: [{ description, quantity, price }], validUntil?: 'YYYY-MM-DD', notes? })",
  returns: 'one proposal for a draft quotation to that client (prices in the company currency)',
  example: "return await tf.createQuote({ client: 'Gulf Star Trading', lines: [{ description: 'Social media month', quantity: 1, price: 450 }] });",
  words: ['quote', 'quotation', 'offer', 'price', 'estimate', 'create', 'send'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const clients = await ctx.get<Array<{ id: string; name: string }>>(co(ctx, '/clients'));
    const client = pickOne(clients, a.client, (c) => c.name, 'client');
    const lines = Array.isArray(a.lines) ? a.lines : [];
    if (!lines.length) throw new Error('a quotation needs lines: [{ description, quantity, price }]');
    const items = lines.map((raw, i) => {
      const l = argsOf(raw);
      const quantity = Number(l.quantity ?? 1);
      const unitPrice = Number(l.price ?? l.unitPrice);
      const description = String(l.description ?? '').trim();
      if (description.length < 2) throw new Error(`lines[${i}] needs a description`);
      if (!(quantity > 0) || !(unitPrice >= 0)) throw new Error(`lines[${i}] needs a quantity above 0 and a price`);
      return { description, quantity, unitPrice };
    });
    const validUntil = dateArg(ctx, a.validUntil, 'validUntil') ?? addDays(ctx.today, 30);
    const total = round(items.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    return ctx.propose('POST', co(ctx, '/quotations'), { clientId: client.id, items, validUntil, ...(a.notes ? { notes: String(a.notes) } : {}) },
      say(ctx, `Draft a quotation for ${client.name}: ${items.length} line(s), ${total} ${ctx.currency} before VAT`, `مسودة عرض سعر لـ ${client.name}: ${items.length} بند، ${total} ${ctx.currency} قبل الضريبة`));
  },
};

// ── money going out ─────────────────────────────────────────────────────────

interface BillRow { id: string; billNumber: string; vendorName: string; amount: number; status: string; dueDate?: string; outstandingAmount?: number; paidAmount?: number }

export const payables: Recipe = {
  name: 'payables',
  params: ['status', 'supplier', 'text'],
  needs: [['GET', '/companies/:companyId/finance/vendor-bills']],
  signature: "payables({ status?: 'unpaid'|'overdue'|'all', supplier?: name })",
  returns: '{ currency, owed, overdue, bills: [{ id, billNumber, supplier, amount, outstanding, dueDate, overdue }] } — what the company owes its suppliers; unpaid by default, oldest due first',
  example: "const p = await tf.payables({ status: 'overdue' }); await show(p.bills); return { overdue: p.overdue, currency: p.currency };",
  words: ['payable', 'payables', 'bill', 'bills', 'supplier', 'suppliers', 'vendor', 'owe', 'pay', 'due'],
  async run(ctx, args) {
    const a = argsOf(args);
    const status = String(a.status ?? 'unpaid');
    if (!['unpaid', 'overdue', 'all'].includes(status)) throw new Error("status must be 'unpaid', 'overdue' or 'all'");
    const want = norm(a.supplier ?? a.text);
    const bills = (await ctx.get<BillRow[]>(co(ctx, '/finance/vendor-bills')))
      .filter((b) => b.status !== 'Draft')
      .map((b) => {
        const outstanding = round(b.status === 'Paid' ? 0 : Number(b.outstandingAmount ?? Number(b.amount) - Number(b.paidAmount ?? 0)));
        const due = dayOf(b.dueDate);
        return { id: b.id, billNumber: b.billNumber, supplier: b.vendorName, amount: round(Number(b.amount)), outstanding, dueDate: due, overdue: outstanding > 0 && (due ?? '9999') < ctx.today };
      })
      .filter((b) => !want || nameMatches(want, a.supplier ?? a.text, b.supplier))
      .filter((b) => status === 'all' || (status === 'overdue' ? b.overdue : b.outstanding > 0))
      .sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
    return {
      currency: ctx.currency,
      owed: round(bills.reduce((s, b) => s + b.outstanding, 0)),
      overdue: round(bills.filter((b) => b.overdue).reduce((s, b) => s + b.outstanding, 0)),
      bills,
    };
  },
};

interface PoRow { id: string; orderNumber: string; supplierName: string; status: string; totalAmount: number; orderDate?: string; expectedDate?: string; approvalStatus?: string }

export const purchaseOrders: Recipe = {
  name: 'purchaseOrders',
  params: ['status', 'supplier', 'text'],
  needs: [['GET', '/companies/:companyId/purchase-orders']],
  signature: "purchaseOrders({ status?: 'open'|'all'|'Draft'|'Ordered'|'Received', supplier?: name })",
  returns: 'purchase orders [{ id, orderNumber, supplier, status, total, orderDate, expectedDate, approval }]; open (not received or cancelled) by default',
  example: "const open = await tf.purchaseOrders(); await show(open); return { open: open.length };",
  words: ['purchase', 'order', 'orders', 'po', 'buy', 'supplier', 'procurement', 'receive'],
  async run(ctx, args) {
    const a = argsOf(args);
    const status = String(a.status ?? 'open');
    const want = norm(a.supplier ?? a.text);
    return (await ctx.get<PoRow[]>(co(ctx, '/purchase-orders')))
      .map((p) => ({ id: p.id, orderNumber: p.orderNumber, supplier: p.supplierName, status: p.status, total: round(Number(p.totalAmount)), orderDate: dayOf(p.orderDate), expectedDate: dayOf(p.expectedDate), ...(p.approvalStatus ? { approval: p.approvalStatus } : {}) }))
      .filter((p) => status === 'all' || (status === 'open' ? !['Received', 'Cancelled', 'Closed'].includes(p.status) : p.status.toLowerCase() === status.toLowerCase()))
      .filter((p) => !want || nameMatches(want, a.supplier ?? a.text, p.supplier))
      .sort((x, y) => (y.orderDate ?? '').localeCompare(x.orderDate ?? ''));
  },
};

interface ExpenseRow { id: string; expenseDate?: string; category: string; vendor?: string; amount: number; description?: string; approvalStatus?: string }

export const expenses: Recipe = {
  name: 'expenses',
  params: ['from', 'to', 'category'],
  needs: [['GET', '/companies/:companyId/expenses']],
  signature: "expenses({ from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', category? })",
  returns: '{ currency, total, byCategory: [{ category, total }], expenses: [{ id, date, category, vendor, amount, description }] } for the period (this month by default)',
  example: "const e = await tf.expenses(); return { total: e.total, currency: e.currency, top: e.byCategory[0] };",
  words: ['expense', 'expenses', 'spend', 'spent', 'cost', 'costs', 'spending'],
  async run(ctx, args) {
    const a = argsOf(args);
    const from = dateArg(ctx, a.from, 'from') ?? `${ctx.today.slice(0, 8)}01`;
    const to = dateArg(ctx, a.to, 'to') ?? ctx.today;
    const want = norm(a.category ?? a.text);
    const rows = (await ctx.get<ExpenseRow[]>(co(ctx, '/expenses')))
      .map((e) => ({ id: e.id, date: dayOf(e.expenseDate), category: e.category, ...(e.vendor ? { vendor: e.vendor } : {}), amount: round(Number(e.amount)), ...(e.description ? { description: e.description } : {}) }))
      .filter((e) => (e.date ?? '') >= from && (e.date ?? '') <= to)
      .filter((e) => !want || norm(e.category).includes(want));
    const byCategory = new Map<string, number>();
    for (const e of rows) byCategory.set(e.category, round((byCategory.get(e.category) ?? 0) + e.amount));
    return {
      from, to, currency: ctx.currency, total: round(rows.reduce((s, e) => s + e.amount, 0)),
      byCategory: [...byCategory.entries()].map(([category, total]) => ({ category, total })).sort((x, y) => y.total - x.total),
      expenses: rows.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '')),
    };
  },
};

export const createExpense: Recipe = {
  name: 'createExpense',
  params: ['amount', 'category', 'date', 'vendor', 'description', 'paymentMethod'],
  needs: [['POST', '/companies/:companyId/expenses']],
  signature: "createExpense({ amount, category, date?: 'YYYY-MM-DD'|'today', vendor?, description?, paymentMethod? })",
  returns: 'one proposal recording the expense (it may go for approval)',
  example: "return await tf.createExpense({ amount: 12.5, category: 'Fuel', vendor: 'Shell', date: 'today' });",
  words: ['expense', 'spent', 'paid', 'receipt', 'record', 'fuel', 'travel', 'cost'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const amount = Number(a.amount);
    if (!(amount > 0)) throw new Error('amount must be a positive number');
    const category = String(a.category ?? '').trim();
    if (!category) throw new Error('an expense needs a category (Fuel, Travel, Office…)');
    const expenseDate = dateArg(ctx, a.date ?? 'today', 'date');
    const body = { amount, category, expenseDate, ...(a.vendor ? { vendor: String(a.vendor) } : {}), ...(a.description ? { description: String(a.description) } : {}), ...(a.paymentMethod ? { paymentMethod: String(a.paymentMethod) } : {}) };
    return ctx.propose('POST', co(ctx, '/expenses'), body,
      say(ctx, `Record an expense: ${amount} ${ctx.currency}, ${category}${a.vendor ? ` (${String(a.vendor)})` : ''}, ${expenseDate}`, `تسجيل مصروف: ${amount} ${ctx.currency}، ${category}${a.vendor ? ` (${String(a.vendor)})` : ''}، ${expenseDate}`));
  },
};

// ── people and follow-ups ───────────────────────────────────────────────────

export const employees: Recipe = {
  name: 'employees',
  params: ['search', 'text'],
  needs: [['GET', '/companies/:companyId/employees']],
  signature: 'employees({ search?: name or job title })',
  returns: 'employees [{ id, name, jobTitle, email, phone, status }] (pay is never shown here)',
  example: "const team = await tf.employees({ search: 'designer' }); await show(team); return { count: team.length };",
  words: ['employee', 'employees', 'staff', 'team', 'people', 'hr', 'who'],
  async run(ctx, args) {
    const a = argsOf(args);
    const want = norm(a.search ?? a.text);
    return (await ctx.get<Array<{ id: string; name: string; jobTitle?: string; email?: string; phone?: string; status?: string }>>(co(ctx, '/employees')))
      .filter((e) => !want || nameMatches(want, a.search ?? a.text, e.name) || norm(e.jobTitle ?? '').includes(want))
      .map((e) => ({ id: e.id, name: e.name, ...(e.jobTitle ? { jobTitle: e.jobTitle } : {}), ...(e.email ? { email: e.email } : {}), ...(e.phone ? { phone: e.phone } : {}), status: e.status ?? 'Active' }));
  },
};

interface FollowupRow { id: string; title?: string; type?: string; status: string; dueAt?: string; ownerUserId?: string; ownerName?: string; entityType?: string; entityId?: string }

export const followups: Recipe = {
  name: 'followups',
  params: ['due', 'everyone'],
  needs: [['GET', '/companies/:companyId/followups']],
  signature: "followups({ due?: 'overdue'|'today'|'week'|'all', everyone?: true })",
  returns: "open follow-ups [{ id, title, dueDate, owner, overdue }]: the person's own unless everyone: true; overdue and today first",
  example: "const late = await tf.followups({ due: 'overdue' }); await show(late); return { overdue: late.length };",
  words: ['followup', 'followups', 'follow', 'call', 'calls', 'reminder', 'crm', 'lead'],
  async run(ctx, args) {
    const a = argsOf(args);
    const due = String(a.due ?? 'all');
    if (!['overdue', 'today', 'week', 'all'].includes(due)) throw new Error("due must be 'overdue', 'today', 'week' or 'all'");
    const weekEnd = addDays(ctx.today, 7);
    return (await ctx.get<FollowupRow[]>(co(ctx, '/followups?limit=200')))
      .filter((f) => f.status === 'open' || f.status === 'snoozed')
      .filter((f) => a.everyone === true || f.ownerUserId === ctx.userId)
      .map((f) => {
        const day = dayOf(f.dueAt);
        return { id: f.id, title: f.title ?? f.type ?? 'Follow-up', ...(day ? { dueDate: day } : {}), owner: f.ownerName ?? (f.ownerUserId ? ctx.names.user(f.ownerUserId) : undefined), overdue: Boolean(day && day < ctx.today) };
      })
      .filter((f) => due === 'all' || (due === 'overdue' ? f.overdue : due === 'today' ? f.dueDate === ctx.today : Boolean(f.dueDate && f.dueDate >= ctx.today && f.dueDate <= weekEnd)))
      .sort((x, y) => (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'));
  },
};

const OUTCOMES = ['done', 'connected', 'no_answer', 'left_voicemail', 'busy', 'booked_meeting', 'not_interested', 'sent', 'replied'] as const;

export const completeFollowup: Recipe = {
  name: 'completeFollowup',
  params: ['followup', 'text', 'outcome', 'note'],
  needs: [['GET', '/companies/:companyId/followups'], ['POST', '/followups/:id/complete']],
  signature: "completeFollowup({ followup: title|id, outcome?: 'done'|'connected'|'no_answer'|'booked_meeting'|'not_interested'|..., note? })",
  returns: 'one proposal marking that follow-up done, with its outcome',
  example: "return await tf.completeFollowup({ followup: 'Call Salim about the renewal', outcome: 'connected', note: 'He will sign next week' });",
  words: ['followup', 'follow', 'done', 'complete', 'called', 'finished', 'outcome'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const open = (await ctx.get<FollowupRow[]>(co(ctx, '/followups?limit=200'))).filter((f) => f.status === 'open' || f.status === 'snoozed');
    const f = pickOne(open.map((x) => ({ ...x, label: x.title ?? x.type ?? x.id })), a.followup ?? a.text, (x) => x.label, 'follow-up');
    const outcome = oneOf(a.outcome, OUTCOMES, 'outcome') ?? 'done';
    return ctx.propose('POST', `/followups/${encodeURIComponent(f.id)}/complete`, { outcome, ...(a.note ? { outcomeNote: String(a.note) } : {}) },
      say(ctx, `Mark the follow-up done: ${f.label} (${outcome})`, `إنهاء المتابعة: ${f.label} (${outcome})`));
  },
};

// ── tasks, approvals, invoices ──────────────────────────────────────────────

export const addComment: Recipe = {
  name: 'addComment',
  params: ['task', 'text', 'comment'],
  needs: [['GET', '/tasks'], ['POST', '/tasks/:taskId/comments']],
  signature: 'addComment({ task: title|id, comment })',
  returns: 'one proposal adding the comment to that task',
  example: "return await tf.addComment({ task: 'Design the menu', comment: 'The client approved the colours.' });",
  words: ['comment', 'note', 'update', 'task', 'write', 'add'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const comment = String(a.comment ?? '').trim();
    if (!comment) throw new Error('say what the comment is: { task, comment }');
    const t = pickOne(await listTasks(ctx), a.task ?? a.text, (x) => x.title, 'task');
    return ctx.propose('POST', `/tasks/${encodeURIComponent(t.id)}/comments`, { content: comment },
      say(ctx, `Comment on "${t.title}": ${comment.slice(0, 80)}`, `تعليق على "${t.title}": ${comment.slice(0, 80)}`));
  },
};

export const decideApproval: Recipe = {
  name: 'decideApproval',
  params: ['item', 'text', 'decision', 'note'],
  needs: [['GET', '/companies/:companyId/approvals'], ['POST', '/approvals/:docType/:docId/decision']],
  signature: "decideApproval({ item: document number|id, decision: 'approve'|'reject'|'send_back', note? })",
  returns: "one proposal deciding that approval as the person (only items waiting for them; a reject or send-back should carry a note)",
  example: "return await tf.decideApproval({ item: 'PO-0012', decision: 'approve' });",
  words: ['approve', 'approval', 'reject', 'decline', 'sign', 'decide', 'send', 'back'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const decision = oneOf(a.decision, ['approve', 'reject', 'send_back'], 'decision');
    if (!decision) throw new Error("say the decision: 'approve', 'reject' or 'send_back'");
    const waiting = await ctx.get<Array<{ docType: string; docId: string; number: string; amount?: number; party?: string | null }>>(co(ctx, '/approvals'));
    const item = pickOne(waiting.map((w) => ({ ...w, id: w.docId })), a.item ?? a.text, (w) => w.number, 'approval waiting for this person');
    const word = { approve: ['Approve', 'اعتماد'], reject: ['Reject', 'رفض'], send_back: ['Send back', 'إرجاع'] }[decision as 'approve' | 'reject' | 'send_back'];
    return ctx.propose('POST', `/approvals/${encodeURIComponent(item.docType)}/${encodeURIComponent(item.docId)}/decision`, { decision, ...(a.note ? { note: String(a.note) } : {}) },
      say(ctx, `${word[0]} ${item.number}${item.party ? ` (${item.party})` : ''}`, `${word[1]} ${item.number}${item.party ? ` (${item.party})` : ''}`));
  },
};

export const emailInvoice: Recipe = {
  name: 'emailInvoice',
  params: ['invoice', 'text'],
  needs: [['GET', '/companies/:companyId/invoices'], ['POST', '/invoices/:id/email']],
  signature: 'emailInvoice({ invoice: invoice number|id })',
  returns: "one proposal that EMAILS the invoice to the client (outward: the person sees who receives it before confirming)",
  example: "return await tf.emailInvoice({ invoice: 'INV-0042' });",
  words: ['email', 'send', 'invoice', 'mail', 'remind', 'client'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const list = await ctx.get<Array<{ id: string; invoiceNumber: string; clientId: string; status: string }>>(co(ctx, '/invoices'));
    const inv = pickOne(list.map((i) => ({ ...i, label: i.invoiceNumber })), a.invoice ?? a.text, (i) => i.label, 'invoice');
    if (inv.status === 'Draft') throw new Error(`${inv.invoiceNumber} is a draft: it is sent once it is issued`);
    const client = ctx.names.client(inv.clientId) ?? 'the client';
    return ctx.propose('POST', `/invoices/${encodeURIComponent(inv.id)}/email`, {},
      say(ctx, `Email ${inv.invoiceNumber} to ${client}`, `إرسال ${inv.invoiceNumber} بالبريد إلى ${client}`));
  },
};

// ── the money picture ───────────────────────────────────────────────────────

export const financeSummary: Recipe = {
  name: 'financeSummary',
  params: ['from', 'to'],
  needs: [['GET', '/companies/:companyId/invoices'], ['GET', '/companies/:companyId/expenses'], ['GET', '/companies/:companyId/finance/vendor-bills']],
  signature: "financeSummary({ from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' })",
  returns: '{ from, to, currency, invoiced, collected, expenses, clientsOwe, weOweSuppliers, overdueFromClients, overdueToSuppliers } — the money picture for the period (this month by default) and what is owed now',
  example: "const f = await tf.financeSummary(); return f;",
  words: ['finance', 'money', 'cash', 'profit', 'summary', 'overview', 'position', 'month'],
  async run(ctx, args) {
    const a = argsOf(args);
    const from = dateArg(ctx, a.from, 'from') ?? `${ctx.today.slice(0, 8)}01`;
    const to = dateArg(ctx, a.to, 'to') ?? ctx.today;
    const [invoiceRows, expenseRows, billRows] = await Promise.all([
      ctx.get<Array<{ status: string; total: number; outstandingAmount?: number; exchangeRate?: number; issueDate?: string; dueDate?: string }>>(co(ctx, '/invoices')),
      ctx.get<ExpenseRow[]>(co(ctx, '/expenses')),
      ctx.get<BillRow[]>(co(ctx, '/finance/vendor-bills')),
    ]);
    const base = (n: number, rate?: number) => n * Number(rate ?? 1);
    const issued = invoiceRows.filter((i) => i.status !== 'Draft');
    const inPeriod = issued.filter((i) => { const d = dayOf(i.issueDate) ?? ''; return d >= from && d <= to; });
    const owed = (i: { status: string; total: number; outstandingAmount?: number }) => (i.status === 'Sent' || i.status === 'Overdue' ? Number(i.outstandingAmount ?? i.total) : 0);
    const invoiced = round(inPeriod.reduce((s, i) => s + base(Number(i.total), i.exchangeRate), 0));
    const billOwed = (b: BillRow) => (b.status === 'Paid' || b.status === 'Draft' ? 0 : Number(b.outstandingAmount ?? Number(b.amount) - Number(b.paidAmount ?? 0)));
    return {
      from, to, currency: ctx.currency,
      invoiced,
      collected: round(invoiced - inPeriod.reduce((s, i) => s + base(owed(i), i.exchangeRate), 0)),
      expenses: round(expenseRows.filter((e) => { const d = dayOf(e.expenseDate) ?? ''; return d >= from && d <= to; }).reduce((s, e) => s + Number(e.amount), 0)),
      clientsOwe: round(issued.reduce((s, i) => s + base(owed(i), i.exchangeRate), 0)),
      overdueFromClients: round(issued.filter((i) => owed(i) > 0 && (i.status === 'Overdue' || (dayOf(i.dueDate) ?? '9999') < ctx.today)).reduce((s, i) => s + base(owed(i), i.exchangeRate), 0)),
      weOweSuppliers: round(billRows.reduce((s, b) => s + billOwed(b), 0)),
      overdueToSuppliers: round(billRows.filter((b) => billOwed(b) > 0 && (dayOf(b.dueDate) ?? '9999') < ctx.today).reduce((s, b) => s + billOwed(b), 0)),
    };
  },
};

export const OPERATIONS: Recipe[] = [
  projects, quotations, createQuote, payables, purchaseOrders, expenses, createExpense,
  employees, followups, completeFollowup, addComment, decideApproval, emailInvoice, financeSummary,
];

// RecipeContext is part of every recipe's signature (run(ctx, args)).
export type { RecipeContext };
