import { portalGet, portalGetOrNull } from './client-api';
import type { PortalFile } from './files';

export interface Message {
  id: string;
  body: string;
  author: { kind: 'you' | 'client' | 'team'; name: string | null; company?: string | null };
  files: PortalFile[];
  createdAt: string;
}

export const getMessages = () => portalGet<Message[]>('/messages');

export interface ThreadSummary {
  id: string;
  subject: string;
  lastMessageAt: string | null;
  lastMessage: { body: string; authorKind: 'you' | 'client' | 'team' } | null;
  unread: boolean;
}

export interface ThreadDetail {
  thread: { id: string; subject: string };
  messages: Message[];
}

export const getThreads = () => portalGet<ThreadSummary[]>('/threads');
/** Opening a thread marks it read; null when it is not this visitor's. */
export const getThread = (id: string) => portalGetOrNull<ThreadDetail>(`/threads/${encodeURIComponent(id)}`);
