# Assistant Wave 2 ("trust") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Files under a `<!-- file: path -->` marker are complete and are written verbatim. Changes to existing files are described with the exact snippet to replace or add.

**Goal:** People confirm what they understand, can correct it before it runs, can take it back afterwards, and their company decides how far the assistant may go.

**Architecture:**
- The review logic is pure functions in `assistant/review.ts`:
  - the fields of a proposed body, as a small form;
  - before → after changes;
  - applying the person's edits;
  - the inverse of a change (for undo);
  - the area a call belongs to;
  - the approval document type.
- When a change is proposed, the server reads the record it touches with a `GET` (as the person) and keeps it on the action as `before`.
- When a change runs, the server keeps its inverse. For 10 minutes the person can run that inverse ("Undo") through the same loopback API, as themselves.
- Company settings live in `assistant_settings` and are checked at three points: chat, proposal and example retrieval.

**Tech Stack:** TypeScript (Express, better-sqlite3), Node test runner, Next.js plus shadcn/ui.

## Global Constraints

- Every call still runs through the API as the person. Undo and edits never bypass a route's own checks.
- Nothing runs without the person's tap. That includes undo, which runs on its own click.
- **A delete is never undone.** Its history and links cannot be put back honestly, so the card says it can't be undone.
- **Only fields already in the proposed body can be edited.** Ids, company ids and nested values are read-only (shown by name).
- Tests: `npx -y -p node@24 npm test` in `backend/`. Read the pass/fail counts before committing (principle 40).
- Migrations continue from `163_assistant_examples`. This wave adds `164_assistant_review`.
- New routes need the registry entry, the equivalence/widenings/seed updates (Wave 1 taught this) and `legacyRoles` that match their key (`settings.edit` → `AM`, `settings.view` → `ALL`).
- Interface text is bilingual (`tr(en, ar)`) and must work right-to-left.

## Decisions (owner: decide, don't ask)

