import { API_BASE_URL, apiFetch, getStoredToken } from '@/lib/api-client';

/** The in-app assistant (backend routes/assistant.ts). */
export type AssistantActionStatus = 'pending' | 'running' | 'done' | 'failed' | 'declined' | 'expired' | 'undone';
/** One field of a proposed change, as a small form (backend assistant/review.ts). */
export interface ReviewField {
  key: string;
  label: string;
  kind: 'text' | 'longtext' | 'number' | 'date' | 'select' | 'boolean' | 'readonly';
  value?: string | number | boolean | null;
  display?: string;
  options?: string[];
}
export interface ReviewChange { key: string; label: string; from: string; to: string }
export interface AssistantAction {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  path: string;
  summary: string;
  status: AssistantActionStatus;
  body: unknown;
  error: string | null;
  /** Pending creates and edits: the fields, editable before confirming. */
  fields?: ReviewField[];
  /** Edits: what changes, before → after. */
  changes?: ReviewChange[];
  /** Deletes: what goes. */
  target?: AssistantCard;
  /** Before it runs: whether it could be taken back; after: whether Undo is offered. */
  undoable: boolean;
  /** Done and still undoable until this time. */
  undoUntil?: string;
  approval?: { status: 'may' } | { status: 'pending'; waitingOn: string[] };
  /** What the person changed before confirming. */
  edited?: ReviewChange[];
}
export interface AssistantCard {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  amount?: { value: number; currency: string };
  date?: { label: 'due' | 'date'; value: string };
  people?: string[];
  href?: string;
}
export interface AssistantFile { id: string; name: string; mimeType: string; sizeBytes: number }
export interface AssistantItem { role: 'user' | 'assistant'; ref?: number; feedback?: 'up' | 'down'; text: string; actions: AssistantAction[]; cards?: AssistantCard[]; suggestions?: string[]; files?: AssistantFile[] }
export type AssistantStepKind = 'thinking' | 'search' | 'read' | 'prepare' | 'show' | 'run' | 'confirm';
export interface AssistantStep { kind: AssistantStepKind; detail?: string }
export interface AssistantThread { id: string; title: string; companyId: string; scope?: 'company' | 'group'; items: AssistantItem[]; pending: number; working?: boolean; error?: { status: number; message: string } | null }
export interface AssistantThreadSummary { id: string; title: string; companyId: string; scope?: 'company' | 'group'; updatedAt: string }
export interface AssistantStatus { enabled: boolean; model: string | null }

