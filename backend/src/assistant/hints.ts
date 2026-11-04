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
    text: `body { title, companyId, priority: ${TASK_PRIORITY.join('|')}, dueDate?: "YYYY-MM-DD", startDate?, description?, assignedUserIds?: [userId], projectId?, status?: ${TASK_STATUS.join('|')} }. The person's own id is in the system prompt. Several tasks: loop in one script. Already done: status Done, dueDate today.`,
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

/**
 * Query filters an endpoint ignored: the rows came back with other values in
 * that very field (e.g. ?status=Overdue on a list that has no such filter).
 * Small models invent filters; without this they count everything.
 */
export function ignoredFilters(path: string, value: unknown): string[] {
  const query = path.split('?')[1];
  if (!query || !Array.isArray(value) || value.length === 0) return [];
  const rows = value.filter((r) => r && typeof r === 'object') as Array<Record<string, unknown>>;
  const out: string[] = [];
  for (const [key, wanted] of new URLSearchParams(query)) {
    if (key === 'companyId') continue;
    const present = rows.filter((r) => key in r && (typeof r[key] === 'string' || typeof r[key] === 'number' || typeof r[key] === 'boolean'));
    if (present.length === 0) {
      if (key === 'status' || key === 'priority' || key === 'overdue') out.push(`${key}=${wanted} (rows have no ${key} field like that)`);
      continue;
    }
    const wants = wanted.split(',').map((w) => w.trim().toLowerCase());
    if (present.some((r) => !wants.includes(String(r[key]).toLowerCase()))) out.push(`${key}=${wanted}`);
  }
  return out;
}

/** Records with ids in a script's return value (an array, or an object holding arrays). */
export function recordsIn(value: unknown): Array<Record<string, unknown>> {
  const isRec = (r: unknown): r is Record<string, unknown> => Boolean(r) && typeof r === 'object' && !Array.isArray(r) && 'id' in (r as object);
  if (Array.isArray(value)) return value.filter(isRec);
  if (value && typeof value === 'object') return Object.values(value).flatMap((v) => (Array.isArray(v) ? v.filter(isRec) : []));
  return [];
}