- **Role rules use the company's legacy roles** (Admin, Manager, Accountant, Employee). Admins always keep access while the assistant is on, so nobody locks themselves out. A v2 permission key `assistant.use` is the follow-up once v2 is authoritative. Today v2 runs in shadow, so a key now would mean templates and conversions for little gain.
- **Approval awareness is exact after a change runs** (the new document's approval request, with the current step's approvers). **Before it runs, it is a soft "may need approval"** whenever the company has a policy for that document type. Predicting the exact chain needs amounts and facts each document computes differently.
- **Undo window:** 10 minutes from when the change ran. Undo of a creation deletes what was made (only where the API has the matching `DELETE`). Undo of an edit puts the old values of the changed fields back.
- **Settings:**
  - on/off;
  - which roles may use it;
  - which areas it may *change* (it always reads under the person's own permissions);
  - most changes per confirmation (≤ 25);
  - learn from use on/off.
- **The log** is `assistant_actions` for the company, with filters for person, status and area. It is visible to `settings.edit`, because it shows everyone's actions.

---

## File structure

| File | Responsibility |
| --- | --- |
| `backend/src/assistant/review.ts` | `labelOf`, `fieldsOf`, `changesOf`, `applyEdits`, `inverseOf`, `areaOf`, `docTypeOf`. |
| `backend/src/assistant/settings.ts` | `AssistantSettings`, `DEFAULT_ASSISTANT_SETTINGS`, `parseAssistantSettings`, `mayUseAssistant`. |
| `backend/src/data/store.ts` | Migration 164; `before`/`inverse`/`area` on actions; the `undone` status; settings and company-log methods. |
| `backend/src/routes/assistant.ts` | Before-snapshot at proposal, review data in `actionView`, edits on decide, undo, settings checks, settings/log routes. |
| `backend/src/authz/route-registry.ts` | Entries for 4 routes. |
| `backend/test/assistant-review.test.js` | Unit and integration tests for this wave. |
| `frontend/src/services/assistantService.ts` | Types, plus `undoAssistantAction`, settings and log calls. |
| `frontend/src/modules/assistant/components/action-review.tsx` | The confirm card: form fields, diff, delete warning, approval note, undo. |
| `frontend/src/modules/assistant/components/assistant-page.tsx` | Uses `ActionReview`; sends edits; undo. |
| `frontend/src/modules/settings/components/assistant-settings-panel.tsx` | Settings → Assistant: controls, log, learned examples. |
| `frontend/src/modules/settings/components/settings-page.tsx` | Mounts the panel. |

---

### Task 1: Review logic and settings (pure modules)

**Files:**
- Create: `backend/src/assistant/review.ts`, `backend/src/assistant/settings.ts`
- Test: `backend/test/assistant-review.test.js`

**Interfaces (Produces):**
- `fieldsOf(body, hint, names): ReviewField[]`
- `changesOf(before, body, names): ReviewChange[]`
- `applyEdits(body, edits, hint?): Record<string, unknown>`
- `inverseOf(ops, action, before, result): Inverse | null`
- `areaOf(op): string`
- `docTypeOf(kind): ApprovalDocType | undefined`
- `parseAssistantSettings(input, areas): AssistantSettings`
- `mayUseAssistant(settings, role, superAdmin): boolean`

- [ ] **Step 1: Write the module tests (they fail: the modules are missing).**

<!-- file: backend/test/assistant-review.test.js -->
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { fieldsOf, changesOf, applyEdits, inverseOf, areaOf, docTypeOf, labelOf } = require('../dist/assistant/review');
const { parseAssistantSettings, mayUseAssistant, DEFAULT_ASSISTANT_SETTINGS } = require('../dist/assistant/settings');
const { assistantOps } = require('../dist/assistant/catalogue');
const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { makeTmpDir } = require('./helpers/tmp');
const { seedFixture } = require('../eval/assistant/fixture');

const names = (key, value) => ({ u1: 'Samantha Bee', p1: 'Website' }[value]);

test('review: fields of a body — scalars editable, ids read-only by name, enums as choices, dates as dates', () => {
  const hint = { text: '', values: { priority: ['Low', 'Medium', 'High', 'Urgent'] } };
  const fields = fieldsOf({ title: 'Call', companyId: '1', priority: 'High', dueDate: '2026-11-06', assignedUserIds: ['u1'], estimateMinutes: 30, description: 'Long words' }, hint, names);
  const by = Object.fromEntries(fields.map((f) => [f.key, f]));
  assert.equal(by.companyId, undefined, 'the company is never a field');
  assert.deepEqual(by.title, { key: 'title', label: 'Title', kind: 'text', value: 'Call' });
  assert.equal(by.priority.kind, 'select');
  assert.deepEqual(by.priority.options, ['Low', 'Medium', 'High', 'Urgent']);
  assert.equal(by.dueDate.kind, 'date');
  assert.equal(by.assignedUserIds.kind, 'readonly');
  assert.equal(by.assignedUserIds.display, 'Samantha Bee');
  assert.equal(by.estimateMinutes.kind, 'number');
  assert.equal(by.description.kind, 'longtext');
  assert.equal(labelOf('assignedUserIds'), 'Assigned user');
});

test('review: changes before → after, only what differs, ids by name', () => {
  const changes = changesOf({ status: 'To Do', priority: 'High', assignedUserIds: [], dueDate: '2026-11-08T00:00:00.000Z' }, { status: 'Done', priority: 'High', assignedUserIds: ['u1'], dueDate: '2026-11-09' }, names);
  assert.deepEqual(changes, [
    { key: 'status', label: 'Status', from: 'To Do', to: 'Done' },
    { key: 'assignedUserIds', label: 'Assigned user', from: '—', to: 'Samantha Bee' },
    { key: 'dueDate', label: 'Due date', from: '2026-11-08', to: '2026-11-09' },
  ]);
});

test('review: edits change only fields already there, keep types, respect choices', () => {
  const hint = { text: '', values: { priority: ['Low', 'Medium', 'High'] } };
  const body = { title: 'Call', priority: 'High', hours: 2, companyId: '1', assignedUserIds: ['u1'] };
  assert.deepEqual(applyEdits(body, { title: 'Call Omar', hours: '1.5', priority: 'Low' }, hint), { ...body, title: 'Call Omar', hours: 1.5, priority: 'Low' });
  assert.throws(() => applyEdits(body, { status: 'Done' }, hint), /Status cannot be changed here/);
  assert.throws(() => applyEdits(body, { companyId: '2' }, hint), /cannot be changed here/);
  assert.throws(() => applyEdits(body, { assignedUserIds: ['u2'] }, hint), /cannot be changed here/);
  assert.throws(() => applyEdits(body, { priority: 'Huge' }, hint), /must be one of/);
  assert.throws(() => applyEdits(body, { hours: 'two' }, hint), /must be a number/);
  assert.throws(() => applyEdits({ dueDate: '2026-11-06' }, { dueDate: 'soon' }), /YYYY-MM-DD/);
});

test('review: the inverse of a creation is the matching delete; of an edit, the old values; a delete has none', () => {
  const ops = assistantOps();
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/tasks', body: {} }, null, { id: 't9' }), { method: 'DELETE', path: '/tasks/t9' });
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/companies/1/contacts', body: {} }, null, { id: 'c9' }), { method: 'DELETE', path: '/contacts/c9' });
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/invoices/i1/payments', body: {} }, null, { id: 'p9' }), { method: 'DELETE', path: '/invoices/i1/payments/p9' });
  assert.deepEqual(inverseOf(ops, { method: 'POST', path: '/tasks/t1/time-entries', body: {} }, null, { id: 'e9' }), { method: 'DELETE', path: '/time-entries/e9' });
  assert.equal(inverseOf(ops, { method: 'POST', path: '/tasks/t1/comments', body: {} }, null, { id: 'm9' }), null, 'no delete route: no undo');
  assert.equal(inverseOf(ops, { method: 'POST', path: '/projects/p1/members', body: {} }, null, { id: 'p1' }), null, 'an action on a record returns that record: nothing to delete');
  assert.deepEqual(inverseOf(ops, { method: 'PUT', path: '/tasks/t1', body: { status: 'Done', dueDate: '2026-11-09' } }, { status: 'To Do', title: 'x' }, {}), { method: 'PUT', path: '/tasks/t1', body: { status: 'To Do', dueDate: null } });
  assert.equal(inverseOf(ops, { method: 'PUT', path: '/tasks/t1', body: { status: 'Done' } }, null, {}), null, 'no before: no undo');
  assert.equal(inverseOf(ops, { method: 'DELETE', path: '/tasks/t1' }, { id: 't1' }, {}), null);
});

test('review: areas and approval document types', () => {
  assert.equal(areaOf({ permission: 'invoices.pay', path: '/invoices/:id/payments' }), 'invoices');
  assert.equal(areaOf({ permission: 'per_record', path: '/tasks/:taskId/time-entries' }), 'tasks');
  assert.equal(docTypeOf('purchase-order'), 'purchase_order');
  assert.equal(docTypeOf('task'), undefined);
});

test('settings: defaults, validation, who may use it', () => {
  const areas = ['tasks', 'contacts', 'invoices'];
  assert.deepEqual(parseAssistantSettings({}, areas), DEFAULT_ASSISTANT_SETTINGS);
  const s = parseAssistantSettings({ enabled: true, roles: ['Manager'], changeAreas: ['tasks'], maxChanges: 5, learn: false }, areas);
  assert.deepEqual(s, { enabled: true, roles: ['Admin', 'Manager'], changeAreas: ['tasks'], maxChanges: 5, learn: false }, 'Admin is always kept');
  assert.throws(() => parseAssistantSettings({ changeAreas: ['nope'] }, areas), /unknown area nope/);
  assert.throws(() => parseAssistantSettings({ maxChanges: 99 }, areas), /maxChanges/);
  assert.equal(mayUseAssistant(s, 'Employee', false), false);
  assert.equal(mayUseAssistant(s, 'Admin', false), true);
  assert.equal(mayUseAssistant({ ...s, enabled: false }, 'Admin', false), false, 'off is off for everyone');
});
```

- [ ] **Step 2: Run it to see it fail.** `cd backend && npx -y -p node@24 sh -c 'npm run build && NODE_ENV=test node --require ./test/helpers/loopback.js --test test/assistant-review.test.js'`. Expected: FAIL, `Cannot find module '../dist/assistant/review'`.

- [ ] **Step 3: Write the modules.**

<!-- file: backend/src/assistant/review.ts -->
```ts
import type { ApprovalDocType } from '../approvals/approvals';
import { matchOp, type AssistantOp } from './catalogue';
import type { OpHint } from './hints';

/**
 * What a person needs to judge a proposed change before and after it runs:
 * its fields as a small form, what it changes, their own edits, and how to
 * take it back. Pure functions; the route supplies names and records.
 */
export type FieldKind = 'text' | 'longtext' | 'number' | 'date' | 'select' | 'boolean' | 'readonly';
export interface ReviewField { key: string; label: string; kind: FieldKind; value?: string | number | boolean | null; display?: string; options?: readonly string[] }
export interface ReviewChange { key: string; label: string; from: string; to: string }
export interface Inverse { method: 'DELETE' | 'PUT' | 'PATCH'; path: string; body?: Record<string, unknown> }
/** A name for an id under a key (assignedUserIds → user names); undefined when it is not an id we know. */
export type Namer = (key: string, value: unknown) => string | undefined;

const LONG = /^(description|notes?|body|content|message|reason|address)$/i;
const DATE_KEY = /(date|Date|At|On)$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const ID_KEY = /(^id$|Id$|Ids$)/;
const HIDDEN = new Set(['companyId', 'contentBase64']);

/** dueDate → "Due date", assignedUserIds → "Assigned user". */
export function labelOf(key: string): string {
  const words = key.replace(/Ids?$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shown(value: unknown, key: string, names: Namer): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((v) => shown(v, key, names)).join(', ') : '—';
  const named = ID_KEY.test(key) ? names(key, value) : undefined;
  if (named) return named;
  if (typeof value === 'string' && DATE_KEY.test(key) && ISO_DAY.test(value)) return value.slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The body's top-level fields as a small form: scalars editable, ids and nested values read-only (shown by name). */
export function fieldsOf(body: unknown, hint: OpHint | undefined, names: Namer): ReviewField[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.entries(body as Record<string, unknown>)
    .filter(([key]) => !HIDDEN.has(key))
    .map(([key, value]): ReviewField => {
      const label = labelOf(key);
      if (ID_KEY.test(key) || (value !== null && typeof value === 'object')) return { key, label, kind: 'readonly', display: shown(value, key, names) };
      const options = hint?.values?.[key];
      if (options) return { key, label, kind: 'select', value: value as string, options };
      if (typeof value === 'number') return { key, label, kind: 'number', value };
      if (typeof value === 'boolean') return { key, label, kind: 'boolean', value };
      if (typeof value === 'string' && ISO_DAY.test(value) && (DATE_KEY.test(key) || value.length === 10)) return { key, label, kind: 'date', value: value.slice(0, 10) };
      if (LONG.test(key) || (typeof value === 'string' && value.length > 80)) return { key, label, kind: 'longtext', value: value === null ? null : String(value) };
      return { key, label, kind: 'text', value: value === null ? null : String(value) };
    });
}

/** What an edit changes: each field of the body whose shown value differs from the record before. */
export function changesOf(before: Record<string, unknown> | null | undefined, body: unknown, names: Namer): ReviewChange[] {
  if (!before || !body || typeof body !== 'object') return [];
  return Object.entries(body as Record<string, unknown>)
    .filter(([key]) => !HIDDEN.has(key))
    .map(([key, to]) => ({ key, label: labelOf(key), from: shown(before[key], key, names), to: shown(to, key, names) }))
    .filter((c) => c.from !== c.to);
}

/** The body with the person's edits: only fields already there, scalar, not ids; types and choices kept. */
export function applyEdits(body: unknown, edits: unknown, hint?: OpHint): Record<string, unknown> {
  const out: Record<string, unknown> = { ...((body ?? {}) as Record<string, unknown>) };
  if (!edits || typeof edits !== 'object') return out;
  for (const [key, raw] of Object.entries(edits as Record<string, unknown>)) {
    const was = out[key];
    if (!(key in out) || HIDDEN.has(key) || ID_KEY.test(key) || (was !== null && typeof was === 'object')) throw new Error(`${labelOf(key)} cannot be changed here`);
    const options = hint?.values?.[key];
    if (options && !options.includes(String(raw))) throw new Error(`${labelOf(key)} must be one of ${options.join(', ')}`);
    if (typeof was === 'number') {
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n)) throw new Error(`${labelOf(key)} must be a number`);
      out[key] = n;
    } else if (typeof was === 'boolean') {
      out[key] = raw === true || raw === 'true';
    } else if (typeof was === 'string' && ISO_DAY.test(was) && DATE_KEY.test(key)) {
      if (raw !== null && raw !== '' && !ISO_DAY.test(String(raw))) throw new Error(`${labelOf(key)} must be YYYY-MM-DD`);
      out[key] = raw === '' || raw === null ? null : String(raw).slice(0, 10);
    } else {
      out[key] = raw === null ? null : String(raw).slice(0, 5000);
    }
  }
  return out;
}

/**
 * How to take a change back, or null. A creation → the matching DELETE, when
 * the API has one and the result is a new record (not the record the path
 * already names). An edit → the same call with the old values of what it
 * changed. A delete → nothing: history and links cannot be put back honestly.
 */
export function inverseOf(ops: AssistantOp[], action: { method: string; path: string; body?: unknown }, before: Record<string, unknown> | null | undefined, result: unknown): Inverse | null {
  const path = action.path.split('?')[0];
  if (action.method === 'POST') {
    const id = result && typeof result === 'object' && !Array.isArray(result) ? (result as { id?: unknown }).id : undefined;
    if (typeof id !== 'string' && typeof id !== 'number') return null;
    const enc = encodeURIComponent(String(id));
    if (path.split('/').includes(enc)) return null;
    const last = path.split('/').filter(Boolean).at(-1) ?? '';
    for (const candidate of [`${path}/${enc}`, `/${last}/${enc}`]) {
      if (matchOp(ops, 'DELETE', candidate)) return { method: 'DELETE', path: candidate };
    }
    return null;
  }
  if ((action.method === 'PUT' || action.method === 'PATCH') && before && action.body && typeof action.body === 'object') {
    const body: Record<string, unknown> = {};
    for (const key of Object.keys(action.body as Record<string, unknown>)) {
      body[key] = key === 'companyId' ? (action.body as Record<string, unknown>)[key] : (before[key] ?? null);
    }
    return { method: action.method, path, body };
  }
  return null;
}

/** The area a call belongs to (its permission's module; for per-record routes, the first path word). */
export function areaOf(op: { permission: string; path: string }): string {
  if (op.permission.includes('.')) return op.permission.split('.')[0];
  return op.path.split('/').find((s) => s && !s.startsWith(':') && s !== 'companies') ?? 'other';
}

const DOC_TYPES: Record<string, ApprovalDocType> = {
  'purchase-order': 'purchase_order', expense: 'expense', 'vendor-bill': 'vendor_bill', invoice: 'invoice',
  'credit-note': 'credit_note', quotation: 'quotation', 'payroll-run': 'payroll_run', document: 'document',
  'purchase-requisition': 'purchase_requisition', 'leave-request': 'leave_request',
};

/** The approval document type of a card kind, if that kind can go for approval. */
export const docTypeOf = (kind: string): ApprovalDocType | undefined => DOC_TYPES[kind];
```

<!-- file: backend/src/assistant/settings.ts -->
```ts
import type { UserRole } from '../types';

/** How far a company lets the assistant go (Settings → Assistant). */
export interface AssistantSettings {
  enabled: boolean;
  /** Roles that may use it; Admin always may, so nobody locks themselves out. */
  roles: UserRole[];
  /** Areas it may change (it reads under the person's own permissions); null = every area. */
  changeAreas: string[] | null;
  /** Most changes proposed at once (1–25). */
  maxChanges: number;
  /** Learn from confirmed changes and 👍 (learned examples). */
  learn: boolean;
}

export const ASSISTANT_ROLES: UserRole[] = ['Admin', 'Manager', 'Accountant', 'Employee'];

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: true, roles: [...ASSISTANT_ROLES], changeAreas: null, maxChanges: 25, learn: true,
};