export const getAssistantStatus = () => apiFetch<AssistantStatus>('/assistant/status');
export const listAssistantThreads = () => apiFetch<AssistantThreadSummary[]>('/assistant/threads');
export const getAssistantThread = (id: string) => apiFetch<AssistantThread>(`/assistant/threads/${id}`);
export const deleteAssistantThread = (id: string) => apiFetch<void>(`/assistant/threads/${id}`, { method: 'DELETE' });
/** A turn that failed while running in the background, with the status the server gave. */
export class AssistantTurnError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * The server answers at once and works in the background (a slow model would
 * outlast a proxy's timeout); this waits for the turn by reading the thread.
 * `onThread` sees each state, so the person's message shows while it works.
 */
export async function untilDone(first: AssistantThread, onThread?: (t: AssistantThread) => void): Promise<AssistantThread> {
  let t = first;
  while (t.working) {
    onThread?.(t);
    await new Promise((r) => setTimeout(r, 1500));
    t = await apiFetch<AssistantThread>(`/assistant/threads/${t.id}`);
  }
  if (t.error) {
    onThread?.(t);
    throw new AssistantTurnError(t.error.status, t.error.message);
  }
  return t;
}

/** What is on the person's screen when they ask: the page, and the record open there. */
export interface AssistantSubject { kind: string; id: string; title: string }
export interface ScreenContext { path?: string; subject?: AssistantSubject }

export const askAssistant = async (input: { message: string; threadId?: string; companyId: string; scope?: 'company' | 'group'; fileIds?: string[]; requestId?: string; context?: ScreenContext }, onThread?: (t: AssistantThread) => void) =>
  untilDone(await apiFetch<AssistantThread>('/assistant/chat', { method: 'POST', body: JSON.stringify({ ...input, background: true }) }), onThread);
export const decideAssistantActions = async (threadId: string, decision: { confirm?: string[]; decline?: string[]; edits?: Record<string, Record<string, unknown>>; requestId?: string }, onThread?: (t: AssistantThread) => void) =>
  untilDone(await apiFetch<AssistantThread>(`/assistant/threads/${threadId}/decide`, { method: 'POST', body: JSON.stringify({ ...decision, background: true }) }), onThread);

let statusCache: Promise<AssistantStatus> | null = null;
/** Asked once per page load: whether this server has a model set up. */
export function assistantStatusOnce(): Promise<AssistantStatus> {
  statusCache ??= getAssistantStatus().catch(() => {
    statusCache = null;
    return { enabled: false, model: null };
  });
  return statusCache;
}

/** 👍 keeps what worked as an example for the next similar request; 👎 removes it. */
export const sendAssistantFeedback = (threadId: string, ref: number, helpful: boolean) =>
  apiFetch<AssistantThread>(`/assistant/threads/${threadId}/feedback`, { method: 'POST', body: JSON.stringify({ ref, helpful }) });

export const getAssistantProgress = (requestId: string) => apiFetch<{ step: AssistantStep | null }>(`/assistant/progress/${requestId}`);

const asDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

/** Uploads a file for the next message; up to 20 MB. */
export async function uploadAssistantFile(companyId: string, file: File): Promise<AssistantFile> {
  return apiFetch<AssistantFile>('/assistant/files', {
    method: 'POST',
    body: JSON.stringify({ companyId, fileName: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: await asDataUrl(file) }),
  });
}

/** An attached image as an object URL (the file needs the session, so a plain <img src> cannot load it). */
export async function assistantFileUrl(id: string): Promise<string | null> {
  try {
    const token = getStoredToken();
    const res = await fetch(`${API_BASE_URL}/assistant/files/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return res.ok ? URL.createObjectURL(await res.blob()) : null;
  } catch { return null; }
}

/** Takes back a change made in the last 10 minutes. */
export const undoAssistantAction = (threadId: string, actionId: string) =>
  apiFetch<AssistantThread>(`/assistant/threads/${threadId}/undo`, { method: 'POST', body: JSON.stringify({ actionId }) });

/** How far the assistant may go in a company (Settings → Assistant). */
export interface AssistantSettings { enabled: boolean; roles: string[]; changeAreas: string[] | null; maxChanges: number; learn: boolean }
export interface AssistantSettingsView { settings: AssistantSettings; areas: string[]; roles: string[] }
export const getAssistantSettings = (companyId: string) => apiFetch<AssistantSettingsView>(`/companies/${companyId}/assistant/settings`);
export const saveAssistantSettings = (companyId: string, settings: Partial<AssistantSettings>) =>
  apiFetch<AssistantSettingsView>(`/companies/${companyId}/assistant/settings`, { method: 'PUT', body: JSON.stringify(settings) });

export interface AssistantLogRow {
  id: string; userId: string; userName: string; method: string; path: string; summary: string;
  status: AssistantActionStatus; area: string | null; createdAt: string; decidedAt: string | null; edited?: ReviewChange[];
}
export const listAssistantLog = (companyId: string, filter: { status?: string; area?: string; limit?: number } = {}) => {
  const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  return apiFetch<AssistantLogRow[]>(`/companies/${companyId}/assistant/actions${q.size ? `?${q}` : ''}`);
};

export interface AssistantExample { id: string; userId: string; request: string; code: string; kind: 'read' | 'change'; uses: number; createdAt: string; lastUsedAt: string | null }
export const listAssistantExamples = (companyId: string) => apiFetch<AssistantExample[]>(`/companies/${companyId}/assistant/examples`);
export const deleteAssistantExample = (id: string) => apiFetch<void>(`/assistant/examples/${id}`, { method: 'DELETE' });

export type AssistantStreamEvent =
  | { type: 'step'; step: AssistantStep }
  | { type: 'reply'; text: string }
  | { type: 'done'; error?: string };

/**
 * The live view of one request (GET /assistant/stream/:requestId): what it is
 * doing and the answer as it is written. Read with fetch so the token travels in
 * the Authorization header. Resolves when the request is done or the stream ends;
 * rejects when it cannot be opened (the caller falls back to polling).
 */
export async function streamAssistant(requestId: string, onEvent: (e: AssistantStreamEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/assistant/stream/${requestId}`, {
    headers: { Authorization: `Bearer ${getStoredToken() ?? ''}`, Accept: 'text/event-stream' },
    signal,
    cache: 'no-store',
  });
  if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let at;
    while ((at = buffer.indexOf('\n\n')) >= 0) {
      const line = buffer.slice(0, at).split('\n').find((l) => l.startsWith('data: '));
      buffer = buffer.slice(at + 2);
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(6)) as AssistantStreamEvent;
        onEvent(event);
        if (event.type === 'done') { void reader.cancel().catch(() => undefined); return; }
      } catch { /* a malformed line is skipped */ }
    }
  }
}
