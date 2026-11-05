import type { Recipe } from './types';
import { argsOf, co, dateArg, dayOf, norm, oneOf, sameName, say } from './util';

interface ItemRow { id: string; name: string; sku: string; unit: string; onHand: number; reorderPoint: number; tracksInventory: boolean; location?: string }
interface ContactRow { id: string; name: string; legalName?: string; contactPerson?: string; kind: string; phone?: string; email?: string; roles?: string[] }

const LOW_WORDS = ['low', 'منخفض', 'ناقص', 'قليل'];
const ROLES = ['Lead', 'Client', 'Vendor', 'Influencer', 'Partner'] as const;
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

export const stock: Recipe = {
  name: 'stock',
  needs: [['GET', '/companies/:companyId/inventory-items']],
  params: ['item', 'low', 'text'],
  signature: 'stock({ item?: name|sku, low?: true })',
  returns: 'items [{ id, name, sku, inStock (the quantity), unit, reorderPoint, low }] — a list even for one item; "how many X do we have" is its inStock, not the number of rows; low: true keeps those at or under their reorder point',
  example: "const [item] = await tf.stock({ item: 'printer paper' }); return item ? { name: item.name, inStock: item.inStock, unit: item.unit } : 'not found';",
  words: ['stock', 'inventory', 'item', 'items', 'quantity', 'low', 'reorder', 'warehouse', 'available', 'product'],
  async run(ctx, args) {
    const a = argsOf(args);
    const textIsLow = typeof a.text === 'string' && LOW_WORDS.includes(norm(a.text));
    const want = norm(a.item ?? (textIsLow ? '' : a.text));
    return (await ctx.get<ItemRow[]>(co(ctx, '/inventory-items')))
      .map((i) => ({
        id: i.id, name: i.name, sku: i.sku, inStock: Number(i.onHand), unit: i.unit, reorderPoint: Number(i.reorderPoint),
        low: Boolean(i.tracksInventory) && Number(i.onHand) <= Number(i.reorderPoint), ...(i.location ? { location: i.location } : {}),
      }))
      .filter((r) => !want || norm(r.name).includes(want) || norm(r.sku) === want)
      .filter((r) => !(a.low === true || textIsLow) || r.low);
  },
};

export const onLeave: Recipe = {
  name: 'onLeave',
  needs: [['GET', '/companies/:companyId/employees'], ['GET', '/companies/:companyId/leave-requests']],
  params: ['date', 'text'],
  signature: "onLeave({ date?: 'YYYY-MM-DD'|'today'|'tomorrow' })",
  returns: 'approved leave covering that day [{ id, employee, from, to, days }]; today by default',
  example: "const away = await tf.onLeave({ date: 'tomorrow' }); return away.map((l) => l.employee);",
  words: ['leave', 'vacation', 'holiday', 'absent', 'off', 'away', 'sick'],
  async run(ctx, args) {
    const a = argsOf(args);
    const day = dateArg(ctx, a.date ?? a.text ?? 'today', 'date') as string;
    const [employees, leave] = await Promise.all([
      ctx.get<Array<{ id: string; name: string }>>(co(ctx, '/employees')),
      ctx.get<Array<{ id: string; employeeId: string; startDate: string; endDate: string; days: number }>>(co(ctx, '/leave-requests?status=Approved')),
    ]);
    const name = new Map(employees.map((e) => [e.id, e.name]));
    return leave
      .filter((l) => (dayOf(l.startDate) ?? '') <= day && day <= (dayOf(l.endDate) ?? ''))
      .map((l) => ({ id: l.id, employee: name.get(l.employeeId) ?? l.employeeId, from: dayOf(l.startDate), to: dayOf(l.endDate), days: l.days }));
  },
};

const contactRow = (c: ContactRow) => ({ id: c.id, name: c.name, kind: c.kind, ...(c.phone ? { phone: c.phone } : {}), ...(c.email ? { email: c.email } : {}), roles: c.roles ?? [] });

export const contacts: Recipe = {
  name: 'contacts',
  needs: [['GET', '/companies/:companyId/contacts']],
  params: ['role', 'search', 'limit'],
  signature: "contacts({ role?: 'Lead'|'Client'|'Vendor'|'Influencer'|'Partner', search?: words, limit?: number })",
  returns: 'contacts [{ id, name, kind, phone, email, roles }], newest first (30 by default): all of them, or those of a role',
  example: "const leads = await tf.contacts({ role: 'Lead' }); await show(leads); return { leads: leads.length };",
  words: ['contacts', 'contact', 'list', 'all', 'clients', 'customers', 'leads', 'suppliers', 'vendors', 'people', 'directory'],
  async run(ctx, args) {
    const a = argsOf(args);
    const role = oneOf(a.role, ROLES, 'role');
    const want = norm(a.search ?? a.text);
    const limit = Math.min(Math.max(Number(a.limit) || 30, 1), 200);
    return (await ctx.get<Array<ContactRow & { createdAt?: string }>>(co(ctx, '/contacts')))
      .filter((c) => !role || (c.roles ?? []).includes(role))
      .filter((c) => !want || [c.name, c.legalName, c.contactPerson, c.email].some((f) => f && norm(f).includes(want)) || sameName(String(a.search ?? a.text), c.name))
      .sort((x, y) => String(y.createdAt ?? '').localeCompare(String(x.createdAt ?? '')))
      .slice(0, limit)
      .map(contactRow);
  },
};