/** Settings from a request (or stored JSON), checked; missing fields take the defaults. */
export function parseAssistantSettings(input: unknown, areas: string[]): AssistantSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_ASSISTANT_SETTINGS;
  const roles = o.roles === undefined ? d.roles : Array.isArray(o.roles) ? o.roles.map(String) : null;
  if (!roles || roles.some((r) => !ASSISTANT_ROLES.includes(r as UserRole))) throw new Error(`roles must be some of ${ASSISTANT_ROLES.join(', ')}`);
  const withAdmin = ASSISTANT_ROLES.filter((r) => r === 'Admin' || roles.includes(r));
  let changeAreas: string[] | null = d.changeAreas;
  if (o.changeAreas !== undefined && o.changeAreas !== null) {
    if (!Array.isArray(o.changeAreas)) throw new Error('changeAreas must be a list of areas, or null for all');
    const unknown = o.changeAreas.map(String).filter((a) => !areas.includes(a));
    if (unknown.length) throw new Error(`unknown area ${unknown.join(', ')}`);
    changeAreas = [...new Set(o.changeAreas.map(String))].sort();
  }
  const maxChanges = o.maxChanges === undefined ? d.maxChanges : Number(o.maxChanges);
  if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 25) throw new Error('maxChanges must be a whole number from 1 to 25');
  return {
    enabled: o.enabled === undefined ? d.enabled : o.enabled === true,
    roles: withAdmin,
    changeAreas,
    maxChanges,
    learn: o.learn === undefined ? d.learn : o.learn === true,
  };
}

