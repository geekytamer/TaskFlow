/**
 * Records the assistant shows as cards instead of text: any kind, built from
 * the full record the script read (so a script may pass just `{ id }`). The
 * kind comes from the endpoint the record was read from.
 */
export interface AssistantCard {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  amount?: { value: number; currency: string };
  date?: { label: 'due' | 'date'; value: string };
  people?: string[];
  /** Where the record opens in TaskFlow. */
  href?: string;
}

/** `/companies/:companyId/purchase-orders` → `purchase-order`; `/tasks/:id` → `task`. */
export function kindOfPath(pattern: string): string {
  const last = pattern.split('?')[0].split('/').filter((s) => s && !s.startsWith(':')).pop() ?? 'record';
  return last.endsWith('ies') ? `${last.slice(0, -3)}y` : last.endsWith('ses') ? last.slice(0, -2) : last.replace(/s$/, '');
}

const HREF: Record<string, (id: string) => string> = {
  task: (id) => `/tasks?task=${encodeURIComponent(id)}`,
  project: (id) => `/projects/${encodeURIComponent(id)}`,
  contact: (id) => `/contacts/${encodeURIComponent(id)}`,
  invoice: (id) => `/invoice/${encodeURIComponent(id)}`,
  quotation: (id) => `/quotation/${encodeURIComponent(id)}`,
  'sales-order': () => '/sales',
  'purchase-order': () => '/purchases',
  'purchase-requisition': () => '/purchases/requisitions',
  rfq: () => '/purchases/rfq',
  'vendor-bill': () => '/finance?tab=payables',
  expense: () => '/finance?tab=expenses',
  'inventory-item': () => '/inventory',
  item: () => '/inventory',
  shipment: () => '/shipments',
  employee: () => '/hr/employees',
  'leave-request': () => '/hr/leave',
  opportunity: () => '/crm/opportunities',
  campaign: (id) => `/crm/campaigns?campaign=${encodeURIComponent(id)}`,
  followup: () => '/crm/followups',
  client: () => '/contacts',
  supplier: () => '/contacts',
  approval: () => '/approvals',
  document: (id) => `/document/${encodeURIComponent(id)}`,
  'document-template': () => '/documents?tab=templates',
};

const TITLE_FIELDS = ['title', 'name', 'fileName', 'templateName', 'invoiceNumber', 'quoteNumber', 'quotationNumber', 'orderNumber', 'billNumber', 'number', 'reference', 'lotNumber', 'subject', 'sku', 'email'];
const SUBTITLE_FIELDS = ['clientName', 'supplierName', 'vendorName', 'customerName', 'contactName', 'company', 'category', 'sku', 'email', 'phone'];

export interface CardLookups {
  userName(id: string): string | undefined;
  clientName(id: string): string | undefined;
  projectName(id: string): string | undefined;
  currency: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function cardOf(kind: string, record: Record<string, unknown>, look: CardLookups): AssistantCard | null {
  const id = str(record.id) ?? (typeof record.id === 'number' ? String(record.id) : undefined);
  if (!id) return null;
  const title = TITLE_FIELDS.map((f) => str(record[f])).find(Boolean) ?? `${kind} ${id.slice(0, 8)}`;
  const subtitle = [
    ...SUBTITLE_FIELDS.map((f) => str(record[f])),
    str(record.clientId) ? look.clientName(String(record.clientId)) : undefined,
    str(record.projectId) ? look.projectName(String(record.projectId)) : undefined,
  ].find((v) => v && v !== title) ?? (str(record.description)?.slice(0, 90));
  const status = str(record.status) ?? str(record.stage);
  const outstanding = num(record.outstandingAmount);
  const value = outstanding !== undefined && outstanding > 0 && status !== 'Paid' ? outstanding : num(record.total) ?? num(record.amount) ?? num(record.totalAmount);
  const due = str(record.dueDate);
  const other = str(record.expenseDate) ?? str(record.issueDate) ?? str(record.date) ?? str(record.startDate);
  const ids = Array.isArray(record.assignedUserIds) ? record.assignedUserIds : Array.isArray(record.userIds) ? record.userIds : [];
  const people = ids.map((u) => look.userName(String(u)) ?? String(u)).slice(0, 4);
  return {
    kind, id, title,
    ...(subtitle ? { subtitle } : {}),
    ...(status ? { status } : {}),
    ...(value !== undefined ? { amount: { value, currency: str(record.currency) ?? look.currency } } : {}),
    ...(due ? { date: { label: 'due' as const, value: due } } : other ? { date: { label: 'date' as const, value: other } } : {}),
    ...(people.length ? { people } : {}),
    ...(kind === 'attachment' && str(record.entityType) && str(record.entityId) && HREF[String(record.entityType).replace(/_/g, '-')]
      ? { href: HREF[String(record.entityType).replace(/_/g, '-')](String(record.entityId)) }
      : (kind === 'client' || kind === 'supplier') && str(record.contactId)
      ? { href: `/contacts/${encodeURIComponent(String(record.contactId))}` }
      : HREF[kind] ? { href: HREF[kind](id) } : {}),
  };
}
