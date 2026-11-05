import { ROUTES, type RouteDecl } from '../authz/route-registry';
import { hintFor } from './hints';

/**
 * What the assistant may call: the staff API, read off the route registry so a
 * new route is in the catalogue the day it ships. Left out: routes without a
 * staff session (public, portal), the platform admin's, sign-in and session
 * plumbing, and the assistant's own routes, so a script can never confirm its
 * own actions.
 */
export interface AssistantOp {
  method: RouteDecl['method'];
  path: string;
  permission: string;
  note?: string;
  /** Lower-cased words of the path, permission and note, for search. */
  words: string[];
}

const EXCLUDED_PREFIXES = ['/assistant', '/auth', '/password', '/push', '/push-actions', '/live', '/seed', '/health', '/public', '/public-api', '/portal-api', '/academy', '/admin'];
const EXCLUDED_KINDS = new Set(['public', 'portal', 'super_admin']);

function wordsOf(decl: RouteDecl): string[] {
  const text = `${decl.path} ${decl.permission} ${decl.note ?? ''}`
    .replace(/:[a-zA-Z]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return [...new Set(text.split(/[^a-z0-9]+/).filter((w) => w.length > 1))];
}

let cached: AssistantOp[] | undefined;
export function assistantOps(): AssistantOp[] {
  cached ??= ROUTES
    .filter((r) => !EXCLUDED_KINDS.has(r.permission))
    .filter((r) => !EXCLUDED_PREFIXES.some((p) => r.path === p || r.path.startsWith(`${p}/`)))
    .map((r) => ({ method: r.method, path: r.path, permission: r.permission, ...(r.note ? { note: r.note } : {}), words: wordsOf(r) }));
  return cached;
}

const STEM = (w: string) => w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : ''));

/** Best matches for a free-text query (English words), most relevant first. */
export function searchOps(ops: AssistantOp[], query: string, limit = 12): AssistantOp[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1).map(STEM);
  if (terms.length === 0) return [];
  const scored = ops.map((op) => {
    let score = 0;
    const stems = op.words.map(STEM);
    for (const t of terms) {
      if (stems.includes(t)) score += 3;
      else if (stems.some((w) => w.startsWith(t) || t.startsWith(w) && w.length > 3)) score += 1;
    }
    if (score > 0 && op.method === 'GET') score += 0.5; // reads first: they are what most questions need
    if (score > 0 && op.path.split('/').length <= 4) score += 0.25; // the list before the sub-resources
    return { op, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.op);
}

/** The registry route a concrete call (`/companies/abc/tasks?x=1`) is, if any. */
export function matchOp(ops: AssistantOp[], method: string, url: string): AssistantOp | undefined {
  const pathOnly = url.split('?')[0].replace(/\/+$/, '') || '/';
  const parts = pathOnly.split('/');
  return ops.find((op) => {
    if (op.method !== method) return false;
    const pattern = op.path.split('/');
    if (pattern.length !== parts.length) return false;
    return pattern.every((seg, i) => (seg.startsWith(':') ? safeSegment(parts[i]) : seg === parts[i]));
  });
}

/**
 * A path parameter that stays one segment on the wire. fetch's URL parser turns
 * `%2e%2e` into `..` and `\` into `/` and then normalizes, so an id like that
 * would reach a different route than the one matched here.
 */
function safeSegment(raw: string): boolean {
  if (!raw || raw.includes('\\')) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return false; }
  return decoded !== '.' && decoded !== '..' && !/[/\\]/.test(decoded) && !raw.includes('..');
}

/** One line per op, as the model reads them. */
export function describeOp(op: AssistantOp): string {
  const hint = hintFor(op.method, op.path);
  return `${op.method} ${op.path}${hint ? `\n    ${hint.text}` : op.note ? `  — ${op.note.slice(0, 160)}` : ''}`;
}