/** Whether a person with this role in the company may use the assistant there. */
export function mayUseAssistant(s: AssistantSettings, role: UserRole | undefined, superAdmin: boolean): boolean {
  if (!s.enabled) return false;
  return superAdmin || role === 'Admin' || (role !== undefined && s.roles.includes(role));
}
```

- [ ] **Step 4: Run the tests until they pass, then commit.** Commit message: `feat(assistant): review logic — fields, changes, edits, inverses; company settings`.

---

### Task 2: Before-snapshot, review data on actions, edits on confirm

**Files:**
- Modify: `backend/src/data/store.ts`, `backend/src/routes/assistant.ts`
- Test: `backend/test/assistant-review.test.js` (append)

**Interfaces:**
- Consumes: Task 1.
- Produces: an `actionView(a)` gains:
  - `fields?: ReviewField[]` (pending POST/PUT/PATCH);
  - `changes?: ReviewChange[]` (PUT/PATCH with a `before`);
  - `target?: AssistantCard` (DELETE with a `before`);
  - `undoable: boolean`;
  - `undoUntil?: string`;
  - `approval?: { status: 'may' } | { status: 'pending'; waitingOn: string[] }`;
  - `edited?: ReviewChange[]`.

  `POST /assistant/threads/:id/decide` accepts `edits: { [actionId]: { [field]: value } }`.

- [ ] **Step 1: Append the failing integration tests.**

```js
function setupFx(steps = []) {
  const dbPath = path.join(makeTmpDir('taskflow-review-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const fx = seedFixture(store, new Date().toISOString().slice(0, 10));
  const chat = async () => (steps.shift() ?? (() => ({ content: 'ok' })))();
  const app = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} }, assistant: { chat, modelName: 'test-model' } }).listen(0);
  app.unref();
  const as = (who) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${store.issueToken(who)}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${store.issueToken(who)}`).send(body ?? {}),
    put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${store.issueToken(who)}`).send(body ?? {}),
  });
  /** One script, then a reply; returns the thread view. */
  const ask = async (code, who = fx.admin.id, message = 'do it') => {
    steps.push(() => ({ content: `\`\`\`js\n${code}\n\`\`\`` }), () => ({ content: 'Prepared.' }));
    const res = await as(who).post('/assistant/chat', { companyId: '1', message });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };
  return { store, fx, as, ask, steps };
}

test('confirm card: an edit shows before → after; the person edits before confirming and that is what runs', async () => {
  const { store, fx, as, ask } = setupFx();
  const view = await ask("return await tf.updateTask({ task: 'Prepare Q4 report', status: 'Done', priority: 'High' });");
  const a = view.items.at(-1).actions[0];
  assert.deepEqual(a.changes.map((c) => [c.key, c.from, c.to]), [['status', 'To Do', 'Done'], ['priority', 'Medium', 'High']]);
  assert.ok(a.fields.some((f) => f.key === 'status' && f.kind === 'select'));
  const decided = await as(fx.admin.id).post(`/assistant/threads/${view.id}/decide`, { confirm: [a.id], edits: { [a.id]: { status: 'In Review' } } });
  assert.equal(decided.status, 200, JSON.stringify(decided.body));
  assert.equal(store.getTaskById(fx.tasks.q4Report.id).status, 'In Review', 'the edited value ran');
  const after = decided.body.items.flatMap((i) => i.actions).find((x) => x.id === a.id);
  assert.deepEqual(after.edited, [{ key: 'status', label: 'Status', from: 'Done', to: 'In Review' }]);
  const bad = await ask("return await tf.updateTask({ task: 'Call the supplier', status: 'Done' });");
  const b = bad.items.at(-1).actions[0];
  const refused = await as(fx.admin.id).post(`/assistant/threads/${bad.id}/decide`, { confirm: [b.id], edits: { [b.id]: { companyId: '2' } } });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /cannot be changed here/);
  assert.equal(store.getTaskById(fx.tasks.callSupplier.id).status, 'In Progress', 'a refused edit runs nothing');
});

