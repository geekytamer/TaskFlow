/**
 * One way to send a WhatsApp text, whichever provider the company uses
 * (Green API or Meta's Cloud API). Callers record the message themselves.
 */

import type { DataStore } from '../data/store';
import { greenApi, toChatId, GreenApiError } from './greenApi';
import { metaWhatsapp, CloudApiError, WINDOW_CLOSED_CODES } from './metaWhatsapp';
import { cloudSendKind, kindFromMime } from './whatsappKinds';
import type { WhatsAppMessageType } from '../types';

/** Meta lets a business send free text only this long after the customer's last message. */
export const CLOUD_WINDOW_MS = 24 * 60 * 60 * 1000;

export class WhatsappSendError extends Error {
  status: number;
  /** 'windowClosed' = Cloud API, outside 24h: send an approved template. */
  reason?: 'windowClosed' | 'notConnected';
  constructor(message: string, status: number, reason?: WhatsappSendError['reason']) {
    super(message);
    this.name = 'WhatsappSendError';
    this.status = status;
    this.reason = reason;
  }
}

export interface ConversationWindow {
  provider: 'green' | 'cloud';
  /** Free text allowed now. Always true on Green API. */
  open: boolean;
  /** When the window closes (Cloud API, open window only). */
  closesAt?: string;
  lastInboundAt?: string;
}

export function conversationWindow(store: DataStore, companyId: string, chatId: string, now = new Date()): ConversationWindow {
  const instance = store.getWhatsappInstanceForCompany(companyId);
  if (!instance || instance.provider !== 'cloud') return { provider: 'green', open: true };
  const last = store.lastWhatsappInboundAt(companyId, chatId);
  if (!last) return { provider: 'cloud', open: false };
  const closes = last.getTime() + CLOUD_WINDOW_MS;
  return {
    provider: 'cloud',
    open: closes > now.getTime(),
    closesAt: closes > now.getTime() ? new Date(closes).toISOString() : undefined,
    lastInboundAt: last.toISOString(),
  };
}

/** Turns a provider error into a send error with a fitting HTTP status. */
export function toSendError(error: unknown): unknown {
  if (error instanceof CloudApiError) {
    if (error.code !== undefined && WINDOW_CLOSED_CODES.has(error.code)) {
      return new WhatsappSendError(
        'This customer has not written in the last 24 hours: send an approved template instead.',
        409,
        'windowClosed',
      );
    }
    return new WhatsappSendError(error.message, error.status >= 400 && error.status < 600 ? error.status : 502);
  }
  if (error instanceof GreenApiError) {
    return new WhatsappSendError(error.message, error.status >= 400 && error.status < 600 ? error.status : 502);
  }
  return error;
}

/**
 * Sends free text from the company's connected number. On Cloud API it
 * refuses up front when the 24-hour window is closed (no wasted call to Meta).
 */
export async function sendWhatsappText(
  store: DataStore,
  companyId: string,
  phone: string,
  text: string,
  replyToExternalId?: string,
): Promise<{ idMessage: string; chatId: string; instanceId: string; provider: 'green' | 'cloud' }> {
  const instance = store.getWhatsappInstanceForCompany(companyId);
  if (!instance) throw new WhatsappSendError('WhatsApp is not connected.', 404, 'notConnected');
  const chatId = toChatId(phone);
  try {
    if (instance.provider === 'cloud') {
      const creds = store.getWhatsappCloudCredentials(companyId);
      if (!creds) throw new WhatsappSendError('WhatsApp credentials missing.', 500, 'notConnected');
      if (!conversationWindow(store, companyId, chatId).open) {
        throw new WhatsappSendError(
          'This customer has not written in the last 24 hours: send an approved template instead.',
          409,
          'windowClosed',
        );
      }
      const sent = await metaWhatsapp.sendText(creds, chatId, text, replyToExternalId);
      return { ...sent, chatId, instanceId: instance.id, provider: 'cloud' };
    }
    const creds = store.getWhatsappCredentials(companyId);
    if (!creds) throw new WhatsappSendError('WhatsApp credentials missing.', 500, 'notConnected');
    const sent = await greenApi.sendMessage(creds, chatId, text, replyToExternalId);
    return { ...sent, chatId, instanceId: instance.id, provider: 'green' };
  } catch (error) {
    throw toSendError(error);
  }
}

/**
 * Sends a file (photo, document, audio, video) with an optional caption.
 * Returns the kind it went as, so the chat can show it the same way.
 */
export async function sendWhatsappMedia(
  store: DataStore,
  companyId: string,
  phone: string,
  file: { data: Buffer; fileName: string; mimeType: string; caption?: string; replyToExternalId?: string },
): Promise<{ idMessage: string; chatId: string; instanceId: string; provider: 'green' | 'cloud'; kind: WhatsAppMessageType }> {
  const instance = store.getWhatsappInstanceForCompany(companyId);
  if (!instance) throw new WhatsappSendError('WhatsApp is not connected.', 404, 'notConnected');
  const chatId = toChatId(phone);
  try {
    if (instance.provider === 'cloud') {
      const creds = store.getWhatsappCloudCredentials(companyId);
      if (!creds) throw new WhatsappSendError('WhatsApp credentials missing.', 500, 'notConnected');
      if (!conversationWindow(store, companyId, chatId).open) {
        throw new WhatsappSendError(
          'This customer has not written in the last 24 hours: send an approved template instead.',
          409,
          'windowClosed',
        );
      }
      const decided = cloudSendKind(file.mimeType, file.data.length);
      if ('refuse' in decided) throw new WhatsappSendError(decided.refuse, 415);
      const mediaId = await metaWhatsapp.uploadMedia(creds, file);
      const sent = await metaWhatsapp.sendMedia(creds, chatId, {
        kind: decided.kind,
        mediaId,
        caption: file.caption,
        fileName: file.fileName,
        replyToId: file.replyToExternalId,
      });
      // Audio carries no caption on WhatsApp: the words go as their own message, so nothing typed is lost.
      if (decided.kind === 'audio' && file.caption) await metaWhatsapp.sendText(creds, chatId, file.caption).catch(() => undefined);
      return { ...sent, chatId, instanceId: instance.id, provider: 'cloud', kind: decided.kind };
    }
    const creds = store.getWhatsappCredentials(companyId);
    if (!creds) throw new WhatsappSendError('WhatsApp credentials missing.', 500, 'notConnected');
    const sent = await greenApi.sendFileByUpload(creds, chatId, {
      data: file.data,
      fileName: file.fileName,
      mimeType: file.mimeType,
      caption: file.caption,
      quotedMessageId: file.replyToExternalId,
    });
    return { ...sent, chatId, instanceId: instance.id, provider: 'green', kind: kindFromMime(file.mimeType) };
  } catch (error) {
    throw toSendError(error);
  }
}
