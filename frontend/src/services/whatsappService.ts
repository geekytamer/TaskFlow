import { API_BASE_URL, apiFetch, getStoredToken } from '@/lib/api-client';

export type WhatsAppInstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'sleepMode'
  | 'starting'
  | 'yellowCard'
  | 'unknown';

/** green = linked by QR (Green API); cloud = Meta's official Cloud API. */
export type WhatsAppProvider = 'green' | 'cloud';

export interface WhatsAppInstance {
  id: string;
  companyId: string;
  provider: WhatsAppProvider;
  /** Green: instance id. Cloud: Phone Number ID. */
  idInstance: string;
  wabaId?: string;
  hasAppSecret?: boolean;
  phoneNumber?: string;
  displayName?: string;
  state: WhatsAppInstanceState;
  webhookToken: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppMessageDirection = 'outbound' | 'inbound';
export type WhatsAppMessageType = 'text' | 'file' | 'image' | 'document' | 'audio' | 'video';
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
  mimeType?: string;
  /** Provider id of the message this one answers. */
  replyToExternalId?: string;
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

/** open = ours to answer; waiting = the customer's turn; done = closed until they write again. */
export type WhatsAppChatStatus = 'open' | 'waiting' | 'done';

export interface WhatsAppChatSettings {
  companyId: string;
  chatId: string;
  visibility: WhatsAppChatVisibility;
  ownerUserId?: string;
  assigneeUserId?: string;
  status: WhatsAppChatStatus;
  labels: string[];
  updatedAt: string;
}

export async function getWhatsappInstance(companyId: string): Promise<WhatsAppInstance | null> {
  if (!companyId) return null;
  return apiFetch<WhatsAppInstance | null>(`/companies/${companyId}/whatsapp/instance`);
}

export async function saveWhatsappInstance(
  companyId: string,
  data: {
    provider?: WhatsAppProvider;
    idInstance: string;
    /** Left empty on an update keeps the stored one. */
    apiToken?: string;
    apiHost?: string;
    phoneNumber?: string;
    displayName?: string;
    wabaId?: string;
    appSecret?: string;
  },
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
): Promise<{ success: boolean; webhookUrl: string; manual?: boolean; verifyToken?: string }> {
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
    replyToExternalId?: string;
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
  lastMessageKind?: 'image' | 'video' | 'audio' | 'document';
  lastMessageDirection: WhatsAppMessageDirection;
  unreadCount: number;
  messageCount: number;
  visibility: WhatsAppChatVisibility;
  ownerUserId?: string;
  assigneeUserId?: string;
  assigneeName?: string;
  status: WhatsAppChatStatus;
  labels: string[];
  waitingSince?: string;
  /** Against the company's response target: amber from half of it, red past it. */
  sla?: 'ok' | 'amber' | 'red';
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
  updates: {
    visibility?: WhatsAppChatVisibility;
    ownerUserId?: string | null;
    assigneeUserId?: string | null;
    status?: WhatsAppChatStatus;
    labels?: string[];
  },
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

/** Cloud API: whether free text may go to this chat now (24 hours after the customer's last message). */
export interface WhatsAppWindow {
  provider: WhatsAppProvider;
  open: boolean;
  closesAt?: string;
  lastInboundAt?: string;
}

export async function getWhatsappWindow(companyId: string, chatId: string): Promise<WhatsAppWindow> {
  return apiFetch<WhatsAppWindow>(`/companies/${companyId}/whatsapp/window?chatId=${encodeURIComponent(chatId)}`);
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category?: string;
  bodyText: string;
  variableCount: number;
  headerText?: string;
  footerText?: string;
}

export async function getWhatsappTemplates(companyId: string): Promise<WhatsAppTemplate[]> {
  return apiFetch<WhatsAppTemplate[]>(`/companies/${companyId}/whatsapp/templates`);
}

export async function sendWhatsappTemplate(
  companyId: string,
  payload: { phone: string; name: string; language: string; variables: string[]; contactId?: string },
): Promise<WhatsAppMessage> {
  return apiFetch<WhatsAppMessage>(`/companies/${companyId}/whatsapp/send-template`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Media from the Cloud API is stored as "cloud-media:<id>", a file we sent as "wa-file:<id>"; both are read through the server. */
export const CLOUD_MEDIA_PREFIX = 'cloud-media:';
export const WA_FILE_PREFIX = 'wa-file:';
/** The largest file WhatsApp takes (and the server accepts). */
export const WHATSAPP_MAX_FILE_BYTES = 16 * 1024 * 1024;

const mediaCache = new Map<string, Promise<string>>();

/**
 * A URL the page can show: provider links as they are; our own and Meta's
 * through the server (signed in), kept for the session so a photo loads once.
 */
export function loadWhatsappMedia(companyId: string, mediaUrl: string): Promise<string> {
  const path = mediaUrl.startsWith(CLOUD_MEDIA_PREFIX)
    ? `media/${encodeURIComponent(mediaUrl.slice(CLOUD_MEDIA_PREFIX.length))}`
    : mediaUrl.startsWith(WA_FILE_PREFIX)
      ? `files/${encodeURIComponent(mediaUrl.slice(WA_FILE_PREFIX.length))}`
      : null;
  if (!path) return Promise.resolve(mediaUrl);
  const key = `${companyId}|${mediaUrl}`;
  let pending = mediaCache.get(key);
  if (!pending) {
    pending = (async () => {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/companies/${companyId}/whatsapp/${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `HTTP ${res.status}`);
      return URL.createObjectURL(await res.blob());
    })();
    mediaCache.set(key, pending);
    pending.catch(() => mediaCache.delete(key));
  }
  return pending;
}

const fileToBase64 = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

/** Sends a photo, document, audio or video, with an optional caption. */
export async function sendWhatsappMedia(
  companyId: string,
  payload: { phone: string; file: Blob; fileName: string; caption?: string; contactId?: string; replyToExternalId?: string },
): Promise<WhatsAppMessage> {
  const { file, ...rest } = payload;
  return apiFetch<WhatsAppMessage>(`/companies/${companyId}/whatsapp/send-media`, {
    method: 'POST',
    body: JSON.stringify({ ...rest, mimeType: file.type || 'application/octet-stream', dataBase64: await fileToBase64(file) }),
  });
}

/** How a message's attachment should be shown; older rows only say "file". */
export function whatsappMediaKind(m: Pick<WhatsAppMessage, 'type' | 'mimeType' | 'fileName'>): 'image' | 'video' | 'audio' | 'document' {
  if (m.type === 'image' || m.type === 'video' || m.type === 'audio') return m.type;
  const mime = (m.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = (m.fileName || '').toLowerCase().split('.').pop() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp4', '3gp', 'mov'].includes(ext)) return 'video';
  if (['ogg', 'oga', 'opus', 'mp3', 'm4a', 'aac', 'amr', 'wav'].includes(ext)) return 'audio';
  return 'document';
}

/** Fills {{1}}, {{2}}… the way the customer will read it. */
export function renderWhatsappTemplate(text: string, variables: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n) => variables[Number(n) - 1] || whole);
}

/** People a chat can be given to (they read WhatsApp in this company). */
export async function getWhatsappTeam(companyId: string): Promise<Array<{ id: string; name: string }>> {
  return apiFetch(`/companies/${companyId}/whatsapp/team`);
}

export interface WhatsAppNote {
  id: string;
  chatId: string;
  body: string;
  authorUserId?: string;
  authorName?: string;
  createdAt: string;
}

export async function getWhatsappNotes(companyId: string, chatId: string): Promise<WhatsAppNote[]> {
  return apiFetch(`/companies/${companyId}/whatsapp/chats/${encodeURIComponent(chatId)}/notes`);
}

export async function addWhatsappNote(companyId: string, chatId: string, body: string): Promise<WhatsAppNote> {
  return apiFetch(`/companies/${companyId}/whatsapp/chats/${encodeURIComponent(chatId)}/notes`, { method: 'POST', body: JSON.stringify({ body }) });
}

export async function deleteWhatsappNote(companyId: string, noteId: string): Promise<{ success: boolean }> {
  return apiFetch(`/companies/${companyId}/whatsapp/notes/${noteId}`, { method: 'DELETE' });
}

export interface WhatsAppQuickReply {
  id: string;
  shortcut: string;
  body: string;
}

export async function getWhatsappQuickReplies(companyId: string): Promise<WhatsAppQuickReply[]> {
  return apiFetch(`/companies/${companyId}/whatsapp/quick-replies`);
}

export async function saveWhatsappQuickReply(companyId: string, reply: { id?: string; shortcut: string; body: string }): Promise<WhatsAppQuickReply> {
  const { id, ...body } = reply;
  return apiFetch(`/companies/${companyId}/whatsapp/quick-replies${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
}

export async function deleteWhatsappQuickReply(companyId: string, id: string): Promise<{ success: boolean }> {
  return apiFetch(`/companies/${companyId}/whatsapp/quick-replies/${id}`, { method: 'DELETE' });
}

/** Sends a quotation or an invoice as its PDF (to its contact unless a number is given). */
export async function sendWhatsappDocument(
  companyId: string,
  payload: { kind: 'quotation' | 'invoice'; id: string; phone?: string; caption?: string; language?: string },
): Promise<WhatsAppMessage> {
  return apiFetch<WhatsAppMessage>(`/companies/${companyId}/whatsapp/send-document`, { method: 'POST', body: JSON.stringify(payload) });
}