test('confirm card: a delete shows what goes and says it cannot be undone', async () => {
  const { fx, ask } = setupFx();
  const real = await ask(`return await api.delete('/tasks/' + (await tf.myTasks()).find((t) => t.title === 'Supplier note').id, 'Delete the supplier note');`);
  const a = real.items.at(-1).actions[0];
  assert.equal(a.method, 'DELETE');
  assert.equal(a.target.title, 'Supplier note');
  assert.equal(a.undoable, false);
  assert.ok(fx.tasks.supplierNote.id);
});
```

- [ ] **Step 2: Run them to see them fail** (no `changes`/`fields`/`target`).

- [ ] **Step 3: Store.**

  1. Migration `164_assistant_review`, after `163_assistant_examples`:

```ts
      {
        // Wave 2: what an action changes (the record before), how to take it back, its area; company settings.
        id: '164_assistant_review',
        run: () => {
          this.db.exec(`
            ALTER TABLE assistant_actions ADD COLUMN before TEXT;
            ALTER TABLE assistant_actions ADD COLUMN inverse TEXT;
            ALTER TABLE assistant_actions ADD COLUMN area TEXT;
            ALTER TABLE assistant_actions ADD COLUMN edited TEXT;
            CREATE INDEX IF NOT EXISTS idx_assistant_actions_company ON assistant_actions (companyId, createdAt);
            CREATE TABLE IF NOT EXISTS assistant_settings (
              companyId TEXT PRIMARY KEY,
              settings TEXT NOT NULL,
              updatedAt TEXT NOT NULL,
              updatedBy TEXT
            );
          `);
        },
      },
```

  2. Add `before?: Record<string, unknown> | null; inverse?: unknown; area?: string | null; edited?: unknown` to `AssistantActionRow`. Add `'undone'` to `AssistantActionStatus`.
  3. `createAssistantAction` stores `before` and `area` when given: add them to the INSERT, JSON-encoding `before`.
  4. `decodeAssistantAction` parses `before`, `inverse` and `edited` (JSON or null).
  5. New methods:

```ts
  /** The person's edits before it ran: the body that will run, and what they changed. */
  editAssistantAction(id: string, body: unknown, edited: unknown): void {
    this.db.prepare('UPDATE assistant_actions SET body = ?, edited = ? WHERE id = ?').run(JSON.stringify(body), JSON.stringify(edited), id);
  }

  setAssistantActionInverse(id: string, inverse: unknown): void {
    this.db.prepare('UPDATE assistant_actions SET inverse = ? WHERE id = ?').run(inverse === null ? null : JSON.stringify(inverse), id);
  }

  /** A done action taken back; false when it was not done (undone twice, or never ran). */
  markAssistantActionUndone(id: string): boolean {
    return this.db.prepare("UPDATE assistant_actions SET status = 'undone' WHERE id = ? AND status = 'done'").run(id).changes > 0;
  }

  listCompanyAssistantActions(companyId: string, filter: { userId?: string; status?: string; area?: string; limit?: number } = {}): AssistantActionRow[] {
    const where = ['companyId = ?'];
    const args: unknown[] = [companyId];
    if (filter.userId) { where.push('userId = ?'); args.push(filter.userId); }
    if (filter.status) { where.push('status = ?'); args.push(filter.status); }
    if (filter.area) { where.push('area = ?'); args.push(filter.area); }
    args.push(Math.min(Math.max(filter.limit ?? 100, 1), 500));
    return (this.db.prepare(`SELECT * FROM assistant_actions WHERE ${where.join(' AND ')} ORDER BY createdAt DESC LIMIT ?`).all(...args) as Array<Record<string, unknown>>)
      .map((r) => this.decodeAssistantAction(r));
  }

  getAssistantSettingsRaw(companyId: string): unknown {
    const row = this.db.prepare('SELECT settings FROM assistant_settings WHERE companyId = ?').get(companyId) as { settings: string } | undefined;
    return row ? JSON.parse(row.settings) : {};
  }

  saveAssistantSettings(companyId: string, settings: unknown, userId: string): void {
    this.db.prepare('INSERT INTO assistant_settings (companyId, settings, updatedAt, updatedBy) VALUES (?, ?, ?, ?) ON CONFLICT(companyId) DO UPDATE SET settings = excluded.settings, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy')
      .run(companyId, JSON.stringify(settings), new Date().toISOString(), userId);
  }
```

  6. `decideAssistantAction`'s guard stays `IN ('pending', 'running')`.

- [ ] **Step 4: Route — before-snapshot and area at proposal.** In `host.call`'s write branch, right before `store.createAssistantAction(...)`:

```ts
          // What the change touches, read now as the person: the confirm card shows before → after, a delete shows what goes.
          let before: Record<string, unknown> | null = null;
          if (method !== 'POST' && matchOp(ops, 'GET', path)) {
            try {
              const read = await callApi(token, 'GET', path.split('?')[0], undefined);
              if (read && typeof read === 'object' && !Array.isArray(read)) before = read as Record<string, unknown>;
            } catch { /* no snapshot: the card shows the fields only */ }
          }
