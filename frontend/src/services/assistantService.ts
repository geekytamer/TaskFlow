import { API_BASE_URL, apiFetch, getStoredToken } from '@/lib/api-client';

/** The in-app assistant (backend routes/assistant.ts). */
export type AssistantActionStatus = 'pending' | 'running' | 'done' | 'failed' | 'declined' | 'expired';
export interface AssistantAction {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  path: string;
  summary: string;
  status: AssistantActionStatus;
  body: unknown;
  error: string | null;
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
export interface AssistantItem { role: 'user' | 'assistant'; text: string; actions: AssistantAction[]; cards?: AssistantCard[]; suggestions?: string[]; files?: AssistantFile[] }
export type AssistantStepKind = 'thinking' | 'search' | 'read' | 'prepare' | 'show' | 'run' | 'confirm';
export interface AssistantStep { kind: AssistantStepKind; detail?: string }
export interface AssistantThread { id: string; title: string; companyId: string; items: AssistantItem[]; pending: number; working?: boolean; error?: { status: number; message: string } | null }
export interface AssistantThreadSummary { id: string; title: string; companyId: string; updatedAt: string }
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
async function untilDone(first: AssistantThread, onThread?: (t: AssistantThread) => void): Promise<AssistantThread> {
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

export const askAssistant = async (input: { message: string; threadId?: string; companyId: string; fileIds?: string[]; requestId?: string }, onThread?: (t: AssistantThread) => void) =>
  untilDone(await apiFetch<AssistantThread>('/assistant/chat', { method: 'POST', body: JSON.stringify({ ...input, background: true }) }), onThread);
export const decideAssistantActions = async (threadId: string, decision: { confirm?: string[]; decline?: string[]; requestId?: string }, onThread?: (t: AssistantThread) => void) =>
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
