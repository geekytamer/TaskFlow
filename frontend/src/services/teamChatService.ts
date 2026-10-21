import { apiFetch } from '@/lib/api-client';

/** Staff chats inside one company (backend teamchat/routes.ts). Members only. */

export interface TeamChatMemberView {
  userId: string;
  name: string;
  avatar: string | null;
  lastReadAt: string | null;
}

export interface TeamChatMessage {
  id: string;
  chatId: string;
  authorUserId: string;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface TeamChat {
  id: string;
  companyId: string;
  kind: 'direct' | 'group';
  name: string | null;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string | null;
  members: TeamChatMemberView[];
  unread?: number;
  muted?: boolean;
  lastMessage?: TeamChatMessage | null;
}

export interface TeamMember { id: string; name: string; avatar: string | null }

const base = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/team-chats`;

export const getTeamMembers = (companyId: string) =>
  apiFetch<TeamMember[]>(`/companies/${encodeURIComponent(companyId)}/team-members`);

export const listTeamChats = (companyId: string) => apiFetch<TeamChat[]>(base(companyId));

export const getTeamUnread = (companyId: string) =>
  apiFetch<{ count: number }>(`${base(companyId)}/unread-count`).then((r) => r.count);

export const openDirectChat = (companyId: string, userId: string) =>
  apiFetch<TeamChat>(base(companyId), { method: 'POST', body: JSON.stringify({ kind: 'direct', userId }) });

export const createGroupChat = (companyId: string, name: string, memberIds: string[]) =>
  apiFetch<TeamChat>(base(companyId), { method: 'POST', body: JSON.stringify({ kind: 'group', name, memberIds }) });

export const updateTeamChat = (
  companyId: string,
  chatId: string,
  changes: { name?: string; addMemberIds?: string[]; removeMemberIds?: string[]; muted?: boolean },
) => apiFetch<TeamChat>(`${base(companyId)}/${encodeURIComponent(chatId)}`, { method: 'PATCH', body: JSON.stringify(changes) });

export const leaveTeamChat = (companyId: string, chatId: string) =>
  apiFetch<{ success: boolean }>(`${base(companyId)}/${encodeURIComponent(chatId)}/leave`, { method: 'POST' });

export const getTeamMessages = (companyId: string, chatId: string, before?: string) =>
  apiFetch<{ chat: TeamChat; members: TeamChatMemberView[]; messages: TeamChatMessage[] }>(
    `${base(companyId)}/${encodeURIComponent(chatId)}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  );

export const sendTeamMessage = (companyId: string, chatId: string, body: string, mentionIds: string[] = []) =>
  apiFetch<TeamChatMessage>(`${base(companyId)}/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, mentionIds }),
  });

export const editTeamMessage = (companyId: string, chatId: string, messageId: string, body: string) =>
  apiFetch<TeamChatMessage>(`${base(companyId)}/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });

export const deleteTeamMessage = (companyId: string, chatId: string, messageId: string) =>
  apiFetch<TeamChatMessage>(`${base(companyId)}/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });

export const markTeamChatRead = (companyId: string, chatId: string) =>
  apiFetch<{ success: boolean }>(`${base(companyId)}/${encodeURIComponent(chatId)}/read`, { method: 'POST' });