```

  Then pass `before, area: areaOf(op)` into `createAssistantAction`.

- [ ] **Step 5: Route — review data in `actionView`.** `actionView` becomes a function taking `(a, companyId)` and builds the extra fields. Its `namer` uses `store.getUserById`, `getClientById`, `getProjectById`, `getContactById` (if present) and `getCompanyById`, by key:

```ts
  const namer: Namer = (key, value) => {
    const id = String(value);
    if (/user|assignee|owner|approver/i.test(key)) return store.getUserById(id)?.name;
    if (/client/i.test(key)) return store.getClientById(id)?.name;
    if (/project/i.test(key)) return store.getProjectById(id)?.name;
    if (/file/i.test(key)) return store.getAssistantFile(id)?.fileName;
    return undefined;
  };
  const UNDO_MS = 10 * 60 * 1000;
  const actionView = (a: AssistantActionRow) => {
    const op = matchOp(ops, a.method, a.path);
    const hint = op ? hintFor(op.method, op.path) : undefined;
    const kind = op ? kindOfPath(op.path) : 'record';
    const docType = a.method === 'POST' ? docTypeOf(kind) : undefined;
    const madeId = a.result && typeof a.result === 'object' ? String((a.result as { id?: unknown }).id ?? '') : '';
    let approval: { status: 'may' } | { status: 'pending'; waitingOn: string[] } | undefined;
    if (docType && a.status === 'pending' && store.approvalApplies(a.companyId, docType)) approval = { status: 'may' };
    if (docType && a.status === 'done' && madeId) {
      const view = store.approvalView(docType, madeId);
      const step = view.steps.find((s) => s.status === 'pending');
      if (view.status === 'pending' && step) approval = { status: 'pending', waitingOn: step.approvers.map((x) => x.label) };
    }
    const decidedAt = a.decidedAt ? Date.parse(a.decidedAt) : 0;
    const undoUntil = a.status === 'done' && a.inverse && decidedAt ? new Date(decidedAt + UNDO_MS).toISOString() : undefined;
    return {
      id: a.id, method: a.method, path: a.path, summary: a.summary, status: a.status, body: a.body ?? null,
      error: a.status === 'failed' ? String((a.result as { error?: string } | null)?.error ?? '') : null,
      ...(a.status === 'pending' && a.method !== 'DELETE' ? { fields: fieldsOf(a.body, hint, namer) } : {}),
      ...(a.before && a.method !== 'DELETE' && a.method !== 'POST' ? { changes: changesOf(a.before, a.body, namer) } : {}),
      ...(a.before && a.method === 'DELETE' ? { target: cardOf(kind, a.before, cardLookups(a.companyId)) } : {}),
      undoable: a.method !== 'DELETE' && (a.status !== 'done' || Boolean(a.inverse)),
      ...(undoUntil && Date.parse(undoUntil) > Date.now() ? { undoUntil } : {}),
      ...(approval ? { approval } : {}),
      ...(Array.isArray(a.edited) && a.edited.length ? { edited: a.edited } : {}),
    };
  };
```

  `ops` (`assistantOps()`) moves to the top of `registerAssistantRoutes`. `cardLookups(companyId)` is the existing `lookups` object made into a function, which `advance` and decide then reuse.

  `undoable` before the change runs means "can be taken back if it goes wrong" (shown as a note). After it runs, it means "Undo is offered".

- [ ] **Step 6: Route — edits on decide.** In the decide handler, `const edits = body.edits && typeof body.edits === 'object' ? body.edits as Record<string, unknown> : {};`. Before the confirm loop, validate every edit, so a bad edit refuses the whole request before anything runs:

```ts
    const editedBodies = new Map<string, { body: Record<string, unknown>; edited: ReviewChange[] }>();
    for (const [actionId, change] of Object.entries(edits)) {
      const a = store.getAssistantAction(actionId);
      if (!a || a.threadId !== thread.id || a.status !== 'pending' || !confirm.includes(actionId)) continue;
      const op = matchOp(ops, a.method, a.path);
      const hint = op ? hintFor(op.method, op.path) : undefined;
      let next: Record<string, unknown>;
      try { next = applyEdits(a.body, change, hint); } catch (err) { throw new HttpError(400, err instanceof Error ? err.message : String(err)); }
      const refused = checkBody(hint, next);
      if (refused) throw new HttpError(400, refused);
      editedBodies.set(actionId, { body: next, edited: changesOf(a.body as Record<string, unknown>, next, namer) });
    }
```

  In the confirm loop, right after `claimAssistantAction` succeeds:

```ts
        const edit = editedBodies.get(id);
        if (edit) { store.editAssistantAction(id, edit.body, edit.edited); a.body = edit.body; }
```

  Add `${edit ? ` (the person edited: ${edit.edited.map((c) => `${c.label} ${c.from} → ${c.to}`).join(', ')})` : ''}` to the `Done:` report line, so the model knows what really ran.

- [ ] **Step 7: Run all backend tests; read the counts; commit.** Commit message: `feat(assistant): confirm cards show before → after and take the person's edits`.

---

### Task 3: Undo for 10 minutes

**Files:** Modify `backend/src/routes/assistant.ts`, `backend/src/authz/route-registry.ts`. Test: append to `assistant-review.test.js`.

**Interfaces:** Produces `POST /assistant/threads/:id/undo { actionId }`, which returns the thread view (409 when it can no longer be undone).

- [ ] **Step 1: Append the failing tests.**

```js
test('undo: a created task is deleted within 10 minutes; an edit gets its old values back; never twice, never late', async () => {
  const { store, fx, as, ask } = setupFx();
  const made = await ask("return await tf.createTasks([{ title: 'Undo me' }]);");
  const a = made.items.at(-1).actions[0];
  const done = await as(fx.admin.id).post(`/assistant/threads/${made.id}/decide`, { confirm: [a.id] });
  const after = done.body.items.flatMap((i) => i.actions).find((x) => x.id === a.id);
  assert.ok(after.undoUntil, 'Undo is offered');
  const created = store.listTasks().find((t) => t.title === 'Undo me');
  assert.ok(created);
  const undone = await as(fx.admin.id).post(`/assistant/threads/${made.id}/undo`, { actionId: a.id });
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.equal(store.getTaskById(created.id), undefined, 'the task is gone');
  assert.equal(undone.body.items.flatMap((i) => i.actions).find((x) => x.id === a.id).status, 'undone');
  assert.equal((await as(fx.admin.id).post(`/assistant/threads/${made.id}/undo`, { actionId: a.id })).status, 409, 'not twice');
  assert.match(store.getAssistantThread(made.id).messages.at(-1).content, /The person undid: Create the task: Undo me/);

  const edit = await ask("return await tf.updateTask({ task: 'Call the supplier', status: 'Done' });");
  const e = edit.items.at(-1).actions[0];
  await as(fx.admin.id).post(`/assistant/threads/${edit.id}/decide`, { confirm: [e.id] });
  assert.equal(store.getTaskById(fx.tasks.callSupplier.id).status, 'Done');
  store.db.prepare('UPDATE assistant_actions SET decidedAt = ? WHERE id = ?').run(new Date(Date.now() - 11 * 60 * 1000).toISOString(), e.id);
  assert.equal((await as(fx.admin.id).post(`/assistant/threads/${edit.id}/undo`, { actionId: e.id })).status, 409, 'too late');
  store.db.prepare('UPDATE assistant_actions SET decidedAt = ? WHERE id = ?').run(new Date().toISOString(), e.id);
  assert.equal((await as(fx.admin.id).post(`/assistant/threads/${edit.id}/undo`, { actionId: e.id })).status, 200);
  assert.equal(store.getTaskById(fx.tasks.callSupplier.id).status, 'In Progress', 'old value back');
});
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Keep the inverse when a change runs.** In the confirm loop, after `store.decideAssistantAction(id, 'done', result)`:

```ts
          const inverse = inverseOf(ops, { method: a.method, path: a.path, body: a.body }, a.before ?? null, result);
          if (inverse) store.setAssistantActionInverse(id, inverse);
