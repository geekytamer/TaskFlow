import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express, Response as ExpressResponse } from 'express';
import { HttpError } from '../http';
import { asRecord, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler, type AuthedRequest } from './shared';
import { assistantOps, describeOp, matchOp, searchOps, type AssistantOp } from '../assistant/catalogue';
import { runInSandbox, type SandboxHost } from '../assistant/sandbox';
import { runAgent, systemPrompt, toolText, cleanReply, withImplicitReturn, type AgentMode } from '../assistant/agent';
import { modelConfigFromEnv, openAiChat, ModelUnavailableError, type ChatFn, type ChatMessage } from '../assistant/model';
import { ROUTES } from '../authz/route-registry';
import { checkBody, hintFor, ignoredFilters, recordsIn, shapeOf } from '../assistant/hints';
import { cardOf, kindOfPath, type AssistantCard } from '../assistant/cards';
import { RECIPES, describeRecipe, recipeByName, searchRecipes } from '../assistant/recipes';
import { similarExamples } from '../assistant/examples';
import { DEFAULT_ASSISTANT_SETTINGS, ASSISTANT_ROLES, mayUseAssistant, parseAssistantSettings, type AssistantSettings } from '../assistant/settings';
import type { UserRole } from '../types';
import { applyEdits, areaOf, changesOf, docTypeOf, fieldsOf, inverseOf, type Inverse, type Namer, type ReviewChange } from '../assistant/review';
import { norm, pickOne, round, sameName } from '../assistant/recipes/util';
import { childIds, subtreeIds } from '../companies/tree';
import type { RecipeContext } from '../assistant/recipes';
import type { AssistantActionRow, AssistantThreadRow } from '../data/store';

/**
 * The in-app assistant (spec docs/superpowers/specs/2026-11-04-assistant-design.md).
 * The agent runs here; the model runs wherever AI_BASE_URL points. Every call a
 * script makes goes through this same API with the person's own session, so
 * permissions, approvals and validation are exactly theirs. Changes wait in
 * assistant_actions until the person confirms them from the chat.
 */
export interface AssistantOptions {
  /** Tests hand in a scripted model; otherwise AI_BASE_URL / AI_MODEL decide. */
  chat?: ChatFn;
  mode?: AgentMode;
  modelName?: string;
}

/** A stored message: the model's own shape plus what the chat screen needs. */
type FileRef = { id: string; name: string; mimeType: string; sizeBytes: number };
type ScreenContext = { path?: string; subject?: { kind: string; id: string; title: string } };