export const findContact: Recipe = {
  name: 'findContact',
  needs: [['GET', '/companies/:companyId/contacts']],
  params: ['text', 'name', 'query'],
  signature: 'findContact(text: name, phone or email)',
  returns: 'up to 10 contacts [{ id, name, kind, phone, email, roles }]',
  example: "const [c] = await tf.findContact('Salim Al Harthy'); return c ? { name: c.name, phone: c.phone, email: c.email } : 'not found';",
  words: ['contact', 'phone', 'number', 'email', 'lead', 'person', 'customer', 'supplier', 'call'],
  async run(ctx, args) {
    const a = argsOf(args);
    const want = norm(a.text ?? a.name ?? a.query);
    // No words: the list (people ask "show me my contacts" this way too).
    if (!want) return contacts.run(ctx, {});
    const wantDigits = digits(want);
    return (await ctx.get<ContactRow[]>(co(ctx, '/contacts')))
      .filter((c) => [c.name, c.legalName, c.contactPerson, c.email].some((f) => f && norm(f).includes(want))
        || [c.name, c.legalName, c.contactPerson].some((f) => f && sameName(String(a.text ?? a.name ?? a.query), f))
        || (wantDigits.length >= 6 && digits(c.phone).includes(wantDigits)))
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind, ...(c.phone ? { phone: c.phone } : {}), ...(c.email ? { email: c.email } : {}), roles: c.roles ?? [] }));
  },
};

export const createContact: Recipe = {
  name: 'createContact',
  needs: [['POST', '/companies/:companyId/contacts']],
  params: ['name', 'text', 'phone', 'email', 'kind', 'roles', 'notes'],
  signature: "createContact({ name, phone?, email?, kind?: 'Person'|'Organization', roles?: ['Lead'|'Client'|'Vendor'|'Influencer'|'Partner'], notes? })",
  returns: 'one proposal adding the contact. Roles: Lead = a prospect, not buying yet (عميل محتمل); Client = already buys (عميل); Vendor = a supplier (مورد); Influencer (مؤثر); Partner (شريك)',
  example: "return await tf.createContact({ name: 'Maryam Al Zadjali', phone: '+968 9000 0000', roles: ['Lead'] });",
  words: ['contact', 'add', 'new', 'lead', 'customer', 'person', 'save', 'number'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const name = String(a.name ?? a.text ?? '').trim();
    if (!name) throw new Error('a contact needs a name');
    const kind = oneOf(a.kind, ['Person', 'Organization'], 'kind');
    const roles = Array.isArray(a.roles) ? a.roles.map((r) => oneOf(r, ROLES, 'roles') as string) : undefined;
    const body = {
      name,
      ...(a.phone ? { phone: String(a.phone) } : {}), ...(a.email ? { email: String(a.email) } : {}),
      ...(kind ? { kind } : {}), ...(roles?.length ? { roles } : {}), ...(a.notes ? { notes: String(a.notes) } : {}),
    };
    return ctx.propose('POST', co(ctx, '/contacts'), body, say(ctx, `Add the contact: ${name}`, `إضافة جهة اتصال: ${name}`));
  },
};

export const pendingApprovals: Recipe = {
  name: 'pendingApprovals',
  needs: [['GET', '/companies/:companyId/approvals']],
  params: [],
  signature: 'pendingApprovals()',
  returns: 'what waits for the person to approve [{ id, docType, number, amount, party, date, requester }]',
  example: "const waiting = await tf.pendingApprovals(); return { count: waiting.length, first: waiting[0] };",
  words: ['approval', 'approvals', 'approve', 'pending', 'waiting', 'sign', 'review', 'request'],
  async run(ctx) {
    const rows = await ctx.get<Array<{ docType: string; docId: string; number: string; amount?: number; party?: string | null; date?: string; requesterId?: string }>>(co(ctx, '/approvals'));
    return rows.map((r) => ({
      id: r.docId, docType: r.docType, number: r.number, ...(r.amount !== undefined ? { amount: r.amount } : {}),
      ...(r.party ? { party: r.party } : {}), ...(r.date ? { date: dayOf(r.date) } : {}),
      ...(r.requesterId ? { requester: ctx.names.user(r.requesterId) ?? r.requesterId } : {}),
    }));
  },
};