```

- [ ] **Step 4: The route.**

```ts
  /** Takes back a change made in the last 10 minutes: its inverse runs through the API as the person. */
  app.post('/assistant/threads/:id/undo', authMiddleware, handler(async (req, res) => {
    const thread = threadFor(req, req.params.id);
    requireCompanyAccess(req, thread.companyId);
    const actionId = requiredString(asRecord(req.body, 'body').actionId, 'actionId');
    await turn(res, thread.id, false, async () => {
      const a = store.getAssistantAction(actionId);
      if (!a || a.threadId !== thread.id || a.userId !== req.user!.id) throw new HttpError(404, 'Change not found');
      const inverse = a.inverse as Inverse | null | undefined;
      const late = !a.decidedAt || Date.now() - Date.parse(a.decidedAt) > UNDO_MS;
      if (a.status !== 'done' || !inverse || late) throw new HttpError(409, late && a.status === 'done' ? 'Undo is only possible for 10 minutes after a change.' : 'This change cannot be undone.');
      if (!store.markAssistantActionUndone(a.id)) throw new HttpError(409, 'This change cannot be undone.');
      try {
        await callApi(tokenOf(req), inverse.method, inverse.path, inverse.body, CHANGE_TIMEOUT_MS);
      } catch (err) {
        store.db.prepare("UPDATE assistant_actions SET status = 'done' WHERE id = ?").run(a.id);
        throw new HttpError(409, `Could not undo: ${err instanceof Error ? err.message : String(err)}`);
      }
      const fresh = store.getAssistantThread(thread.id)!;
      store.saveAssistantMessages(fresh.id, [...fresh.messages, { role: 'user', content: `[The person undid: ${a.summary}]`, ui: { hidden: true } }]);
    });
  }));
```

  Use a store method `reopenAssistantActionAfterFailedUndo(id)` instead of the raw `db` call (UPDATE … SET status = 'done' WHERE status = 'undone').

  Registry: `{ method: 'POST', path: '/assistant/threads/:id/undo', permission: 'self', note: 'your own changes, within 10 minutes; the inverse runs through its own route as you' }`. Add it to `KNOWN_UNGATED` if the extractor asks.

- [ ] **Step 5: Tests; read the counts; commit.** Commit message: `feat(assistant): undo a change for 10 minutes`.

---

### Task 4: Company settings, their checks, the log

**Files:** Modify `backend/src/routes/assistant.ts`, `backend/src/authz/route-registry.ts`, `backend/test/authz-engine.test.js` (seed, if asked), `backend/test/fixtures/authz-widenings.json` (regenerate and review). Test: append.

**Interfaces:** Produces:
- `GET /companies/:companyId/assistant/settings` (settings.view) → `{ settings, areas, roles }`;
- `PUT /companies/:companyId/assistant/settings` (settings.edit);
- `GET /companies/:companyId/assistant/actions?userId&status&area&limit` (settings.edit) → rows `{ id, userId, userName, method, path, summary, status, area, createdAt, decidedAt, edited? }`.

- [ ] **Step 1: Append the failing tests.**

```js
test('settings: admins set them; off, roles, areas, most changes and learning are all enforced', async () => {
  const { store, fx, as, ask } = setupFx();
  const got = await as(fx.admin.id).get('/companies/1/assistant/settings');
  assert.equal(got.status, 200);
  assert.equal(got.body.settings.enabled, true);
  assert.ok(got.body.areas.includes('tasks') && got.body.areas.includes('contacts'));
  assert.equal((await as(fx.charlie.id).put('/companies/1/assistant/settings', { enabled: false })).status, 403);

  assert.equal((await as(fx.admin.id).put('/companies/1/assistant/settings', { roles: ['Manager'] })).status, 200);
  const blocked = await as(fx.charlie.id).post('/assistant/chat', { companyId: '1', message: 'hi' });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'ASSISTANT_OFF');

  await as(fx.admin.id).put('/companies/1/assistant/settings', { changeAreas: ['tasks'], maxChanges: 2 });
  const contact = await ask("return await tf.createContact({ name: 'Nope' });");
  assert.equal(contact.items.at(-1).actions.length, 0);
  assert.match(JSON.stringify(store.getAssistantThread(contact.id).messages), /Changes to contacts through the assistant are turned off/);
  const three = await ask("return await tf.createTasks(['a', 'b', 'c']);");
  assert.equal(three.items.at(-1).actions.length, 0, 'over the limit: nothing proposed');
  assert.match(JSON.stringify(store.getAssistantThread(three.id).messages), /at most 2 changes at once/);

  await as(fx.admin.id).put('/companies/1/assistant/settings', { enabled: false });
  assert.equal((await as(fx.admin.id).post('/assistant/chat', { companyId: '1', message: 'hi' })).status, 403, 'off is off for admins too');
});

