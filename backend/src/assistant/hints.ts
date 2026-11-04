/**
 * What a small model cannot guess: exact body fields and allowed values for
 * the changes people ask for most. Shown in search results next to the route,
 * and checked before a change is proposed so a wrong body is fixed by the
 * model straight away instead of failing after the person confirms.
 */
export interface OpHint {
  /** One line the model reads, e.g. the body shape. */
  text: string;
  /** Fields that must be present in the body. */
  required?: string[];
  /** Allowed values per field. */
  values?: Record<string, readonly string[]>;
}

const TASK_STATUS = ['To Do', 'In Progress', 'Waiting', 'In Review', 'Done'] as const;
const TASK_PRIORITY = ['Low', 'Medium', 'High', 'Urgent'] as const;

export const OP_HINTS: Readonly<Record<string, OpHint>> = {
  'GET /tasks': { text: `query: ?companyId=<id>. Each task: id, title, status (${TASK_STATUS.join('|')}; open = not Done), priority, dueDate, startDate, assignedUserIds, projectId.` },
  'POST /tasks': {
    text: `body { title, companyId, priority: ${TASK_PRIORITY.join('|')}, dueDate?: "YYYY-MM-DD", startDate?, description?, assignedUserIds?: [userId], projectId?, status?: ${TASK_STATUS.join('|')} }. The person's own id is in the system prompt.`,
    required: ['title', 'companyId', 'priority'],
    values: { priority: TASK_PRIORITY, status: TASK_STATUS },
  },
  'PUT /tasks/:id': {
    text: `body: only the fields to change, e.g. { status: ${TASK_STATUS.join('|')} } or { dueDate: "YYYY-MM-DD" } or { priority }`,
    values: { priority: TASK_PRIORITY, status: TASK_STATUS },
  },
  'POST /clients': {
    text: 'body { companyId, name, email, address, contactName?, phone?, notes? }',
    required: ['companyId', 'name', 'email', 'address'],
  },
  'POST /companies/:companyId/expenses': {
    text: 'body { category, amount: number, expenseDate?: "YYYY-MM-DD", vendor?, description?, paymentMethod?, projectId? }',
    required: ['category', 'amount'],
  },
  'GET /companies/:companyId/invoices': { text: 'Each invoice: id, invoiceNumber, clientId, status (Draft|Sent|Paid|Overdue), total, outstandingAmount, currency, dueDate. Unpaid = status Sent or Overdue; owed = sum of outstandingAmount. Filter in code; the list takes no status query.' },
};

export const hintFor = (method: string, path: string): OpHint | undefined => OP_HINTS[`${method} ${path}`];

/** Why a proposed body would be refused, if a hint knows; undefined when it looks right. */
export function checkBody(hint: OpHint | undefined, body: unknown): string | undefined {
  if (!hint) return undefined;
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const missing = (hint.required ?? []).filter((f) => record[f] === undefined || record[f] === null || record[f] === '');
  const wrong = Object.entries(hint.values ?? {})
    .filter(([f, allowed]) => record[f] !== undefined && !allowed.includes(String(record[f])))
    .map(([f, allowed]) => `${f} must be one of ${allowed.join(', ')}`);
  const problems = [...(missing.length ? [`missing ${missing.join(', ')}`] : []), ...wrong];
  return problems.length ? `not proposed: ${problems.join('; ')}. Expected ${hint.text}` : undefined;
}

/** A compact picture of a response: what the model needs to write the next script correctly. */
export function shapeOf(value: unknown): string {
  const row = (o: Record<string, unknown>) => Object.keys(o).slice(0, 30).join(', ');
  if (Array.isArray(value)) {
    const first = value.find((v) => v && typeof v === 'object') as Record<string, unknown> | undefined;
    if (!first) return `array(${value.length})`;
    const enums = ['status', 'priority', 'type', 'kind', 'stage']
      .filter((k) => k in first)
      .map((k) => `${k}: ${[...new Set(value.slice(0, 200).map((v) => (v as Record<string, unknown>)?.[k]).filter((x) => typeof x === 'string'))].slice(0, 8).join('|')}`);
    return `array(${value.length}) of { ${row(first)} }${enums.length ? `; values seen — ${enums.join('; ')}` : ''}`;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const inner = Object.entries(o).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}: ${shapeOf(v)}`);
    return `{ ${row(o)} }${inner.length ? `; ${inner.join('; ')}` : ''}`;
  }
  return typeof value;
}
