import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express, Response as ExpressResponse } from 'express';
import { HttpError } from '../http';
import { asRecord, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler, type AuthedRequest } from './shared';
import { assistantOps, describeOp, matchOp, searchOps, type AssistantOp } from '../assistant/catalogue';
import { runInSandbox, type SandboxHost } from '../assistant/sandbox';
import { runAgent, systemPrompt, toolText, cleanReply, type AgentMode } from '../assistant/agent';
import { modelConfigFromEnv, openAiChat, ModelUnavailableError, type ChatFn, type ChatMessage } from '../assistant/model';
import { ROUTES } from '../authz/route-registry';
import { checkBody, hintFor, ignoredFilters, recordsIn, shapeOf } from '../assistant/hints';
import { cardOf, kindOfPath, type AssistantCard } from '../assistant/cards';
import { RECIPES, describeRecipe, recipeByName, searchRecipes } from '../assistant/recipes';
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
type StoredMessage = ChatMessage & { ui?: { hidden?: true; actionIds?: string[]; cards?: AssistantCard[]; files?: FileRef[] } };

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
  const { store, authMiddleware, requireCompanyAccess, allowsKey, accessibleCompanyIds } = ctx;
  const config = options.chat ? null : modelConfigFromEnv();
  const chat: ChatFn | null = options.chat ?? (config ? openAiChat(config) : null);
  const modelName = options.modelName ?? config?.model ?? null;
  const mode: AgentMode = options.mode ?? config?.toolMode ?? 'text';
  const legacyRolesOf = new Map(ROUTES.map((r) => [`${r.method} ${r.path}`, r.legacyRoles]));
  const busy = new Set<string>();
  const progress = new Map<string, { userId: string; step: Step; at: number }>();
  const stepper = (req: AuthedRequest, requestId: string | undefined) => (step: Step) => {
    if (!requestId) return;
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
    const items: Array<{ role: 'user' | 'assistant'; text: string; actions: ReturnType<typeof actionView>[]; cards: AssistantCard[]; suggestions?: string[]; files?: FileRef[] }> = [];
    let carried: string[] = [];
    let carriedCards: AssistantCard[] = [];
    for (const m of thread.messages as StoredMessage[]) {
      if (m.ui?.actionIds) carried.push(...m.ui.actionIds);
      if (m.ui?.cards) carriedCards.push(...m.ui.cards);
      if (m.ui?.hidden) continue;
      if (m.role === 'user') items.push({ role: 'user', text: m.content.replace(/\n\n\[Attached files:[\s\S]*$/, ''), actions: [], cards: [], ...(m.ui?.files?.length ? { files: m.ui.files } : {}) });
      if (m.role === 'assistant' && !m.tool_calls?.length) {
        const { text, suggestions } = splitSuggestions(cleanReply(m.content));
        const own = carried.map((id) => byId.get(id)).filter((a): a is AssistantActionRow => Boolean(a)).map(actionView);
        carried = [];
        const shown = carriedCards;
        carriedCards = [];
        if (text || own.length || shown.length) items.push({ role: 'assistant', text, actions: own, cards: shown, ...(suggestions.length ? { suggestions } : {}) });
      }
    }
    return {
      id: thread.id, title: thread.title, companyId: thread.companyId, items,
      pending: actions.filter((a) => a.status === 'pending').length,
      working: busy.has(thread.id),
      error: failures.get(thread.id) ?? null,
    };
  }

  const actionView = (a: AssistantActionRow) => ({
    id: a.id, method: a.method, path: a.path, summary: a.summary, status: a.status, body: a.body ?? null,
    error: a.status === 'failed' ? String((a.result as { error?: string } | null)?.error ?? '') : null,
  });

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
    const ops = assistantOps();
    const companyId = thread.companyId;
    const company = store.getCompanyById(companyId);
    const proposed: string[] = [];
    let reads: string[] = [];
    // Every record read this turn, by id, with its kind: show() needs only ids.
    const seen = new Map<string, { kind: string; record: Record<string, unknown> }>();
    const cards: AssistantCard[] = [];
    const lookups = {
      userName: (id: string) => store.getUserById(id)?.name,
      clientName: (id: string) => store.getClientById(id)?.name,
      projectName: (id: string) => store.getProjectById(id)?.name,
      currency: store.getCompanyFinanceSettings(companyId).currencyCode,
    };
    const today = new Date().toISOString().slice(0, 10);
    const lastAsked = [...(thread.messages as StoredMessage[])].reverse().find((m) => m.role === 'user' && !m.ui?.hidden);
    const request = String(lastAsked?.content ?? '').replace(/\n\n\[Attached files:[\s\S]*$/, '');
    const lang = /[\u0600-\u06FF]/.test(request) ? 'ar' as const : 'en' as const;
    // Reads a recipe makes are its own business: the model gets the recipe's return, not "GET … → shape" notes.
    let recipeDepth = 0;
    const recipeContext = (host: SandboxHost): RecipeContext => ({
      companyId, userId: user.id, today, currency: lookups.currency, lang,
      get: <T>(path: string) => host.call('GET', path, undefined, undefined) as Promise<T>,
      propose: (method, path, body, summary) => host.call(method, path, body, summary),
      names: { user: lookups.userName, client: lookups.clientName, project: lookups.projectName },
    });
    const remember = (kind: string, value: unknown) => {
      const add = (r: unknown) => {
        if (r && typeof r === 'object' && !Array.isArray(r) && 'id' in r) seen.set(String((r as { id: unknown }).id), { kind, record: r as Record<string, unknown> });
      };
      if (Array.isArray(value)) value.slice(0, 2000).forEach(add);
      else add(value);
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
        step({ kind: 'run' });
        const before = proposed.length;
        const cardsBefore = cards.length;
        // Closed once the script has ended (or timed out): a host call still in flight
        // (makeDocument's template read) must not leave a proposal no message shows.
        let open = true;
        const host: SandboxHost = {
        call: async (method, path, body, summary) => {
          if (method === 'DOC') {
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
            step({ kind: recipe.changes ? 'prepare' : 'read', detail: recipe.name });
            recipeDepth += 1;
            try { return await recipe.run(recipeContext(host), body); } finally { recipeDepth -= 1; }
          }
          if (method === 'SEARCH') return tools.search(path).split('\n');
          if (method === 'LOOKUP') {
            // Any record by name or number, through global search (which applies the person's permissions).
            step({ kind: 'search', detail: path.slice(0, 60) });
            const groups = await callApi(token, 'GET', `/companies/${encodeURIComponent(companyId)}/search?q=${encodeURIComponent(path.slice(0, 100))}`, undefined) as Array<{ type: string; items: Array<{ id: string; title: string; subtitle?: string }> }>;
            const found = (groups ?? []).flatMap((g) => g.items.map((i) => ({ kind: LOOKUP_KIND[g.type] ?? kindOfPath(`/${g.type}`), id: i.id, title: i.title, ...(i.subtitle ? { subtitle: i.subtitle } : {}) })));
            // Document templates by name too, with their blanks: what a letter or certificate needs.
            const words = path.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
            const templates = await callApi(token, 'GET', `/companies/${encodeURIComponent(companyId)}/document-templates`, undefined).catch(() => []) as Array<{ id: string; name: string; type?: string; dataSource?: string; manualFields?: Array<{ key: string; label: string }> }>;
            const wanted = /template|letter|certificate|memo|document|خطاب|شهادة|قالب|مستند/i.test(path);
            for (const t of templates ?? []) {
              const name = t.name.toLowerCase();
              if (wanted || words.some((w) => name.includes(w))) {
                found.push({ kind: 'document-template', id: t.id, title: t.name, subtitle: t.type ?? '', ...({ dataSource: t.dataSource ?? 'none', blanks: t.manualFields ?? [] } as object) } as typeof found[number]);
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
          const op = matchOp(ops, method, path);
          if (!op) throw new Error(`${method} ${path.split('?')[0]} is not a TaskFlow endpoint you can use; find one with findApi('words')`);
          if (method === 'GET') {
            step({ kind: 'read', detail: kindOfPath(op.path) });
            const value = await callApi(token, method, path, undefined);
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
          if (proposed.length >= MAX_WRITES_PER_RUN) throw new Error(`at most ${MAX_WRITES_PER_RUN} changes at once`);
          const action = store.createAssistantAction({
            threadId: thread.id, userId: user.id, companyId, method, path, body,
            summary: (summary ?? `${method} ${path}`).slice(0, 300),
          });
          proposed.push(action.id);
          return { pending: true, actionId: action.id, summary: action.summary, note: 'waiting for the person to confirm' };
        },
        };
        const outcome = await runInSandbox(code, host, undefined, { globals: { COMPANY_ID: companyId, ME: user.id, TODAY: today }, recipes: RECIPES.map((r) => r.name) }).finally(() => { open = false; });
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
        if (outcome.ok && (outcome.value === null || outcome.value === undefined)) notes.push('The script returned nothing. Write top-level code (no wrapper function) and end with `return <value>`.');
        if (cards.length > cardsBefore) notes.push(`${cards.length - cardsBefore} record(s) shown to the person as cards; do not list them again in your answer.`);
        const fresh = proposed.slice(before).map((id) => store.getAssistantAction(id)?.summary).filter(Boolean);
        if (fresh.length) notes.push(`NOT DONE YET — proposed for the person to confirm: ${fresh.join('; ')}. Tell them to confirm below; do not say it is done.`);
        return notes.length ? { ...outcome, logs: [...outcome.logs, ...notes] } : outcome;
      },
    };

    const history = (thread.messages as StoredMessage[]).map(({ ui: _ui, ...m }) => m as ChatMessage);
    const system = systemPrompt({
      userName: user.name,
      userId: user.id,
      today,
      company: { id: companyId, name: company?.name ?? companyId, currency: store.getCompanyFinanceSettings(companyId).currencyCode },
      companies: accessibleCompanyIds(user).map((id) => ({ id, name: store.getCompanyById(id)?.name ?? id })),
      areas: [...new Set(ops.filter((op) => op.method === 'GET' && op.permission.includes('.') && allowedOp(req, companyId, op)).map((op) => op.permission.split('.')[0]))].sort(),
      files: (thread.messages as StoredMessage[]).flatMap((m) => m.ui?.files ?? []),
    }, mode);
    let outcome;
    try {
      const thinking: ChatFn = (m, t) => { step({ kind: 'thinking' }); return chat(m, t); };
      outcome = await runAgent(thinking, system, history, tools, 8, mode);
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
    store.saveAssistantMessages(thread.id, [...thread.messages, ...added]);
  }

  /** Why the last background turn on a thread failed, until the next one starts. */
  const failures = new Map<string, { status: number; message: string }>();

  /**
   * One turn at a time per thread. With `background` the request answers 202 at
   * once (the thread, working: true) and the chat screen polls the thread until
   * it is done, so a slow model never meets a proxy's read timeout.
   */
  async function turn(res: ExpressResponse, threadId: string, background: boolean, fn: () => Promise<void>): Promise<void> {
    if (busy.has(threadId)) throw new HttpError(409, 'The assistant is still working on this conversation.');
    busy.add(threadId);
    failures.delete(threadId);
    const work = (async () => {
      try { await fn(); } catch (err) {
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
      thread = store.createAssistantThread({ userId: req.user!.id, companyId, title: message.replace(/\s+/g, ' ').slice(0, 80) });
    }
    requireCompanyAccess(req, thread.companyId);
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
      thread.messages = [...thread.messages, { role: 'user', content, ...(files.length ? { ui: { files } } : {}) } as StoredMessage];
      store.saveAssistantMessages(thread.id, thread.messages);
      await advance(req, thread, requestIdOf(body));
    });
  }));

  /**
   * The person's answer to proposed changes. Confirmed ones run now, in order,
   * through the API as the person; once nothing is waiting, the assistant hears
   * how they went and carries on.
   */
  app.post('/assistant/threads/:id/decide', authMiddleware, handler(async (req, res) => {
    const thread = threadFor(req, req.params.id);
    requireCompanyAccess(req, thread.companyId);
    const body = asRecord(req.body, 'body');
    const confirm = Array.isArray(body.confirm) ? body.confirm.map(String) : [];
    const decline = Array.isArray(body.decline) ? body.decline.map(String) : [];
    if (!confirm.length && !decline.length) throw new HttpError(400, 'confirm or decline is required');
    const token = tokenOf(req);
    const step = stepper(req, requestIdOf(body));
    const ops = assistantOps();
    await turn(res, thread.id, body.background === true, async () => {
      const report: string[] = [];
      const made: AssistantCard[] = [];
      const lookups = {
        userName: (id: string) => store.getUserById(id)?.name,
        clientName: (id: string) => store.getClientById(id)?.name,
        projectName: (id: string) => store.getProjectById(id)?.name,
        currency: store.getCompanyFinanceSettings(thread.companyId).currencyCode,
      };
      for (const id of decline) {
        const a = store.getAssistantAction(id);
        if (a && a.threadId === thread.id && store.decideAssistantAction(id, 'declined', null)) report.push(`Declined: ${a.summary}`);
      }
      for (const id of confirm) {
        const a = store.getAssistantAction(id);
        if (!a || a.threadId !== thread.id || a.userId !== req.user!.id) continue;
        if (Date.now() - Date.parse(a.createdAt) > ACTION_TTL_MS) { store.decideAssistantAction(id, 'expired', null); continue; }
        if (!store.claimAssistantAction(id)) continue;
        try {
          step({ kind: 'confirm', detail: a.summary.slice(0, 80) });
          const result = await callApi(token, a.method, a.path, withFiles(a.body, req.user!.id, thread.companyId), CHANGE_TIMEOUT_MS);
          store.decideAssistantAction(id, 'done', result);
          // What was just made is shown as a card with its link (a task, a document, a contact...).
          const op = a.method === 'POST' ? matchOp(ops, a.method, a.path) : undefined;
          if (op && result && typeof result === 'object' && !Array.isArray(result) && 'id' in result) {
            const card = cardOf(kindOfPath(op.path), result as Record<string, unknown>, lookups);
            if (card && made.length < MAX_CARDS) made.push(card);
          }
          report.push(`Done: ${a.summary} → ${toolText(result).slice(0, 1500)}`);
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
    });
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