test('log: admins see every assistant change in the company, filtered; employees cannot', async () => {
  const { fx, as, ask } = setupFx();
  const made = await ask("return await tf.createTasks(['Logged']);");
  await as(fx.admin.id).post(`/assistant/threads/${made.id}/decide`, { confirm: [made.items.at(-1).actions[0].id] });
  const log = await as(fx.admin.id).get('/companies/1/assistant/actions?status=done');
  assert.equal(log.status, 200);
  assert.equal(log.body[0].summary, 'Create the task: Logged');
  assert.equal(log.body[0].userName, 'Admin User');
  assert.equal(log.body[0].area, 'tasks');
  assert.equal((await as(fx.charlie.id).get('/companies/1/assistant/actions')).status, 403);
});
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement.**
  - `const areasCatalogue = [...new Set(ops.filter((op) => op.method !== 'GET').map(areaOf))].sort();`
  - `const settingsOf = (companyId) => { try { return parseAssistantSettings(store.getAssistantSettingsRaw(companyId), areasCatalogue); } catch { return DEFAULT_ASSISTANT_SETTINGS; } };`
  - `const roleIn = (req, companyId) => req.user!.companyRoles?.find((r) => r.companyId === companyId)?.role ?? req.user!.role;`
  - `/assistant/chat`: after the company is known, `if (!mayUseAssistant(settingsOf(companyId), roleIn(req, companyId), Boolean(req.user!.isSuperAdmin))) throw new HttpError(403, 'The assistant is turned off for you in this company.', { code: 'ASSISTANT_OFF' });`. Run the same check in `/decide` and `/undo`, so a switched-off assistant can't run changes left waiting.
  - In `advance()`: `const settings = settingsOf(companyId);` Then:
    - in the write branch, `const area = areaOf(op); if (settings.changeAreas && !settings.changeAreas.includes(area)) throw new Error(`Changes to ${area} through the assistant are turned off in this company; the person can do it in TaskFlow itself.`);`;
    - `MAX_WRITES_PER_RUN` becomes `settings.maxChanges`;
    - examples are retrieved only when `settings.learn`.
  - In `saveExample`: return early (without saving) when `!settingsOf(companyId).learn`.
  - The three routes, as specified under Interfaces. Each uses `requirePermission(req, companyId, key, legacyRolesOf.get(...))`. The log maps `userName: store.getUserById(a.userId)?.name`.
  - Registry:
    - `GET /companies/:companyId/assistant/settings` with settings.view, `ALL`;
    - `PUT` (same path) with settings.edit, `AM`;
    - `GET /companies/:companyId/assistant/actions` with settings.edit, `AM`.
  - Regenerate the widenings snapshot with `UPDATE_SNAPSHOTS=1` and review that the diff holds only these routes.

- [ ] **Step 4: Run all tests, read the counts, commit.** Commit message: `feat(assistant): company settings (on/off, roles, change areas, limit, learning) and the change log`.

---

### Task 5: Frontend — the review card, undo, Settings → Assistant

**Files:**
- Create: `frontend/src/modules/assistant/components/action-review.tsx`, `frontend/src/modules/settings/components/assistant-settings-panel.tsx`
- Modify: `assistantService.ts`, `assistant-page.tsx`, `settings-page.tsx`

- [ ] **Step 1: Service.**
  - Extend `AssistantAction` with `fields?`, `changes?`, `target?: AssistantCard`, `undoable: boolean`, `undoUntil?`, `approval?`, `edited?`, and `'undone'` in the status.
  - `decideAssistantActions` takes `edits?`.
  - Add `undoAssistantAction(threadId, actionId)`, `getAssistantSettings(companyId)`, `saveAssistantSettings(companyId, settings)`, `listAssistantLog(companyId, filter)`, `listAssistantExamples(companyId)` and `deleteAssistantExample(id)`.

- [ ] **Step 2: `action-review.tsx`** replaces `ActionRow`.
  - **Pending POST, PUT or PATCH:** a compact form of `fields`:
    - inputs sized to their content, selects for choices, a date input for dates, a textarea for long text;
    - read-only fields as muted text with their names.
    - Edited fields are marked, and only the changed values are sent as `edits[action.id]`.
  - **PUT or PATCH:** a before → after list (old value struck through, new value strong) above the form.
  - **DELETE:** the target as a small card, plus a line in red: "This can't be undone."
  - **Approval note:**
    - `may`: "May need approval in this company";
    - `pending`: "Waiting for approval: {names}".
  - **Done with `undoUntil` in the future:** an "Undo" button with the minutes left. The countdown refreshes every 30 s, and the button disappears when the time runs out.
  - **Undone:** a muted chip.
  - **Edited:** "You changed: …" under the summary.
  - **Details:** the raw method, path and body stay behind "Details".
  - The layout has to hold at 375 px and right-to-left. Use logical properties (`ms-`/`me-`, `text-start`).

- [ ] **Step 3: `assistant-page.tsx`.** Keep a `edits` state keyed by action id, which `ActionReview` updates. `decide(confirm, decline)` sends `edits` for the confirmed ids and clears them afterwards. Add `undo(actionId)`, which calls the service and sets the thread (a 409 shows the error line). "Confirm all" sends every edit.

- [ ] **Step 4: `assistant-settings-panel.tsx`.** It is shown only when `assistantStatusOnce().enabled`, and editable with `can('settings.edit')`. It has:
  - an on/off switch;
  - role checkboxes, with Admin checked and disabled;
  - "May change": "Everything it can read" or chosen areas (checkbox chips);
  - a most-changes number input (1–25);
  - a learn-from-use switch;
  - Save, which shows a toast on success and the error line on failure;
  - a "Recent changes" table (newest 50; filters for status and area; who, what, when, status), shown only with `settings.edit`;
  - a "Learned examples" list (request, kind, uses, delete), shown only with `settings.edit`.

  Mount it in `settings-page.tsx` after `ConversationSettingsPanel`, as `{selectedCompany && <AssistantSettingsPanel />}`.

- [ ] **Step 5: Check types and lint.** Then check in the browser, with the `ai-api` and `ai-web` launch configs:
  1. Propose an edit and see before → after.
  2. Change a field and confirm, then see the task changed and "You changed".
  3. Click Undo, and see the task back and the chip "Undone".
  4. In Settings, turn a role off and see the 403 line for that role.
  5. Take screenshots at desktop width, at 375 px, and in Arabic.

- [ ] **Step 6: Commit.** Commit message: `feat(assistant): review cards (edit, before → after, delete warning, approvals), undo, Settings → Assistant`.

---

### Task 6: Verify, review, record

- [ ] Run the full backend suite (read the counts) and the frontend `tsc`.
- [ ] Rerun the eval. The score must not drop below 95% (Wave 2 does not touch the prompt, so a drop means a regression).
- [ ] Run `code-review` on the wave's diff; fix what it confirms; report the outcomes.
- [ ] Add "Wave 2 results" to the roadmap spec; update the memory; push.
