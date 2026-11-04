import { apiFetch } from '@/lib/api-client';

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
export interface AssistantItem { role: 'user' | 'assistant'; text: string; actions: AssistantAction[]; cards?: AssistantCard[]; suggestions?: string[] }
export interface AssistantThread { id: string; title: string; companyId: string; items: AssistantItem[]; pending: number }
export interface AssistantThreadSummary { id: string; title: string; companyId: string; updatedAt: string }
export interface AssistantStatus { enabled: boolean; model: string | null }

export const getAssistantStatus = () => apiFetch<AssistantStatus>('/assistant/status');
export const listAssistantThreads = () => apiFetch<AssistantThreadSummary[]>('/assistant/threads');
export const getAssistantThread = (id: string) => apiFetch<AssistantThread>(`/assistant/threads/${id}`);
export const deleteAssistantThread = (id: string) => apiFetch<void>(`/assistant/threads/${id}`, { method: 'DELETE' });
export const askAssistant = (input: { message: string; threadId?: string; companyId: string }) =>
  apiFetch<AssistantThread>('/assistant/chat', { method: 'POST', body: JSON.stringify(input) });
export const decideAssistantActions = (threadId: string, decision: { confirm?: string[]; decline?: string[] }) =>
  apiFetch<AssistantThread>(`/assistant/threads/${threadId}/decide`, { method: 'POST', body: JSON.stringify(decision) });

let statusCache: Promise<AssistantStatus> | null = null;
/** Asked once per page load: whether this server has a model set up. */
export function assistantStatusOnce(): Promise<AssistantStatus> {
  statusCache ??= getAssistantStatus().catch(() => {
    statusCache = null;
    return { enabled: false, model: null };
  });
  return statusCache;
}
