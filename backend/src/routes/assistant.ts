import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { HttpError } from '../http';
import { asRecord, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler, type AuthedRequest } from './shared';
import { assistantOps, describeOp, matchOp, searchOps, type AssistantOp } from '../assistant/catalogue';
import { runInSandbox } from '../assistant/sandbox';
import { runAgent, systemPrompt, toolText, cleanReply, type AgentMode } from '../assistant/agent';
import { modelConfigFromEnv, openAiChat, ModelUnavailableError, type ChatFn, type ChatMessage } from '../assistant/model';
import { ROUTES } from '../authz/route-registry';
import { checkBody, hintFor, ignoredFilters, recordsIn, shapeOf } from '../assistant/hints';
import { cardOf, kindOfPath, type AssistantCard } from '../assistant/cards';
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
type StoredMessage = ChatMessage & { ui?: { hidden?: true; actionIds?: string[]; cards?: AssistantCard[] } };

const MAX_WRITES_PER_RUN = 25;
const MAX_CARDS = 30;
const ACTION_TTL_MS = 60 * 60 * 1000;

export function registerAssistantRoutes(app: Express, ctx: RouteContext, options: AssistantOptions = {}): void {
  const { store, authMiddleware, requireCompanyAccess, allowsKey, accessibleCompanyIds } = ctx;
  const config = options.chat ? null : modelConfigFromEnv();
  const chat: ChatFn | null = options.chat ?? (config ? openAiChat(config) : null);
  const modelName = options.modelName ?? config?.model ?? null;
  const mode: AgentMode = options.mode ?? config?.toolMode ?? 'text';
  const legacyRolesOf = new Map(ROUTES.map((r) => [`${r.method} ${r.path}`, r.legacyRoles]));
  const busy = new Set<string>();

  // The API answers the scripts on a private loopback port: the same stack, middleware and checks as the browser.
  let loopback: Promise<number> | undefined;
  const port = () => (loopback ??= new Promise<number>((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    server.unref();
  }));

  const tokenOf = (req: AuthedRequest) => String(req.headers.authorization ?? '').replace('Bearer ', '').trim();

  async function callApi(token: string, method: string, path: string, body: unknown): Promise<unknown> {
    const p = await port();
    const response = await fetch(`http://127.0.0.1:${p}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-taskflow-assistant': '1' },
      ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
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
    const items: Array<{ role: 'user' | 'assistant'; text: string; actions: ReturnType<typeof actionView>[]; cards: AssistantCard[]; suggestions?: string[] }> = [];
    let carried: string[] = [];
    let carriedCards: AssistantCard[] = [];
    for (const m of thread.messages as StoredMessage[]) {
      if (m.ui?.actionIds) carried.push(...m.ui.actionIds);
      if (m.ui?.cards) carriedCards.push(...m.ui.cards);
      if (m.ui?.hidden) continue;
      if (m.role === 'user') items.push({ role: 'user', text: m.content, actions: [], cards: [] });
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
    };
  }

  const actionView = (a: AssistantActionRow) => ({
    id: a.id, method: a.method, path: a.path, summary: a.summary, status: a.status, body: a.body ?? null,
    error: a.status === 'failed' ? String((a.result as { error?: string } | null)?.error ?? '') : null,
  });

  /** One turn of the agent on a thread: its messages are saved, its proposals recorded. */
  async function advance(req: AuthedRequest, thread: AssistantThreadRow): Promise<void> {
    if (!chat) throw new HttpError(503, 'The assistant is not set up on this server (AI_BASE_URL and AI_MODEL).');
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
    const remember = (kind: string, value: unknown) => {
      const add = (r: unknown) => {
        if (r && typeof r === 'object' && !Array.isArray(r) && 'id' in r) seen.set(String((r as { id: unknown }).id), { kind, record: r as Record<string, unknown> });
      };
      if (Array.isArray(value)) value.slice(0, 2000).forEach(add);
      else add(value);
    };

    const tools = {
      search: (query: string) => {
        const found = searchOps(ops.filter((op) => allowedOp(req, companyId, op)), query);
        return found.length ? found.map(describeOp).join('\n') : 'nothing matched; try other words (English, singular, e.g. "invoice", "task", "client")';
      },
      run: async (code: string) => {
        reads = [];
        const before = proposed.length;
        const cardsBefore = cards.length;
        const outcome = await runInSandbox(code, {
        call: async (method, path, body, summary) => {
          if (method === 'SEARCH') return tools.search(path).split('\n');
          if (method === 'SHOW') {
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
          const op = matchOp(ops, method, path);
          if (!op) throw new Error(`${method} ${path.split('?')[0]} is not a TaskFlow endpoint you can use; find one with search_api`);
          if (method === 'GET') {
            const value = await callApi(token, method, path, undefined);
            remember(kindOfPath(op.path), value);
            if (reads.length < 6) reads.push(`GET ${path} → ${shapeOf(value)}`);
            const ignored = ignoredFilters(path, value);
            if (ignored.length) reads.push(`WARNING: GET ${path} ignored the filter ${ignored.join(', ')}: the rows include other values, so this list is NOT filtered. Drop the filter and filter in code (e.g. rows.filter(r => ...)).`);
            if (Array.isArray(value) && value.length === 0 && path.includes('?')) reads.push(`GET ${path} is empty: a query filter may not exist or may not match. Try without filters and filter in code before concluding there is nothing.`);
            return value;
          }
          body = idsAsStrings(body);
          const refused = checkBody(hintFor(op.method, op.path), body);
          if (refused) throw new Error(refused);
          if (proposed.length >= MAX_WRITES_PER_RUN) throw new Error(`at most ${MAX_WRITES_PER_RUN} changes at once`);
          const action = store.createAssistantAction({
            threadId: thread.id, userId: user.id, companyId, method, path, body,
            summary: (summary ?? `${method} ${path}`).slice(0, 300),
          });
          proposed.push(action.id);
          return { pending: true, actionId: action.id, summary: action.summary, note: 'waiting for the person to confirm' };
        },
        });
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
      today: new Date().toISOString().slice(0, 10),
      company: { id: companyId, name: company?.name ?? companyId, currency: store.getCompanyFinanceSettings(companyId).currencyCode },
      companies: accessibleCompanyIds(user).map((id) => ({ id, name: store.getCompanyById(id)?.name ?? id })),
    }, mode);
    let outcome;
    try {
      outcome = await runAgent(chat, system, history, tools, 8, mode);
    } catch (err) {
      if (err instanceof ModelUnavailableError) throw new HttpError(503, err.message, { code: 'ASSISTANT_OFFLINE' });
      throw err;
    }
    const added = outcome.added as StoredMessage[];
    const last = added[added.length - 1];
    if (proposed.length) last.ui = { ...(last.ui ?? {}), actionIds: proposed };
    if (cards.length) last.ui = { ...(last.ui ?? {}), cards };
    store.saveAssistantMessages(thread.id, [...thread.messages, ...added]);
  }

  async function exclusive<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
    if (busy.has(threadId)) throw new HttpError(409, 'The assistant is still working on this conversation.');
    busy.add(threadId);
    try { return await fn(); } finally { busy.delete(threadId); }
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
    await exclusive(thread.id, async () => {
      // Anything still waiting is set aside: the person moved on.
      for (const a of store.listAssistantActions(thread.id)) if (a.status === 'pending') store.decideAssistantAction(a.id, 'expired', null);
      thread.messages = [...thread.messages, { role: 'user', content: message }];
      store.saveAssistantMessages(thread.id, thread.messages);
      await advance(req, thread);
    });
    res.json(viewOf(store.getAssistantThread(thread.id)!));
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
    await exclusive(thread.id, async () => {
      const report: string[] = [];
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
          const result = await callApi(token, a.method, a.path, a.body);
          store.decideAssistantAction(id, 'done', result);
          report.push(`Done: ${a.summary} → ${toolText(result).slice(0, 1500)}`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          store.decideAssistantAction(id, 'failed', { error });
          report.push(`Failed: ${a.summary} → ${error}`);
        }
      }
      const fresh = store.getAssistantThread(thread.id)!;
      const waiting = store.listAssistantActions(thread.id).some((a) => a.status === 'pending');
      if (report.length) {
        fresh.messages = [...fresh.messages, { role: 'user', content: `[The person decided on the proposed changes]\n${report.join('\n')}`, ui: { hidden: true } }];
        store.saveAssistantMessages(fresh.id, fresh.messages);
      }
      // Carry on only after a confirmation and when nothing else waits; a decline needs no answer.
      if (!waiting && report.some((r) => !r.startsWith('Declined')) && chat) {
        await advance(req, fresh).catch((err) => {
          if (err instanceof HttpError && err.status === 503) return; // the changes ran; the follow-up can wait
          throw err;
        });
      }
    });
    res.json(viewOf(store.getAssistantThread(thread.id)!));
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
