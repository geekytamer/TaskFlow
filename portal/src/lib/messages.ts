import { portalGet } from './client-api';
import type { PortalFile } from './files';

export interface Message {
  id: string;
  body: string;
  author: { kind: 'you' | 'client' | 'team'; name: string | null };
  files: PortalFile[];
  createdAt: string;
}

export const getMessages = () => portalGet<Message[]>('/messages');
