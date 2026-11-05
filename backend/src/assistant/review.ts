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

/** Sub-areas folded into the module people know them by (Settings → Assistant lists modules, not routes). */
const AREA_OF: Record<string, string> = {
  'time-entries': 'tasks', 'approval-holds': 'approvals', 'conversation-threads': 'inbox', 'conversation-messages': 'inbox',
  'group-people': 'people', users: 'people', 'holding-groups': 'group', me: 'personal', notifications: 'personal',
};

/** The area a call belongs to: its permission's module (per-record routes: the first path word), folded as above. */
export function areaOf(op: { permission: string; path: string }): string {
  const raw = op.permission.includes('.') ? op.permission.split('.')[0] : op.path.split('/').find((s) => s && !s.startsWith(':') && s !== 'companies') ?? 'other';
  return AREA_OF[raw] ?? raw;
}

const DOC_TYPES: Record<string, ApprovalDocType> = {
  'purchase-order': 'purchase_order', expense: 'expense', 'vendor-bill': 'vendor_bill', invoice: 'invoice',
  'credit-note': 'credit_note', quotation: 'quotation', 'payroll-run': 'payroll_run', document: 'document',
  'purchase-requisition': 'purchase_requisition', 'leave-request': 'leave_request',
};

/** The approval document type of a card kind, if that kind can go for approval. */
export const docTypeOf = (kind: string): ApprovalDocType | undefined => DOC_TYPES[kind];