/** The page and record the person has open, from the chat request: checked, single-line, short; anything else is dropped. */
export function screenContextOf(raw: unknown): ScreenContext | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const flat = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\r\n`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const path = typeof r.path === 'string' && /^\/[\w\-/?=&.%]{0,199}$/.test(r.path) ? r.path : undefined;
  let subject: ScreenContext['subject'];
  if (r.subject && typeof r.subject === 'object') {
    const s = r.subject as Record<string, unknown>;
    const kind = flat(s.kind, 40);
    const id = flat(s.id, 80);
    const title = flat(s.title, 120);
    if (/^[a-z-]+$/.test(kind) && /^[\w-]+$/.test(id) && title) subject = { kind, id, title };
  }
  return path || subject ? { ...(path ? { path } : {}), ...(subject ? { subject } : {}) } : undefined;
}
type StoredMessage = ChatMessage & { ui?: {
  hidden?: true; actionIds?: string[]; cards?: AssistantCard[]; files?: FileRef[];
  /** What worked this turn: saved as a learned example once confirmed or marked helpful. */
  example?: { request: string; code: string; kind: 'read' | 'change'; savedId?: string };
  feedback?: 'up' | 'down';
  /** What was on the person's screen when they asked (the page, the record open). */
  context?: ScreenContext;
} };

/** What the assistant is doing right now, for the "working" line (polled by the chat screen). */
type Step = { kind: 'thinking' | 'search' | 'read' | 'prepare' | 'show' | 'run' | 'confirm'; detail?: string };

const FILE_TYPES = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel))$/;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Kinds of record a file can be attached to (server.ts recordEntityTypes). */
const ATTACHABLE = new Set(['contact', 'opportunity', 'vendor_request', 'commission', 'client', 'project', 'task', 'supplier', 'inventory_item', 'purchase_order', 'sales_order', 'invoice', 'vendor_bill', 'quotation', 'expense', 'employee', 'company', 'ledger_account', 'journal_entry', 'payment', 'vendor_payment', 'purchase_receipt', 'stock_movement']);

/** Arabic words for documents, so "شهادة راتب" finds "Salary certificate" (and the other way round). */
const DOC_WORDS: Record<string, string[]> = {
  'شهادة': ['certificate'], 'راتب': ['salary'], 'رواتب': ['salary'], 'خطاب': ['letter'], 'رسالة': ['letter'], 'تحذير': ['warning'], 'إنذار': ['warning'],
  'مذكرة': ['memo'], 'عرض': ['quote', 'offer'], 'تعريف': ['certificate', 'experience'], 'خبرة': ['experience'], 'عمل': ['employment', 'work'],
  'كشف': ['statement'], 'حساب': ['statement', 'account'], 'تعيين': ['appointment', 'offer'], 'إخلاء': ['clearance'], 'طرف': ['clearance'],
  certificate: ['شهادة'], salary: ['راتب'], letter: ['خطاب', 'رسالة'], warning: ['تحذير', 'إنذار'], memo: ['مذكرة'],
};

/** Global search's group names as card kinds: salesOrders → sales-order. */
const LOOKUP_KIND: Record<string, string> = { contacts: 'contact', invoices: 'invoice', salesOrders: 'sales-order', purchaseOrders: 'purchase-order', items: 'inventory-item', batches: 'batch', shipments: 'shipment', projects: 'project', tasks: 'task', employees: 'employee' };

/**
 * A change's path, made sound or refused: an id the script never had
 * ("undefined"), or a plural record kind on the attachments path (tasks → task).
 */
export function soundPath(path: string): string {
  const bare = path.split('?')[0];
  if (/\/(undefined|null|NaN|\[object Object\])(\/|$)/.test(bare)) throw new Error(`the path ${bare} has a missing id: find the record first (lookup('name') or a list endpoint) and use its id`);
  const m = /^(\/companies\/[^/]+\/records\/)([^/]+)(\/[^/]+\/attachments)$/.exec(bare);
  if (m) {
    let kind = m[2].replace(/-/g, '_');
    if (!ATTACHABLE.has(kind)) kind = kind.replace(/ies$/, 'y').replace(/s$/, '');
    if (!ATTACHABLE.has(kind)) throw new Error(`entityType ${m[2]} cannot take attachments; use one of ${[...ATTACHABLE].join(', ')}`);
    return `${m[1]}${kind}${m[3]}`;
  }
  return path;
}

const MAX_WRITES_PER_RUN = 25;
const MAX_CARDS = 30;
const ACTION_TTL_MS = 60 * 60 * 1000;
const READ_TIMEOUT_MS = 60_000;
/** A confirmed change gets longer: giving up early would report a change that went through as failed. */
const CHANGE_TIMEOUT_MS = 5 * 60_000;

/** The API did not answer in time; for a change, whether it happened is unknown. */
class NoAnswerError extends Error {}

export function registerAssistantRoutes(app: Express, ctx: RouteContext, options: AssistantOptions = {}): void {
  const { store, authMiddleware, requireCompanyAccess, allowsKey, requirePermission, accessibleCompanyIds } = ctx;
  const config = options.chat ? null : modelConfigFromEnv();
  const chat: ChatFn | null = options.chat ?? (config ? openAiChat(config) : null);
  const modelName = options.modelName ?? config?.model ?? null;
  const mode: AgentMode = options.mode ?? config?.toolMode ?? 'text';
  const legacyRolesOf = new Map(ROUTES.map((r) => [`${r.method} ${r.path}`, r.legacyRoles]));
  const ops = assistantOps();
  /** Names and currency for cards in a company. */
  const cardLookups = (companyId: string) => ({
    userName: (id: string) => store.getUserById(id)?.name,
    clientName: (id: string) => store.getClientById(id)?.name,
    projectName: (id: string) => store.getProjectById(id)?.name,
    currency: store.getCompanyFinanceSettings(companyId).currencyCode,
  });
  /** A person reads names, not ids, on a confirm card. */
  const namer: Namer = (key, value) => {
    const id = String(value);
    if (/user|assignee|owner|approver/i.test(key)) return store.getUserById(id)?.name;
    if (/client/i.test(key)) return store.getClientById(id)?.name;
    if (/project/i.test(key)) return store.getProjectById(id)?.name;
    if (/file/i.test(key)) return store.getAssistantFile(id)?.fileName;
    return undefined;
  };
  const UNDO_MS = 10 * 60 * 1000;
  /** The areas the assistant could change (Settings → Assistant offers these). */
  const changeAreasCatalogue = [...new Set(ops.filter((op) => op.method !== 'GET').map(areaOf))].sort();
  const settingsOf = (companyId: string): AssistantSettings => {
    // Unreadable settings fail closed: a company's restrictions never silently turn into "on, everything".
    try { return parseAssistantSettings(store.getAssistantSettingsRaw(companyId), changeAreasCatalogue, true); } catch { return { ...DEFAULT_ASSISTANT_SETTINGS, enabled: false }; }
  };
  const roleIn = (req: AuthedRequest, companyId: string): UserRole | undefined =>
    (req.user as { companyRoles?: Array<{ companyId: string; role: UserRole }> } | undefined)?.companyRoles?.find((r) => r.companyId === companyId)?.role ?? req.user?.role;
  type Covered = { id: string; name: string; currency: string };
  /**
   * The companies a conversation covers: its company, or (whole group) the group
   * company and every company under it that this person can open. A company they
   * cannot open is never read, named or written to.
   */
  const coverageOf = (req: AuthedRequest, thread: Pick<AssistantThreadRow, 'companyId' | 'scope'>): Covered[] => {
    const user = req.user!;
    let ids = [thread.companyId];
    if (thread.scope === 'group') {
      const reach = new Set(accessibleCompanyIds(user));
      // Each member company's own assistant settings still apply: switched off (or not for this role) there, it is left out.
      ids = subtreeIds(store.companyTreeNodes(), thread.companyId).filter((id) => id === thread.companyId
        || (reach.has(id) && mayUseAssistant(settingsOf(id), roleIn(req, id), Boolean(user.isSuperAdmin))));
    }
    return ids.map((id) => ({ id, name: store.getCompanyById(id)?.name ?? id, currency: store.getCompanyFinanceSettings(id).currencyCode }));
  };
  const isGroupCompany = (id: string) => childIds(store.companyTreeNodes(), id).length > 0;
  /** The company a call names (its path, its companyId query, or its body), if any. */
  const companyOfCall = (path: string, body: unknown): string | undefined => {
    const inPath = /^\/companies\/([^/?]+)/.exec(path);
    if (inPath) return decodeURIComponent(inPath[1]);
    const inQuery = /[?&]companyId=([^&]+)/.exec(path);
    if (inQuery) return decodeURIComponent(inQuery[1]);
    const fromBody = body && typeof body === 'object' && !Array.isArray(body) ? (body as { companyId?: unknown }).companyId : undefined;
    return typeof fromBody === 'string' ? fromBody : undefined;
  };

  /** The company's settings decide whether this person may use the assistant there at all. */
  const requireAssistantFor = (req: AuthedRequest, companyId: string) => {
    if (!mayUseAssistant(settingsOf(companyId), roleIn(req, companyId), Boolean(req.user?.isSuperAdmin))) {
      throw new HttpError(403, 'The assistant is turned off for you in this company.', { code: 'ASSISTANT_OFF' });
    }
  };
  const busy = new Set<string>();
  const progress = new Map<string, { userId: string; step: Step; at: number }>();
  /**
   * One request's live view for the person who asked (GET /assistant/stream/:requestId):
   * what it is doing and the answer as it is written. Kept apart from /live, which carries
   * topic names only, never data.
   */
  type StreamEvent = { type: 'step'; step: Step } | { type: 'reply'; text: string } | { type: 'done'; error?: string };
  interface LiveRequest { userId: string; clients: Set<ExpressResponse>; step?: Step; reply?: string; done?: { error?: string }; at: number; lastReplyAt: number; pendingReply?: ReturnType<typeof setTimeout> }
  const streams = new Map<string, LiveRequest>();
  const streamFor = (requestId: string, userId: string): LiveRequest | undefined => {
    let s = streams.get(requestId);
    if (!s) {
      if (streams.size > 300) for (const [k, v] of streams) if (!v.clients.size && Date.now() - v.at > (v.done ? 2 : 10) * 60_000) streams.delete(k);
      s = { userId, clients: new Set(), at: Date.now(), lastReplyAt: 0 };
      streams.set(requestId, s);
    }
    return s.userId === userId ? s : undefined;
  };
  const sendTo = (s: LiveRequest, event: StreamEvent) => {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const c of s.clients) { try { c.write(line); } catch { /* gone */ } }
    if (event.type === 'done') { for (const c of s.clients) { try { c.end(); } catch { /* gone */ } } s.clients.clear(); }
  };
  const emit = (requestId: string | undefined, userId: string, event: StreamEvent) => {
    if (!requestId) return;
    const s = streamFor(requestId, userId);
    if (!s) return;
    s.at = Date.now();
    if (event.type === 'step') s.step = event.step;
    if (event.type === 'reply') {
      // About 12 updates a second at most; the last one is never lost.
      s.reply = event.text;
      const wait = 80 - (Date.now() - s.lastReplyAt);
      if (wait > 0) {
        s.pendingReply ??= setTimeout(() => { s.pendingReply = undefined; s.lastReplyAt = Date.now(); sendTo(s, { type: 'reply', text: s.reply ?? '' }); }, wait);
        return;
      }
      s.lastReplyAt = Date.now();
    }
    if (event.type === 'done') {
      if (s.pendingReply) { clearTimeout(s.pendingReply); s.pendingReply = undefined; if (s.reply) sendTo(s, { type: 'reply', text: s.reply }); }
      s.done = { ...(event.error ? { error: event.error } : {}) };
    }
    sendTo(s, event);
  };
  const stepper = (req: AuthedRequest, requestId: string | undefined) => (step: Step) => {
    if (!requestId) return;
    emit(requestId, req.user!.id, { type: 'step', step });
    progress.set(requestId, { userId: req.user!.id, step, at: Date.now() });
    if (progress.size > 500) for (const [k, v] of progress) if (Date.now() - v.at > 5 * 60_000) progress.delete(k);
  };
  const requestIdOf = (body: Record<string, unknown>) => (typeof body.requestId === 'string' && /^[\w-]{8,64}$/.test(body.requestId) ? body.requestId : undefined);

  /** A file the person attached, theirs and in this company; throws otherwise. */
  const ownFile = (id: string, userId: string, companyId: string, withContent = false) => {
    const f = store.getAssistantFile(id, withContent);
    if (!f || f.userId !== userId || f.companyId !== companyId) throw new Error(`fileId ${id} is not a file the person attached here`);
    return f;
  };
  /** Ids a body refers to: { fileId } objects and "file:<id>" strings. */
  const fileIdsIn = (value: unknown, out: string[] = []): string[] => {
    if (typeof value === 'string' && value.startsWith('file:')) out.push(value.slice(5));
    else if (Array.isArray(value)) value.forEach((v) => fileIdsIn(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'fileId' && typeof v === 'string') out.push(v);
        else fileIdsIn(v, out);
      }
    }
    return out;
  };
  /** The body as the endpoint takes it: { fileId } becomes the attachment fields, "file:<id>" a data URL. */
  const withFiles = (value: unknown, userId: string, companyId: string): unknown => {
    if (typeof value === 'string' && value.startsWith('file:')) {
      const f = ownFile(value.slice(5), userId, companyId, true);
      return `data:${f.mimeType};base64,${f.content!.toString('base64')}`;
    }
    if (Array.isArray(value)) return value.map((v) => withFiles(v, userId, companyId));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === 'fileId' && typeof v === 'string') {
          const f = ownFile(v, userId, companyId, true);
          out.fileName ??= f.fileName;
          out.mimeType ??= f.mimeType;
          out.sizeBytes ??= f.sizeBytes;
          out.contentBase64 = f.content!.toString('base64');
        } else out[k] = withFiles(v, userId, companyId);
      }
      return out;
    }
    return value;
  };
  // The API answers the scripts on a private loopback port: the same stack, middleware and checks as the browser.
  let loopback: Promise<number> | undefined;
  const port = () => (loopback ??= new Promise<number>((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    server.unref();
  }));

  const tokenOf = (req: AuthedRequest) => String(req.headers.authorization ?? '').replace('Bearer ', '').trim();

  async function callApi(token: string, method: string, path: string, body: unknown, timeoutMs = READ_TIMEOUT_MS): Promise<unknown> {
    const p = await port();
    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${p}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-taskflow-assistant': '1' },
        ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Giving up waiting does not stop the handler: a change may still be made.
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new NoAnswerError(`no answer within ${Math.round(timeoutMs / 1000)}s`);
      throw err;
    }
    const type = response.headers.get('content-type') ?? '';
    const data: unknown = type.includes('application/json') ? await response.json().catch(() => null)
      : type.startsWith('text/') ? (await response.text()).slice(0, 20_000)
      : { file: type || 'binary', note: 'a file; open it in TaskFlow' };
    if (!response.ok) {
      const message = (data as { message?: string } | null)?.message ?? `HTTP ${response.status}`;
      const err = new Error(`${response.status} ${message}`) as Error & { status: number };
      err.status = response.status;
      throw err;
    }
    return data;
  }

  const allowedOp = (req: AuthedRequest, companyId: string, op: AssistantOp) =>
    op.permission === 'self' || op.permission === 'per_record' || allowsKey(req, companyId, op.permission, legacyRolesOf.get(`${op.method} ${op.path}`));

  function threadFor(req: AuthedRequest, id: string): AssistantThreadRow {
    const thread = store.getAssistantThread(id);
    if (!thread || thread.userId !== req.user!.id) throw new HttpError(404, 'Conversation not found');
    return thread;
  }

  /** Saves an example; the person's older one for the same request is replaced, so repeats do not crowd out the rest. */
  function saveExample(companyId: string, userId: string, request: string, code: string, kind: 'read' | 'change') {
    if (!settingsOf(companyId).learn) return { id: undefined };
    const key = norm(request);
    for (const old of store.listAssistantExamples(companyId, 1000, userId)) if (norm(old.request) === key) store.deleteAssistantExample(old.id);
    return store.createAssistantExample({ companyId, userId, request, code, kind });
  }

  function viewOf(thread: AssistantThreadRow) {
    const actions = store.listAssistantActions(thread.id);
    const now = Date.now();
    for (const a of actions) {
      if (a.status === 'pending' && now - Date.parse(a.createdAt) > ACTION_TTL_MS) {
        store.decideAssistantAction(a.id, 'expired', null);
        a.status = 'expired';
      }
    }
    const byId = new Map(actions.map((a) => [a.id, a]));
    const items: Array<{ role: 'user' | 'assistant'; ref?: number; feedback?: 'up' | 'down'; text: string; actions: ReturnType<typeof actionView>[]; cards: AssistantCard[]; suggestions?: string[]; files?: FileRef[] }> = [];
    let carried: string[] = [];
    let carriedCards: AssistantCard[] = [];
    (thread.messages as StoredMessage[]).forEach((m, ref) => {
      if (m.ui?.actionIds) carried.push(...m.ui.actionIds);
      if (m.ui?.cards) carriedCards.push(...m.ui.cards);
      if (m.ui?.hidden) return;
      if (m.role === 'user') items.push({ role: 'user', text: m.content.replace(/\n\n\[Attached files:[\s\S]*$/, ''), actions: [], cards: [], ...(m.ui?.files?.length ? { files: m.ui.files } : {}) });
      if (m.role === 'assistant' && !m.tool_calls?.length) {
        const { text, suggestions } = splitSuggestions(cleanReply(m.content));
        const own = carried.map((id) => byId.get(id)).filter((a): a is AssistantActionRow => Boolean(a)).map(actionView);
        carried = [];
        const shown = carriedCards;
        carriedCards = [];
        if (text || own.length || shown.length) items.push({ role: 'assistant', ref, text, actions: own, cards: shown, ...(suggestions.length ? { suggestions } : {}), ...(m.ui?.feedback ? { feedback: m.ui.feedback } : {}) });
      }
    });
    return {
      id: thread.id, title: thread.title, companyId: thread.companyId, scope: thread.scope ?? 'company', items,
      pending: actions.filter((a) => a.status === 'pending').length,
      working: busy.has(thread.id),
      error: failures.get(thread.id) ?? null,
    };
  }

  /** Before it runs: will Undo be possible afterwards? (A creation needs a matching DELETE; an edit, a record to read.) */
  const couldUndo = (a: AssistantActionRow, documented?: string) => {
    if (a.method === 'DELETE') return false;
    if (a.method === 'POST') return inverseOf(ops, a, null, { id: '__probe__' }) !== null;
    return Boolean(a.before) && inverseOf(ops, a, a.before, null, documented) !== null;
  };

  /** A proposed change as the person judges it: its fields, what it changes, what a delete takes, approvals, undo. */
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
      const current = view.steps.find((x) => x.status === 'pending');
      if (view.status === 'pending' && current) approval = { status: 'pending', waitingOn: current.approvers.map((x) => x.label) };
    }
    const decidedAt = a.decidedAt ? Date.parse(a.decidedAt) : 0;
    const undoUntil = a.status === 'done' && a.inverse && decidedAt ? new Date(decidedAt + UNDO_MS).toISOString() : undefined;
    const target = a.before && a.method === 'DELETE' ? cardOf(kind, a.before, cardLookups(a.companyId)) : null;
    return {
      id: a.id, method: a.method, path: a.path, summary: a.summary, status: a.status, body: a.body ?? null,
      error: a.status === 'failed' ? String((a.result as { error?: string } | null)?.error ?? '') : null,
      ...(a.status === 'pending' && a.method !== 'DELETE' ? { fields: fieldsOf(a.body, hint, namer) } : {}),
      ...(a.before && a.method !== 'DELETE' && a.method !== 'POST' ? { changes: changesOf(a.before, a.body, namer) } : {}),
      ...(target ? { target } : {}),
      undoable: a.status === 'done' || a.status === 'undone' ? Boolean(a.inverse) : couldUndo(a, hint?.text),
      ...(undoUntil && Date.parse(undoUntil) > Date.now() ? { undoUntil } : {}),
      ...(approval ? { approval } : {}),
      // Sends something out of TaskFlow (an email to a client): the card says so in plain words.
      ...(/\/email$/.test(a.path.split('?')[0]) ? { outward: 'email' as const } : {}),
      ...(Array.isArray(a.edited) && a.edited.length ? { edited: a.edited as ReviewChange[] } : {}),
    };
  };

  /** A document's blanks must be the template's: unknown keys or none filled are sent back to the model. */
  function checkDocument(body: unknown, companyId: string) {
    const b = (body ?? {}) as { templateId?: unknown; fieldValues?: unknown };
    const template = typeof b.templateId === 'string' ? store.getDocumentTemplateById(b.templateId) : undefined;
    if (!template || template.companyId !== companyId) throw new Error(`templateId is not a template of this company; read /companies/${companyId}/document-templates first`);
    const keys = (template.manualFields ?? []).map((f) => f.key);
    const given = b.fieldValues && typeof b.fieldValues === 'object' ? Object.keys(b.fieldValues as object) : [];
    const unknown = given.filter((k) => !keys.includes(k));
    if (unknown.length) throw new Error(`fieldValues has keys the template "${template.name}" does not have: ${unknown.join(', ')}. Its blanks: ${(template.manualFields ?? []).map((f) => `${f.key} (${f.label})`).join(', ') || 'none'}`);
    const missing = keys.filter((k) => !given.includes(k));
    if (missing.length && missing.length === keys.length) throw new Error(`fill the template's blanks in fieldValues: ${(template.manualFields ?? []).map((f) => `${f.key} (${f.label})`).join(', ')}. Ask the person for anything you do not know.`);
  }

  /** One turn of the agent on a thread: its messages are saved, its proposals recorded. */
  async function advance(req: AuthedRequest, thread: AssistantThreadRow, requestId?: string): Promise<void> {
    if (!chat) throw new HttpError(503, 'The assistant is not set up on this server (AI_BASE_URL and AI_MODEL).');
    const step = stepper(req, requestId);
    const user = req.user!;
    const token = tokenOf(req);
    const companyId = thread.companyId;
    const company = store.getCompanyById(companyId);
    const group = thread.scope === 'group';
    const covered = coverageOf(req, thread);
    const coveredIds = new Set(covered.map((c) => c.id));
    /** A call that names a company outside this conversation is refused (never naming it). */
    const inConversation = (target: string | undefined) => {
      if (target && !coveredIds.has(target)) {
        throw new Error(group
          ? 'That company is not part of this conversation: it is not among the companies of the group this person can open.'
          : `That company is not part of this conversation, which is about ${company?.name ?? 'one company'}. To work there, ask the person to switch the assistant to that company.`);
      }
    };
    const proposed: string[] = [];
    let lastOkCode: string | undefined;
    let proposingCode: string | undefined;
    let reads: string[] = [];
    let helperShapes: string[] = [];
    // Every record read this turn, by id, with its kind: show() needs only ids.
    const seen = new Map<string, { kind: string; record: Record<string, unknown> }>();
    const cards: AssistantCard[] = [];
    const lookups = cardLookups(companyId);
    const settings = settingsOf(companyId);
    const today = new Date().toISOString().slice(0, 10);
    const lastAsked = [...(thread.messages as StoredMessage[])].reverse().find((m) => m.role === 'user' && !m.ui?.hidden);
    const request = String(lastAsked?.content ?? '').replace(/\n\n\[Attached files:[\s\S]*$/, '');
    const lang = /[\u0600-\u06FF]/.test(request) ? 'ar' as const : 'en' as const;
    // Reads a recipe makes are its own business: the model gets the recipe's return, not "GET … → shape" notes.
    let recipeDepth = 0;
    const recipeContext = (host: SandboxHost, cid = companyId, prefix?: string): RecipeContext => ({
      companyId: cid, userId: user.id, today, currency: store.getCompanyFinanceSettings(cid).currencyCode, lang,
      get: <T>(path: string) => host.call('GET', path, undefined, undefined) as Promise<T>,
      // In the whole group the card says which company a change is for.
      propose: (method, path, body, summary) => host.call(method, path, body, prefix ? `${prefix} — ${summary}` : summary),
      names: { user: lookups.userName, client: lookups.clientName, project: lookups.projectName },
    });
    const remember = (kind: string, value: unknown) => {
      const add = (r: unknown) => {
        if (r && typeof r === 'object' && !Array.isArray(r) && 'id' in r) seen.set(String((r as { id: unknown }).id), { kind, record: r as Record<string, unknown> });
      };
      if (Array.isArray(value)) value.slice(0, 2000).forEach(add);
      else add(value);
    };

    /**
     * A helper over the whole group. A change runs in the one company it names
     * (`company`); a read runs in each covered company (or the one named), each
     * through the API as the person: lists merge with a `company` on every row,
     * summaries come per company with totals per currency (never mixed).
     */
    const runAcrossGroup = async (recipe: (typeof RECIPES)[number], body: unknown, host: SandboxHost): Promise<unknown> => {
      const args = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : undefined;
      const { company: named, ...rest } = args ?? {};
      const run1 = async (c: Covered, input: unknown, prefix?: string) => {
        recipeDepth += 1;
        try { return await recipe.run(recipeContext(host, c.id, prefix), input); } finally { recipeDepth -= 1; }
      };
      const missing = (v: unknown) => v === undefined || v === null || v === '';
      // A list of changes may name the company on each item ([{ title, company }]): each company gets its own items.
      if (recipe.changes && Array.isArray(body) && body.some((it) => it && typeof it === 'object' && !missing((it as { company?: unknown }).company))) {
        const byCompany = new Map<Covered, unknown[]>();
        for (const it of body as Array<Record<string, unknown>>) {
          if (!it || typeof it !== 'object' || missing(it.company)) throw new Error(`This conversation covers the whole group: say which company each item is for. Companies: ${covered.map((c) => c.name).join(', ')}.`);
          const { company, ...item } = it;
          const c = pickOne(covered, company, (x) => x.name, 'company');
          byCompany.set(c, [...(byCompany.get(c) ?? []), item]);
        }
        const out: unknown[] = [];
        for (const [c, list] of byCompany) {
          const value = await run1(c, list, c.name);
          out.push(...(Array.isArray(value) ? value : [value]));
        }
        return out;
      }
      if (recipe.changes) {
        if (missing(named)) {
          throw new Error(`This conversation covers the whole group: say which company the change is for, e.g. tf.${recipe.name}({ company: '${(covered[1] ?? covered[0]).name}', ... }). Companies: ${covered.map((c) => c.name).join(', ')}. If the person did not say, ask them.`);
        }
        const target = pickOne(covered, named, (c) => c.name, 'company');
        return run1(target, rest, target.name);
      }
      // One company named: its own answer, as in a company conversation (plus which company it is).
      if (!missing(named)) {
        const c = pickOne(covered, named, (x) => x.name, 'company');
        const value = await run1(c, rest);
        if (Array.isArray(value)) return value.map((row) => (row && typeof row === 'object' ? { ...(row as object), company: c.name } : row));
        return value && typeof value === 'object' ? { company: c.name, currency: c.currency, ...(value as object) } : value;
      }
      const scope = covered;
      recipeDepth += 1;
      let results: Array<{ c: Covered; value?: unknown; error?: string }>;
      try {
        results = await Promise.all(scope.map(async (c) => {
          try { return { c, value: await recipe.run(recipeContext(host, c.id), args ? rest : body) }; } catch (err) { return { c, error: err instanceof Error ? err.message : String(err) }; }
        }));
      } finally { recipeDepth -= 1; }
      const ok = results.filter((r) => r.error === undefined);
      const refused = results.filter((r) => r.error !== undefined && /\b403\b|permission/i.test(r.error));
      const failed = results.filter((r) => r.error !== undefined && !refused.includes(r));
      if (!ok.length) throw new Error(failed[0]?.error ?? refused[0]?.error ?? 'no company answered');
      if (refused.length) reads.push(`Not allowed for this person in: ${refused.map((r) => r.c.name).join(', ')} (left out of the answer).`);
      if (failed.length) reads.push(`In ${failed.map((r) => `${r.c.name}: ${r.error}`).join('; ')}`);
      if (ok.every((r) => Array.isArray(r.value))) {
        return ok.flatMap((r) => (r.value as unknown[]).map((row) => (row && typeof row === 'object' ? { ...(row as object), company: r.c.name } : row)));
      }
      const companies = ok.map((r) => (r.value && typeof r.value === 'object' && !Array.isArray(r.value)
        ? { company: r.c.name, currency: r.c.currency, ...(r.value as object) }
        : { company: r.c.name, value: r.value })) as Array<Record<string, unknown>>;
      const totalsByCurrency: Record<string, Record<string, number>> = {};
      for (const c of companies) {
        if (typeof c.currency !== 'string') continue;
        const totals = (totalsByCurrency[c.currency] ??= {});
        for (const [k, v] of Object.entries(c)) if (typeof v === 'number') totals[k] = round((totals[k] ?? 0) + v);
      }
      return { companies, totalsByCurrency };
    };

    const tools = {
      search: (query: string) => {
        step({ kind: 'search', detail: query.slice(0, 60) });
        const recipes = searchRecipes(query).map(describeRecipe);
        const found = searchOps(ops.filter((op) => allowedOp(req, companyId, op)), query).map(describeOp);
        const lines = [...recipes, ...found];
        return lines.length ? lines.join('\n') : 'nothing matched; try other words (English, singular, e.g. "invoice", "task", "client")';
      },
      run: async (code: string) => {
        reads = [];
        helperShapes = [];
        step({ kind: 'run' });
        const before = proposed.length;
        const cardsBefore = cards.length;
        // Closed once the script has ended (or timed out): a host call still in flight
        // (makeDocument's template read) must not leave a proposal no message shows.
        let open = true;
        const host: SandboxHost = {
        call: async (method, path, body, summary) => {
          if (method === 'DOC') {
            if (group) throw new Error('Documents are made in one company: ask the person to switch the assistant to that company.');
            // makeDocument(templateName, fields, summary): the template by name, blanks by key or label.
            const { template: wantedName, fields } = (body ?? {}) as { template?: unknown; fields?: unknown };
            const templates = await callApi(token, 'GET', `/companies/${encodeURIComponent(companyId)}/document-templates`, undefined) as Array<{ id: string; name: string; manualFields?: Array<{ key: string; label: string }> }>;
            const want = String(wantedName ?? '').toLowerCase().trim();
            const words = want.split(/\s+/).filter((w) => w.length > 2).flatMap((w) => [w, ...(DOC_WORDS[w.replace(/^ال/, '')] ?? [])]);
            const scored = templates.map((t) => {
              const name = t.name.toLowerCase();
              return { t, score: t.id === want ? 100 : name === want ? 50 : words.filter((w) => name.includes(w)).length };
            }).sort((x, y) => y.score - x.score);
            const pick = scored[0]?.score ? scored[0].t : undefined;
            if (!pick) throw new Error(`no template matches "${wantedName}". Templates: ${templates.map((t) => t.name).join(', ') || 'none yet (they are made in Documents)'}`);
            const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
            const fieldValues: Record<string, string> = {};
            for (const [k, v] of Object.entries((fields ?? {}) as Record<string, unknown>)) {
              const blank = (pick.manualFields ?? []).find((f) => norm(f.key) === norm(k) || norm(f.label) === norm(k));
              fieldValues[blank?.key ?? k] = String(v ?? '');
            }
            return host.call('POST', `/companies/${encodeURIComponent(companyId)}/documents`, { templateId: pick.id, fieldValues }, typeof summary === 'string' && summary ? summary : `Make the document: ${pick.name}`);
          }
          if (method === 'RECIPE') {
            const recipe = recipeByName(path);
            if (!recipe) throw new Error(`tf.${path} does not exist; there are: ${RECIPES.map((r) => r.name).join(', ')}`);
            if (body && typeof body === 'object' && !Array.isArray(body)) {
              // 'summary' is the raw-change habit: harmless, recipes write their own.
              const unknown = Object.keys(body).filter((k) => k !== 'summary' && !(group && k === 'company') && !recipe.params.includes(k));
              if (unknown.length) throw new Error(`tf.${recipe.name} does not take ${unknown.map((k) => `"${k}"`).join(', ')}; it takes: ${recipe.params.join(', ') || 'nothing'}`);
            }
            step({ kind: recipe.changes ? 'prepare' : 'read', detail: recipe.name });
            const outer = recipeDepth === 0;
            let value: unknown;
            if (group) value = await runAcrossGroup(recipe, body, host);
            else {
              recipeDepth += 1;
              try { value = await recipe.run(recipeContext(host), body); } finally { recipeDepth -= 1; }
            }
            // Kept for a script that ends up returning nothing: usually a field name that is not there (r.byClient[0].name for .client).
            if (outer && helperShapes.length < 4) helperShapes.push(`tf.${recipe.name} → ${shapeOf(value)}`);
            return value;
          }
          if (method === 'SEARCH') return tools.search(path).split('\n');
          if (method === 'LOOKUP') {
            // Any record by name or number, through global search (which applies the person's permissions).
            step({ kind: 'search', detail: path.slice(0, 60) });
            // In the whole group, each company the person can open is searched; every hit says its company.
            const searched = await Promise.all(covered.map(async (c) => ({
              c,
              groups: await callApi(token, 'GET', `/companies/${encodeURIComponent(c.id)}/search?q=${encodeURIComponent(path.slice(0, 100))}`, undefined).catch(() => []) as Array<{ type: string; items: Array<{ id: string; title: string; subtitle?: string }> }>,
            })));
            const found: Array<Record<string, unknown> & { kind: string; id: string; title: string; subtitle?: string }> = searched.flatMap(({ c, groups }) => (groups ?? []).flatMap((g) => g.items.map((i) => ({
              kind: LOOKUP_KIND[g.type] ?? kindOfPath(`/${g.type}`), id: i.id, title: i.title, ...(i.subtitle ? { subtitle: i.subtitle } : {}), ...(group ? { company: c.name } : {}),
            }))));
            // A person found by name comes with how to reach them ("what is Ahmed's phone?"), from the contacts list the person may read.
            // A name typed in the other script ("أحمد البلوشي" for "Ahmed Al Balushi") is not seen by search: matched by sound against the contacts.
            const nameLike = !/\d/.test(path) && path.trim().split(/\s+/).length <= 4;
            for (const c of covered) {
              const hits = found.filter((f) => f.kind === 'contact' && (!group || f.company === c.name));
              if (!hits.length && !nameLike) continue;
              const list = await callApi(token, 'GET', `/companies/${encodeURIComponent(c.id)}/contacts`, undefined).catch(() => []) as Array<{ id: string; name?: string; kind?: string; phone?: string; email?: string }>;
              const rows = Array.isArray(list) ? list : [];
              if (!hits.length) {
                for (const r of rows.filter((x) => x.name && sameName(path, x.name)).slice(0, 5)) {
                  const f = { kind: 'contact', id: r.id, title: String(r.name), ...(r.kind ? { subtitle: r.kind } : {}), ...(group ? { company: c.name } : {}) };
                  found.push(f);
                  hits.push(f);
                }
              }
              const byId = new Map(rows.map((r) => [r.id, r]));
              for (const f of hits) {
                const r = byId.get(f.id);
                if (r?.phone) f.phone = r.phone;
                if (r?.email) f.email = r.email;
              }
            }
            // Document templates by name too, with their blanks: what a letter or certificate needs.
            const words = path.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
            const templates = await callApi(token, 'GET', `/companies/${encodeURIComponent(companyId)}/document-templates`, undefined).catch(() => []) as Array<{ id: string; name: string; type?: string; dataSource?: string; manualFields?: Array<{ key: string; label: string }> }>;
            const wanted = /template|letter|certificate|memo|document|خطاب|شهادة|قالب|مستند/i.test(path);
            for (const t of templates ?? []) {
              const name = t.name.toLowerCase();
              if (wanted || words.some((w) => name.includes(w))) {
                found.push({ kind: 'document-template', id: t.id, title: t.name, subtitle: t.type ?? '', dataSource: t.dataSource ?? 'none', blanks: t.manualFields ?? [] });
              }
            }
            for (const f of found) if (!seen.has(f.id)) seen.set(f.id, { kind: f.kind, record: { id: f.id, title: f.title, ...(f.subtitle ? { subtitle: f.subtitle } : {}) } });
            return found;
          }
          if (method === 'SHOW') {
            step({ kind: 'show' });
            const { rows, kind } = (body ?? {}) as { rows?: unknown; kind?: unknown };
            const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
            let shown = 0;
            for (const row of list) {
              if (cards.length >= MAX_CARDS || !row || typeof row !== 'object') continue;
              const id = String((row as { id?: unknown }).id ?? '');
              const known = id ? seen.get(id) : undefined;
              const card = cardOf(typeof kind === 'string' && kind ? kindOfPath(kind) : known?.kind ?? 'record', { ...(known?.record ?? {}), ...(row as Record<string, unknown>) }, lookups);
              if (card && !cards.some((c) => c.id === card.id && c.kind === card.kind)) { cards.push(card); shown += 1; }
            }
            return { shown, note: shown ? 'shown to the person as cards; do not list them again in your answer' : 'nothing shown: pass records that have an id' };
          }
          if (method !== 'GET') path = soundPath(path);
          inConversation(companyOfCall(path, method === 'GET' ? undefined : body));
          const op = matchOp(ops, method, path);
          if (!op) throw new Error(`${method} ${path.split('?')[0]} is not a TaskFlow endpoint you can use; find one with findApi('words')`);
          if (method === 'GET') {
            step({ kind: 'read', detail: kindOfPath(op.path) });
            let value = await callApi(token, method, path, undefined);
            // Some lists answer for every company the person can see (GET /tasks ignores companyId): keep this conversation's rows;
            // a single record of another company is refused like a named one.
            const companyOfRow = (r: unknown) => (r && typeof r === 'object' && typeof (r as { companyId?: unknown }).companyId === 'string' ? (r as { companyId: string }).companyId : undefined);
            if (Array.isArray(value)) {
              const kept = value.filter((r) => { const c = companyOfRow(r); return !c || coveredIds.has(c); });
              if (kept.length !== value.length && recipeDepth === 0) reads.push(`GET ${path.split('?')[0]}: ${value.length - kept.length} row(s) of companies outside this conversation were left out.`);
              value = kept;
            } else {
              inConversation(companyOfRow(value));
            }
            remember(kindOfPath(op.path), value);
            if (recipeDepth === 0) {
              if (reads.length < 6) reads.push(`GET ${path} → ${shapeOf(value)}`);
              const ignored = ignoredFilters(path, value);
              if (ignored.length) reads.push(`WARNING: GET ${path} ignored the filter ${ignored.join(', ')}: the rows include other values, so this list is NOT filtered. Drop the filter and filter in code (e.g. rows.filter(r => ...)).`);
              if (Array.isArray(value) && value.length === 0 && path.includes('?')) reads.push(`GET ${path} is empty: a query filter may not exist or may not match. Try without filters and filter in code before concluding there is nothing.`);
            }
            return value;
          }
          body = idsAsStrings(body);
          const refused = checkBody(hintFor(op.method, op.path), body);
          if (refused) throw new Error(refused);
          for (const id of fileIdsIn(body)) ownFile(id, user.id, companyId);
          if (op.method === 'POST' && op.path === '/companies/:companyId/documents') checkDocument(body, companyId);
          step({ kind: 'prepare', detail: (summary ?? '').slice(0, 80) });
          if (!open) throw new Error('the script has already ended');
          // The company the change lands in: its settings apply, and it must be one of this conversation's.
          let target = companyOfCall(path, body) ?? companyId;
          const targetSettings = target === companyId ? settings : settingsOf(target);
          if (target !== companyId && !mayUseAssistant(targetSettings, roleIn(req, target), Boolean(user.isSuperAdmin))) {
            throw new Error(`The assistant is turned off for this person in ${store.getCompanyById(target)?.name ?? 'that company'}; they can make the change in TaskFlow itself.`);
          }
          const area = areaOf(op);
          if (targetSettings.changeAreas && !targetSettings.changeAreas.includes(area)) throw new Error(`Changes to ${area} through the assistant are turned off in this company; the person can do it in TaskFlow itself.`);
          const most = Math.min(targetSettings.maxChanges, MAX_WRITES_PER_RUN);
          if (proposed.length >= most) throw new Error(`at most ${most} changes at once`);
          // What the change touches, read now as the person: the card shows before → after, a delete shows what goes.
          let before: Record<string, unknown> | null = null;
          if (method !== 'POST' && matchOp(ops, 'GET', path)) {
            try {
              const read = await callApi(token, 'GET', path.split('?')[0], undefined);
              if (read && typeof read === 'object' && !Array.isArray(read)) before = read as Record<string, unknown>;
            } catch { /* no snapshot: the card shows the fields only */ }
          }
          // A record of another company, edited or deleted from here: refused like a named one.
          if (before && typeof before.companyId === 'string') { inConversation(before.companyId); target = before.companyId; }
          const action = store.createAssistantAction({
            threadId: thread.id, userId: user.id, companyId: target, method, path, body,
            summary: (summary ?? `${method} ${path}`).slice(0, 300), before, area,
          });
          proposed.push(action.id);
          return { pending: true, actionId: action.id, summary: action.summary, note: 'waiting for the person to confirm' };
        },
        };
        const outcome = await runInSandbox(withImplicitReturn(code), host, undefined, { globals: { COMPANY_ID: companyId, ME: user.id, TODAY: today }, json: { COMPANIES: covered }, recipes: RECIPES.map((r) => r.name) }).finally(() => { open = false; });
        if (outcome.ok) {
          lastOkCode = code;
          if (proposed.length > before) proposingCode = code;
        } else if (proposed.length > before) {
          // A script that failed proposes nothing: half a batch would confuse, and the corrected retry would double it.
          for (const id of proposed.splice(before)) store.decideAssistantAction(id, 'expired', null);
        }
        // Records the script returned but did not show() still reach the person as cards.
        if (outcome.ok && cards.length === cardsBefore) {
          for (const r of recordsIn(outcome.value).slice(0, MAX_CARDS)) {
            const known = seen.get(String(r.id));
            if (!known) continue;
            const card = cardOf(known.kind, { ...known.record, ...r }, lookups);
            if (card && !cards.some((c) => c.id === card.id && c.kind === card.kind)) cards.push(card);
          }
        }
        // What the model needs for its next step: the real field names, and that changes are not done.
        const notes: string[] = [...reads];
        // Records shown as cards are an answer in themselves: only a script that showed nothing and returned nothing is pointed out.
        // A list read as one record ({ inStock: item?.inStock } on an array) comes back with every field missing.
        const hollow = outcome.ok && outcome.value !== null && typeof outcome.value === 'object' && !Array.isArray(outcome.value)
          && Object.values(outcome.value as object).every((x) => x === undefined || x === null);
        if (outcome.ok && (((outcome.value === null || outcome.value === undefined) && cards.length === cardsBefore) || (hollow && helperShapes.length))) notes.push(helperShapes.length
          ? `The script returned nothing: a field you used may not exist. The helpers returned: ${helperShapes.join('; ')}. Use those field names.`
          : 'The script returned nothing. Write top-level code (no wrapper function) and end with `return <value>`.');
        if (cards.length > cardsBefore) notes.push(`${cards.length - cardsBefore} record(s) shown to the person as cards; do not list them again in your answer.`);
        const fresh = proposed.slice(before).map((id) => store.getAssistantAction(id)?.summary).filter(Boolean);
        if (fresh.length) notes.push(`NOT DONE YET — proposed for the person to confirm: ${fresh.join('; ')}. Tell them to confirm below; do not say it is done.`);
        return notes.length ? { ...outcome, logs: [...outcome.logs, ...notes] } : outcome;
      },
    };

    const history = (thread.messages as StoredMessage[]).map(({ ui: _ui, ...m }) => m as ChatMessage);
    // The person's own examples only: another person's code may hold figures they may not see, and their words are not this person's instructions.
    const examples = settings.learn ? similarExamples(request, store.listAssistantExamples(companyId, 300, user.id)) : [];
    if (examples.length) store.touchAssistantExamples(examples.map((e) => e.id));
    const system = systemPrompt({
      userName: user.name,
      userId: user.id,
      today,
      company: { id: companyId, name: company?.name ?? companyId, currency: store.getCompanyFinanceSettings(companyId).currencyCode },
      companies: accessibleCompanyIds(user).map((id) => ({ id, name: store.getCompanyById(id)?.name ?? id })),
      areas: [...new Set(ops.filter((op) => op.method === 'GET' && op.permission.includes('.') && allowedOp(req, companyId, op)).map((op) => op.permission.split('.')[0]))].sort(),
      files: (thread.messages as StoredMessage[]).flatMap((m) => m.ui?.files ?? []),
      ...(lastAsked?.ui?.context ? { onScreen: lastAsked.ui.context } : {}),
      ...(group ? { group: { name: company?.name ?? companyId, companies: covered } } : {}),
      // A helper is available when every route it calls is allowed for this person in some covered company.
      unavailable: RECIPES.filter((r) => !covered.some((c) => r.needs.every(([m, p]) => {
        const op = ops.find((o) => o.method === m && o.path === p);
        return op ? allowedOp(req, c.id, op) : false;
      }))).map((r) => r.name),
      examples,
    }, mode);
    let outcome;
    try {
      const thinking: ChatFn = (m, t, onDelta) => { step({ kind: 'thinking' }); return chat(m, t, onDelta); };
      outcome = await runAgent(thinking, system, history, tools, 8, mode, { onReply: (text) => emit(requestId, user.id, { type: 'reply', text }) });
    } catch (err) {
      // The turn is lost, so are the messages that would show its proposals: none may linger as pending.
      for (const id of proposed) store.decideAssistantAction(id, 'expired', null);
      progress.delete(requestId ?? '');
      if (err instanceof ModelUnavailableError) throw new HttpError(503, err.message, { code: 'ASSISTANT_OFFLINE' });
      throw err;
    }
    progress.delete(requestId ?? '');
    const added = outcome.added as StoredMessage[];
    const last = added[added.length - 1];
    if (proposed.length) last.ui = { ...(last.ui ?? {}), actionIds: proposed };
    if (cards.length) last.ui = { ...(last.ui ?? {}), cards };
    // What worked this turn, kept on the answer: saved as an example once confirmed (or marked helpful).
    const exampleCode = proposingCode ?? lastOkCode;
    // After a decision the turn only reports back: its code is not what the person asked for.
    const followUp = (thread.messages.at(-1) as StoredMessage | undefined)?.ui?.hidden === true;
    if (exampleCode && request && !followUp && outcome.reply && !/^I stopped after too many steps/.test(outcome.reply)) {
      last.ui = { ...(last.ui ?? {}), example: { request: request.slice(0, 500), code: exampleCode, kind: proposingCode ? 'change' : 'read' } };
    }
    store.saveAssistantMessages(thread.id, [...thread.messages, ...added]);
  }

  /** Why the last background turn on a thread failed, until the next one starts. */
  const failures = new Map<string, { status: number; message: string }>();

  /**
   * One turn at a time per thread. With `background` the request answers 202 at
   * once (the thread, working: true) and the chat screen polls the thread until
   * it is done, so a slow model never meets a proxy's read timeout.
   */
  async function turn(res: ExpressResponse, threadId: string, background: boolean, fn: () => Promise<void>, live?: { requestId?: string; userId: string }): Promise<void> {
    if (busy.has(threadId)) throw new HttpError(409, 'The assistant is still working on this conversation.');
    busy.add(threadId);
    failures.delete(threadId);
    const work = (async () => {
      try {
        await fn();
        if (live) emit(live.requestId, live.userId, { type: 'done' });
      } catch (err) {
        if (live) emit(live.requestId, live.userId, { type: 'done', error: err instanceof Error ? err.message : String(err) });
        if (!background) throw err;
        failures.set(threadId, { status: err instanceof HttpError ? err.status : 500, message: err instanceof Error ? err.message : String(err) });
      } finally { busy.delete(threadId); }
    })();
    if (!background) {
      await work;
      res.json(viewOf(store.getAssistantThread(threadId)!));
      return;
    }
    void work;
    res.status(202).json(viewOf(store.getAssistantThread(threadId)!));
  }

  app.get('/assistant/status', authMiddleware, handler((_req, res) => {
    res.json({ enabled: Boolean(chat), model: modelName });
  }));

  /** The live view of one of your requests: step, the answer so far, done (Server-Sent Events, read with fetch). */
  app.get('/assistant/stream/:requestId', authMiddleware, (req: AuthedRequest, res: ExpressResponse) => {
    const requestId = req.params.requestId;
    const userId = req.user!.id;
    // Like /live: a few open streams per person, and no hoard of entries for requests that never come.
    const mine = [...streams.values()].filter((x) => x.userId === userId);
    if (mine.reduce((n, x) => n + x.clients.size, 0) >= 8 || (!streams.has(requestId) && mine.length >= 50)) {
      res.status(429).json({ message: 'Too many assistant streams open.' });
      return;
    }
    const s = /^[\w-]{8,64}$/.test(requestId) ? streamFor(requestId, userId) : undefined;
    if (!s) { res.status(404).json({ message: 'Not found' }); return; }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    const write = (event: StreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (s.step) write({ type: 'step', step: s.step });
    if (s.reply) write({ type: 'reply', text: s.reply });
    if (s.done) { write({ type: 'done', ...s.done }); res.end(); return; }
    s.clients.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    heartbeat.unref?.();
    const stop = () => { clearInterval(heartbeat); s.clients.delete(res); };
    req.on('close', stop);
    res.on('close', stop);
  });

  app.get('/assistant/threads', authMiddleware, handler((req, res) => {
    res.json(store.listAssistantThreads(req.user!.id));
  }));

  app.get('/assistant/threads/:id', authMiddleware, handler((req, res) => {
    res.json(viewOf(threadFor(req, req.params.id)));
  }));

  app.delete('/assistant/threads/:id', authMiddleware, handler((req, res) => {
    store.deleteAssistantThread(threadFor(req, req.params.id).id);
    res.status(204).end();
  }));

  /** A file for the next message: an image, PDF or office file, kept for filing on a record. */
  app.post('/assistant/files', authMiddleware, handler((req, res) => {
    const body = asRecord(req.body, 'body');
    const companyId = requiredString(body.companyId, 'companyId');
    requireCompanyAccess(req, companyId);
    const fileName = requiredString(body.fileName, 'fileName').replace(/[\\/]/g, '_');
    const mimeType = requiredString(body.mimeType, 'mimeType').toLowerCase();
    if (!FILE_TYPES.test(mimeType)) throw new HttpError(415, 'Attach an image, a PDF, or a Word, Excel, text or CSV file.');
    const raw = requiredString(body.contentBase64, 'contentBase64');
    const content = Buffer.from(raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw, 'base64');
    if (content.length === 0) throw new HttpError(400, 'The file is empty.');
    if (content.length > MAX_FILE_BYTES) throw new HttpError(413, 'Files can be up to 20 MB.');
    const f = store.createAssistantFile({ userId: req.user!.id, companyId, fileName, mimeType, content });
    res.status(201).json({ id: f.id, name: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
  }));

  /** One of your attached files (thumbnails in the chat). */
  app.get('/assistant/files/:id', authMiddleware, handler((req, res) => {
    const f = store.getAssistantFile(req.params.id, true);
    if (!f || f.userId !== req.user!.id) throw new HttpError(404, 'File not found');
    res.setHeader('content-type', f.mimeType);
    res.setHeader('cache-control', 'private, max-age=3600');
    res.send(f.content);
  }));

  /** What the assistant is doing for one of your requests right now. */
  app.get('/assistant/progress/:requestId', authMiddleware, handler((req, res) => {
    const p = progress.get(req.params.requestId);
    if (!p || p.userId !== req.user!.id) return res.json({ step: null });
    res.json({ step: p.step });
  }));

  /** Ask: a new conversation (companyId) or the next message in one (threadId). */
  app.post('/assistant/chat', authMiddleware, handler(async (req, res) => {
    const body = asRecord(req.body, 'body');
    const message = requiredString(body.message, 'message').slice(0, 4000);
    let thread: AssistantThreadRow;
    if (typeof body.threadId === 'string' && body.threadId) {
      thread = threadFor(req, body.threadId);
    } else {
      const companyId = requiredString(body.companyId, 'companyId');
      requireCompanyAccess(req, companyId);
      requireAssistantFor(req, companyId);
      // 'group': the whole group under this company (the companies under it this person can open).
      const scope = body.scope === 'group' ? 'group' as const : 'company' as const;
      if (scope === 'group' && !isGroupCompany(companyId)) throw new HttpError(400, 'This company is not a group: there are no companies under it.');
      thread = store.createAssistantThread({ userId: req.user!.id, companyId, scope, title: message.replace(/\s+/g, ' ').slice(0, 80) });
    }
    requireCompanyAccess(req, thread.companyId);
    requireAssistantFor(req, thread.companyId);
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.map(String).slice(0, 5) : [];
    const files: FileRef[] = fileIds.map((id) => {
      try {
        const f = ownFile(id, req.user!.id, thread.companyId);
        return { id: f.id, name: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes };
      } catch { throw new HttpError(400, 'An attached file was not found.'); }
    });
    const content = files.length
      ? `${message}\n\n[Attached files: ${files.map((f) => `"${f.name}" (${f.mimeType}, ${Math.ceil(f.sizeBytes / 1024)} KB) fileId: ${f.id}`).join('; ')}]`
      : message;
    await turn(res, thread.id, body.background === true, async () => {
      // Anything still waiting is set aside: the person moved on.
      for (const a of store.listAssistantActions(thread.id)) if (a.status === 'pending') store.decideAssistantAction(a.id, 'expired', null);
      const context = screenContextOf(body.context);
      thread.messages = [...thread.messages, { role: 'user', content, ...(files.length || context ? { ui: { ...(files.length ? { files } : {}), ...(context ? { context } : {}) } } : {}) } as StoredMessage];
      store.saveAssistantMessages(thread.id, thread.messages);
      await advance(req, thread, requestIdOf(body));
    }, { requestId: requestIdOf(body), userId: req.user!.id });
  }));

  /**
   * The person's answer to proposed changes. Confirmed ones run now, in order,
   * through the API as the person; once nothing is waiting, the assistant hears
   * how they went and carries on.
   */
  app.post('/assistant/threads/:id/decide', authMiddleware, handler(async (req, res) => {
    const thread = threadFor(req, req.params.id);
    requireCompanyAccess(req, thread.companyId);
    requireAssistantFor(req, thread.companyId);
    const body = asRecord(req.body, 'body');
    const confirm = Array.isArray(body.confirm) ? body.confirm.map(String) : [];
    const decline = Array.isArray(body.decline) ? body.decline.map(String) : [];
    if (!confirm.length && !decline.length) throw new HttpError(400, 'confirm or decline is required');
    const token = tokenOf(req);
    const step = stepper(req, requestIdOf(body));
    // The person's edits, all checked before anything runs: one bad edit refuses the whole decision.
    const edits = body.edits && typeof body.edits === 'object' && !Array.isArray(body.edits) ? body.edits as Record<string, unknown> : {};
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
      const edited = changesOf(a.body as Record<string, unknown>, next, namer);
      if (edited.length) editedBodies.set(actionId, { body: next, edited });
    }
    await turn(res, thread.id, body.background === true, async () => {
      const report: string[] = [];
      const made: AssistantCard[] = [];
      const lookups = cardLookups(thread.companyId);
      for (const id of decline) {
        const a = store.getAssistantAction(id);
        if (a && a.threadId === thread.id && store.decideAssistantAction(id, 'declined', null)) report.push(`Declined: ${a.summary}`);
      }
      for (const id of confirm) {
        const a = store.getAssistantAction(id);
        if (!a || a.threadId !== thread.id || a.userId !== req.user!.id) continue;
        if (Date.now() - Date.parse(a.createdAt) > ACTION_TTL_MS) { store.decideAssistantAction(id, 'expired', null); continue; }
        if (!store.claimAssistantAction(id)) continue;
        const edit = editedBodies.get(id);
        if (edit) { store.editAssistantAction(id, edit.body, edit.edited); a.body = edit.body; }
        try {
          step({ kind: 'confirm', detail: a.summary.slice(0, 80) });
          // The record as it is now, right before the change: undo puts back this, not what it was when proposed.
          let liveBefore = a.before ?? null;
          if ((a.method === 'PUT' || a.method === 'PATCH') && matchOp(ops, 'GET', a.path)) {
            liveBefore = await callApi(token, 'GET', a.path.split('?')[0], undefined).then((r) => (r && typeof r === 'object' && !Array.isArray(r) ? r as Record<string, unknown> : liveBefore)).catch(() => liveBefore);
          }
          const result = await callApi(token, a.method, a.path, withFiles(a.body, req.user!.id, thread.companyId), CHANGE_TIMEOUT_MS);
          store.decideAssistantAction(id, 'done', result);
          // How to take it back, for 10 minutes (none for a delete, or where the API has no matching call).
          const opDone = matchOp(ops, a.method, a.path);
          const inverse = inverseOf(ops, { method: a.method, path: a.path, body: a.body }, liveBefore, result, opDone ? hintFor(opDone.method, opDone.path)?.text : undefined);
          if (inverse) store.setAssistantActionInverse(id, inverse);
          // What was just made is shown as a card with its link (a task, a document, a contact...).
          const op = a.method === 'POST' ? matchOp(ops, a.method, a.path) : undefined;
          if (op && result && typeof result === 'object' && !Array.isArray(result) && 'id' in result) {
            const card = cardOf(kindOfPath(op.path), result as Record<string, unknown>, lookups);
            if (card && made.length < MAX_CARDS) made.push(card);
          }
          const editedNote = edit ? ` (the person edited it first: ${edit.edited.map((c) => `${c.label} ${c.from} → ${c.to}`).join(', ')})` : '';
          report.push(`Done: ${a.summary}${editedNote} → ${toolText(result).slice(0, 1500)}`);
        } catch (err) {
          if (err instanceof NoAnswerError) {
            // It may well have been done: say so, so neither the person nor the model simply does it again.
            const error = `${err.message}; it may still have been done — check before trying again`;
            store.decideAssistantAction(id, 'failed', { error, unknown: true });
            report.push(`Unknown: ${a.summary} → ${error}. Read the record (or list) to see whether it exists before proposing it again.`);
            continue;
          }
          const error = err instanceof Error ? err.message : String(err);
          store.decideAssistantAction(id, 'failed', { error });
          report.push(`Failed: ${a.summary} → ${error}`);
        }
      }
      const fresh = store.getAssistantThread(thread.id)!;
      // A change that was confirmed and went through: the request and its code become an example.
      const doneIds = new Set(store.listAssistantActions(thread.id).filter((a) => a.status === 'done').map((a) => a.id));
      fresh.messages = (fresh.messages as StoredMessage[]).map((m) => {
        const ex = m.ui?.example;
        if (!ex || ex.kind !== 'change' || ex.savedId || !m.ui?.actionIds?.some((id) => doneIds.has(id))) return m;
        const saved = saveExample(thread.companyId, req.user!.id, ex.request, ex.code, 'change');
        return { ...m, ui: { ...m.ui, example: { ...ex, savedId: saved.id } } } as StoredMessage;
      });
      const waiting = store.listAssistantActions(thread.id).some((a) => a.status === 'pending');
      if (report.length) {
        fresh.messages = [...fresh.messages, { role: 'user', content: `[The person decided on the proposed changes]\n${report.join('\n')}${made.length ? '\n(The new records are shown to the person as cards.)' : ''}`, ui: { hidden: true, ...(made.length ? { cards: made } : {}) } }];
        store.saveAssistantMessages(fresh.id, fresh.messages);
      }
      // Carry on only after a confirmation and when nothing else waits; a decline needs no answer.
      if (!waiting && report.some((r) => !r.startsWith('Declined')) && chat) {
        await advance(req, fresh, requestIdOf(body)).catch((err) => {
          if (err instanceof HttpError && err.status === 503) return; // the changes ran; the follow-up can wait
          throw err;
        });
      }
    }, { requestId: requestIdOf(body), userId: req.user!.id });
  }));

  /** Takes back a change made in the last 10 minutes: its inverse runs through the API as the person. */
  app.post('/assistant/threads/:id/undo', authMiddleware, handler(async (req, res) => {
    const thread = threadFor(req, req.params.id);
    requireCompanyAccess(req, thread.companyId);
    // No settings check: taking back one's own change stays possible when the assistant is switched off.
    const actionId = requiredString(asRecord(req.body, 'body').actionId, 'actionId');
    await turn(res, thread.id, false, async () => {
      const a = store.getAssistantAction(actionId);
      if (!a || a.threadId !== thread.id || a.userId !== req.user!.id) throw new HttpError(404, 'Change not found');
      const inverse = a.inverse as Inverse | null | undefined;
      const late = !a.decidedAt || Date.now() - Date.parse(a.decidedAt) > UNDO_MS;
      if (a.status !== 'done' || !inverse) throw new HttpError(409, 'This change cannot be undone.');
      if (late) throw new HttpError(409, 'Undo is only possible for 10 minutes after a change.');
      if (!store.markAssistantActionUndone(a.id)) throw new HttpError(409, 'This change cannot be undone.');
      try {
        await callApi(tokenOf(req), inverse.method, inverse.path, inverse.body, CHANGE_TIMEOUT_MS);
      } catch (err) {
        store.reopenAssistantActionAfterFailedUndo(a.id);
        throw new HttpError(409, `Could not undo: ${err instanceof Error ? err.message : String(err)}`);
      }
      // The model hears it, so it does not build on what is gone.
      const fresh = store.getAssistantThread(thread.id)!;
      const edited = Array.isArray(a.edited) && a.edited.length ? ` (as edited: ${(a.edited as ReviewChange[]).map((c) => `${c.label} ${c.to}`).join(', ')})` : '';
      store.saveAssistantMessages(fresh.id, [...fresh.messages, { role: 'user', content: `[The person undid: ${a.summary}${edited}]`, ui: { hidden: true } }]);
    });
  }));

  /** 👍 / 👎 on an answer: 👍 keeps what worked as an example; 👎 removes one saved from it. */
  app.post('/assistant/threads/:id/feedback', authMiddleware, handler((req, res) => {
    const thread = threadFor(req, req.params.id);
    requireCompanyAccess(req, thread.companyId);
    // A running turn saves its own copy of the messages when it ends; feedback now would be lost.
    if (busy.has(thread.id)) throw new HttpError(409, 'The assistant is still working on this conversation.');
    const body = asRecord(req.body, 'body');
    const ref = Number(body.ref);
    const messages = thread.messages as StoredMessage[];
    const m = Number.isInteger(ref) ? messages[ref] : undefined;
    if (!m || m.role !== 'assistant' || m.ui?.hidden) throw new HttpError(404, 'Answer not found');
    const helpful = body.helpful === true;
    const ui = { ...(m.ui ?? {}), feedback: helpful ? 'up' as const : 'down' as const };
    // A change teaches only once it was confirmed and went through, whatever the 👍 says about the words.
    const doneHere = new Set(store.listAssistantActions(thread.id).filter((a) => a.status === 'done').map((a) => a.id));
    const worked = ui.example?.kind === 'read' || Boolean(ui.actionIds?.length && ui.actionIds.every((id) => doneHere.has(id)));
    if (helpful && ui.example && !ui.example.savedId && worked) {
      const saved = saveExample(thread.companyId, req.user!.id, ui.example.request, ui.example.code, ui.example.kind);
      ui.example = { ...ui.example, savedId: saved.id };
    }
    if (!helpful && ui.example?.savedId) {
      store.deleteAssistantExample(ui.example.savedId);
      ui.example = { ...ui.example, savedId: undefined };
    }
    messages[ref] = { ...m, ui } as StoredMessage;
    store.saveAssistantMessages(thread.id, messages);
    res.json(viewOf(store.getAssistantThread(thread.id)!));
  }));

  /** The company's learned examples, for whoever edits its settings (the screen comes in Wave 2). */
  /** How far the assistant may go in this company (Settings → Assistant). */
  app.get('/companies/:companyId/assistant/settings', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    requirePermission(req, companyId, 'settings.view', legacyRolesOf.get('GET /companies/:companyId/assistant/settings'));
    res.json({ settings: settingsOf(companyId), areas: changeAreasCatalogue, roles: ASSISTANT_ROLES });
  }));

  app.put('/companies/:companyId/assistant/settings', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    requirePermission(req, companyId, 'settings.edit', legacyRolesOf.get('PUT /companies/:companyId/assistant/settings'));
    let next: AssistantSettings;
    // A partial update: what is not sent keeps its current value.
    try { next = parseAssistantSettings({ ...settingsOf(companyId), ...asRecord(req.body, 'body') }, changeAreasCatalogue); } catch (err) { throw new HttpError(400, err instanceof Error ? err.message : String(err)); }
    store.saveAssistantSettings(companyId, next, req.user!.id);
    res.json({ settings: next, areas: changeAreasCatalogue, roles: ASSISTANT_ROLES });
  }));

  /** Every change the assistant proposed or made in this company, newest first (whoever edits settings sees all). */
  app.get('/companies/:companyId/assistant/actions', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    requirePermission(req, companyId, 'settings.edit', legacyRolesOf.get('GET /companies/:companyId/assistant/actions'));
    const q = (k: string) => (typeof req.query[k] === 'string' && req.query[k] ? String(req.query[k]) : undefined);
    const rows = store.listCompanyAssistantActions(companyId, { userId: q('userId'), status: q('status'), area: q('area'), limit: Number(q('limit')) || 100 });
    res.json(rows.map((a) => ({
      id: a.id, userId: a.userId, userName: store.getUserById(a.userId)?.name ?? a.userId, method: a.method, path: a.path,
      summary: a.summary, status: a.status, area: a.area ?? null, createdAt: a.createdAt, decidedAt: a.decidedAt,
      ...(Array.isArray(a.edited) && a.edited.length ? { edited: a.edited } : {}),
    })));
  }));

  app.get('/companies/:companyId/assistant/examples', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyAccess(req, companyId);
    requirePermission(req, companyId, 'settings.edit', legacyRolesOf.get('GET /companies/:companyId/assistant/examples'));
    res.json(store.listAssistantExamples(companyId));
  }));

  app.delete('/assistant/examples/:id', authMiddleware, handler((req, res) => {
    const example = store.getAssistantExample(req.params.id);
    if (!example) throw new HttpError(404, 'Example not found');
    requireCompanyAccess(req, example.companyId);
    requirePermission(req, example.companyId, 'settings.edit', legacyRolesOf.get('DELETE /assistant/examples/:id'));
    store.deleteAssistantExample(example.id);
    res.status(204).end();
  }));
}

/** Small models write `companyId: 1`; every id in TaskFlow is a string. */
export function idsAsStrings(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (/(^id|Id)$/.test(k) && typeof v === 'number') out[k] = String(v);
    if (/Ids$/.test(k) && Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'number' ? String(x) : x));
  }
  return out;
}

/** Replies the model offers ("» ..." lines) come off the text and become buttons. */
export function splitSuggestions(content: string): { text: string; suggestions: string[] } {
  const suggestions: string[] = [];
  const kept = content.split('\n').filter((line) => {
    const m = /^\s*[»›]\s*(.+?)\s*$/.exec(line);
    if (m && suggestions.length < 3 && m[1].length <= 120) { suggestions.push(m[1].replace(/^["“]|["”]$/g, '')); return false; }
    return !m;
  });
  return { text: kept.join('\n').trim(), suggestions };
}
