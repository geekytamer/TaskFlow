import { API_BASE_URL, apiFetch, getStoredToken } from '@/lib/api-client';

export type ThreadState = 'waiting_us' | 'waiting_them' | 'done' | 'snoozed';
export type InboxView = 'mine' | 'unassigned' | 'all';
export type InboxStateFilter = ThreadState | 'open' | 'overdue';

export interface ThreadSummary {
  id: string;
  contact: { id: string; name: string };
  subject: string;
  contextType: string | null;
  contextId: string | null;
  assignee: { id: string; name: string } | null;
  state: ThreadState;
  waitingSince: string | null;
  sla: { dueAt: string; level: 'ok' | 'amber' | 'red' } | null;
  snoozedUntil: string | null;
  lastMessageAt: string | null;
  lastMessage: { body: string; authorName: string | null; visibility: 'external' | 'internal' | 'owner_private' } | null;
  unread: boolean;
}

export interface ConvFile { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }

export interface ConvMessageView {
  id: string;
  threadId: string;
  channel: 'portal' | 'note' | 'system' | string;
  direction: 'in' | 'out' | 'none' | string;
  visibility: 'external' | 'internal' | 'owner_private';
  author: { kind: 'staff' | 'portal' | 'system'; id: string | null; name: string | null; avatar: string | null };
  body: string;
  files: ConvFile[];
  mentions: Array<{ id: string; name: string }>;
  editedAt: string | null;
  editableUntil: string | null;
  seenAt: string | null;
  createdAt: string;
}

export interface InboxResult {
  threads: ThreadSummary[];
  counts: { mine: number; unassigned: number; all: number };
}

export interface ContactConversation {
  conversation: { id: string; owner: { id: string; name: string } | null };
  threads: ThreadSummary[];
  portalUsers: number;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  messages: ConvMessageView[];
  portalUsers: number;
}

export interface SendInput {
  kind: 'portal' | 'note';
  body: string;
  fileIds?: string[];
  mentionUserIds?: string[];
}

export interface ThreadPatch {
  assigneeUserId?: string | null;
  state?: 'done' | 'waiting_us';
  snoozedUntil?: string;
}

export const getInbox = (companyId: string, view: InboxView, state?: InboxStateFilter, q?: string) => {
  const params = new URLSearchParams({ view });
  if (state) params.set('state', state);
  if (q?.trim()) params.set('q', q.trim());
  return apiFetch<InboxResult>(`/companies/${companyId}/inbox?${params}`);
};

export const getContactConversation = (companyId: string, contactId: string) =>
  apiFetch<ContactConversation>(`/companies/${companyId}/contacts/${contactId}/conversation`);

export const getThread = (id: string) =>
  apiFetch<ThreadDetail>(`/conversation-threads/${encodeURIComponent(id)}`);

export const sendThreadMessage = (id: string, input: SendInput) =>
  apiFetch<ConvMessageView>(`/conversation-threads/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const editMessage = (id: string, body: string) =>
  apiFetch<ConvMessageView>(`/conversation-messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });

export const updateThread = (id: string, patch: ThreadPatch) =>
  apiFetch<ThreadSummary>(`/conversation-threads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

/** Staff upload for a thread; open to anyone who can see the contact. */
export const uploadThreadFile = (threadId: string, body: { fileName: string; contentBase64: string }) =>
  apiFetch<ConvFile>(`/conversation-threads/${encodeURIComponent(threadId)}/files`, { method: 'POST', body: JSON.stringify(body) });

/** Saves a thread file to disk; never opened in a tab since the bytes may come from outside the company. */
export async function downloadThreadFile(file: Pick<ConvFile, 'id' | 'fileName'>) {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE_URL}/conversation-files/${encodeURIComponent(file.id)}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export interface ConversationSettings {
  responseTargetHours: number;
  /** 0 = Sunday .. 6 = Saturday. */
  workDays: number[];
  dayStart: string;
  dayEnd: string;
  timeZone: string;
}

export const getConversationSettings = (companyId: string) =>
  apiFetch<ConversationSettings>(`/companies/${companyId}/conversation-settings`);

export const saveConversationSettings = (companyId: string, input: ConversationSettings) =>
  apiFetch<ConversationSettings>(`/companies/${companyId}/conversation-settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
