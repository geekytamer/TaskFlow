import { apiFetch } from '@/lib/api-client';

export type WhatsAppInstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'sleepMode'
  | 'starting'
  | 'yellowCard'
  | 'unknown';

export interface WhatsAppInstance {
  id: string;
  companyId: string;
  idInstance: string;
  phoneNumber?: string;
  displayName?: string;
  state: WhatsAppInstanceState;
  webhookToken: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppMessageDirection = 'outbound' | 'inbound';
export type WhatsAppMessageType = 'text' | 'file' | 'image' | 'document';
export type WhatsAppMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface WhatsAppMessage {
  id: string;
  companyId: string;
  instanceId: string;
  direction: WhatsAppMessageDirection;
  externalId?: string;
  chatId: string;
  phone: string;
  contactId?: string;
  type: WhatsAppMessageType;
  body: string;
  mediaUrl?: string;
  fileName?: string;
  status: WhatsAppMessageStatus;
  error?: string;
  contextEntityType?: string;
  contextEntityId?: string;
  actorUserId?: string;
  actorName?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  receivedAt?: string;
  createdAt: string;
}

export type WhatsAppChatVisibility = 'shared' | 'private';

export interface WhatsAppChatSettings {
  companyId: string;
  chatId: string;
  visibility: WhatsAppChatVisibility;
  ownerUserId?: string;
  updatedAt: string;
}

export async function getWhatsappInstance(companyId: string): Promise<WhatsAppInstance | null> {
  if (!companyId) return null;
  return apiFetch<WhatsAppInstance | null>(`/companies/${companyId}/whatsapp/instance`);
}

export async function saveWhatsappInstance(
  companyId: string,
  data: { idInstance: string; apiToken: string; apiHost?: string; phoneNumber?: string; displayName?: string },
): Promise<WhatsAppInstance> {
  return apiFetch<WhatsAppInstance>(`/companies/${companyId}/whatsapp/instance`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteWhatsappInstance(companyId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/companies/${companyId}/whatsapp/instance`, {
    method: 'DELETE',
  });
}

export async function getWhatsappState(companyId: string): Promise<WhatsAppInstance> {
  return apiFetch<WhatsAppInstance>(`/companies/${companyId}/whatsapp/state`);
}

export async function getWhatsappQr(
  companyId: string,
): Promise<{ type: string; message: string }> {
  return apiFetch<{ type: string; message: string }>(`/companies/${companyId}/whatsapp/qr`);
}

export async function configureWhatsappWebhook(
  companyId: string,
  baseUrl?: string,
): Promise<{ success: boolean; webhookUrl: string }> {
  return apiFetch(`/companies/${companyId}/whatsapp/configure-webhook`, {
    method: 'POST',
    body: JSON.stringify({ baseUrl }),
  });
}

export async function logoutWhatsapp(companyId: string): Promise<{ isLogout?: boolean; instance?: WhatsAppInstance }> {
  return apiFetch(`/companies/${companyId}/whatsapp/logout`, { method: 'POST' });
}

export async function sendWhatsappMessage(
  companyId: string,
  payload: {
    phone: string;
    message: string;
    contactId?: string;
    contextEntityType?: string;
    contextEntityId?: string;
  },
): Promise<WhatsAppMessage> {
  return apiFetch<WhatsAppMessage>(`/companies/${companyId}/whatsapp/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getWhatsappMessages(
  companyId: string,
  opts: { chatId?: string; contactId?: string; phone?: string; limit?: number } = {},
): Promise<WhatsAppMessage[]> {
  const params = new URLSearchParams();
  if (opts.chatId) params.set('chatId', opts.chatId);
  if (opts.contactId) params.set('contactId', opts.contactId);
  if (opts.phone) params.set('phone', opts.phone);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch<WhatsAppMessage[]>(
    `/companies/${companyId}/whatsapp/messages${qs ? `?${qs}` : ''}`,
  );
}

export interface WhatsAppChatSummary {
  chatId: string;
  phone: string;
  contactId?: string;
  contactName?: string;
  lastMessageAt: string;
  lastMessageBody: string;
  lastMessageDirection: WhatsAppMessageDirection;
  unreadCount: number;
  messageCount: number;
  visibility: WhatsAppChatVisibility;
  ownerUserId?: string;
}

export async function getWhatsappChatSettings(
  companyId: string,
  chatId: string,
): Promise<WhatsAppChatSettings> {
  return apiFetch<WhatsAppChatSettings>(
    `/companies/${companyId}/whatsapp/chats/${encodeURIComponent(chatId)}/settings`,
  );
}

export async function updateWhatsappChatSettings(
  companyId: string,
  chatId: string,
  updates: { visibility?: WhatsAppChatVisibility; ownerUserId?: string | null },
): Promise<WhatsAppChatSettings> {
  return apiFetch<WhatsAppChatSettings>(
    `/companies/${companyId}/whatsapp/chats/${encodeURIComponent(chatId)}/settings`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
  );
}

export async function getWhatsappChats(companyId: string): Promise<WhatsAppChatSummary[]> {
  if (!companyId) return [];
  return apiFetch<WhatsAppChatSummary[]>(`/companies/${companyId}/whatsapp/chats`);
}

export async function syncWhatsappChatHistory(
  companyId: string,
  chatId: string,
  count = 100,
): Promise<{ inserted: number; fetched: number }> {
  return apiFetch(`/companies/${companyId}/whatsapp/chats/${encodeURIComponent(chatId)}/sync-history?count=${count}`, {
    method: 'POST',
  });
}

export async function markWhatsappChatRead(
  companyId: string,
  chatId: string,
): Promise<{ updated: number }> {
  return apiFetch(`/companies/${companyId}/whatsapp/chats/${encodeURIComponent(chatId)}/read`, {
    method: 'POST',
  });
}

export async function openWhatsappChat(
  companyId: string,
  phone: string,
): Promise<{ chatId: string; phone: string; imported: number }> {
  return apiFetch(`/companies/${companyId}/whatsapp/open-chat`, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}
