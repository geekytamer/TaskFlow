/**
 * Green API client for WhatsApp (regular API — QR-linked personal/business
 * accounts, NOT WABA). Each company has one instance defined by
 * {idInstance, apiToken}. Endpoints are documented at
 * https://green-api.com/en/docs/api/.
 *
 * We deliberately keep this layer thin (no caching, no retry) so the higher
 * application layer can compose behaviour around it.
 */

import type { WhatsAppInstanceState } from '../types';

const DEFAULT_HOST = process.env.GREEN_API_HOST || 'https://api.green-api.com';
const REQUEST_TIMEOUT_MS = Number(process.env.GREEN_API_TIMEOUT_MS) || 15000;

export interface GreenApiCredentials {
  idInstance: string;
  apiToken: string;
  /** Optional override of the API host (Green API rents per-instance hosts). */
  apiHost?: string;
}

export class GreenApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'GreenApiError';
    this.status = status;
    this.body = body;
  }
}

const VALID_STATES: WhatsAppInstanceState[] = [
  'notAuthorized',
  'authorized',
  'blocked',
  'sleepMode',
  'starting',
  'yellowCard',
];

function normalizeState(raw: unknown): WhatsAppInstanceState {
  if (typeof raw !== 'string') return 'unknown';
  return VALID_STATES.includes(raw as WhatsAppInstanceState)
    ? (raw as WhatsAppInstanceState)
    : 'unknown';
}

async function call<T = any>(
  creds: GreenApiCredentials,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const host = creds.apiHost?.trim() || DEFAULT_HOST;
  const url = `${host.replace(/\/$/, '')}/waInstance${creds.idInstance}/${endpoint}/${creds.apiToken}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let payload: any = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // keep as text
    }
    if (!res.ok) {
      const msg =
        (payload && typeof payload === 'object' && (payload.message || payload.error))
          ? String(payload.message || payload.error)
          : `Green API ${endpoint} failed with status ${res.status}`;
      throw new GreenApiError(msg, res.status, payload);
    }
    return payload as T;
  } catch (err) {
    if (err instanceof GreenApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GreenApiError(`Green API ${endpoint} timed out`, 408);
    }
    throw new GreenApiError(
      err instanceof Error ? err.message : `Green API ${endpoint} failed`,
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Files go to Green API's media host: media.green-api.com for the default
 * api host, NNNN.media.greenapi.com for a rented one (NNNN.api.greenapi.com).
 */
export function greenMediaHost(apiHost?: string): string {
  if (process.env.GREEN_API_MEDIA_HOST) return process.env.GREEN_API_MEDIA_HOST.replace(/\/$/, '');
  const host = (apiHost?.trim() || DEFAULT_HOST).replace(/\/$/, '');
  if (/\/\/api\.green-api\.com$/i.test(host)) return 'https://media.green-api.com';
  if (/\.api\.greenapi\.com$/i.test(host)) return host.replace(/\.api\.greenapi\.com$/i, '.media.greenapi.com');
  return host;
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => fetch(...args);
/** Tests swap the network for a fake. */
export function setGreenFetch(fn: Fetch | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

/**
 * Convert a phone number ("+971 50 1234567" or "971501234567") into the
 * Green API chatId for personal chats: "971501234567@c.us"
 */
export function toChatId(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) throw new GreenApiError('Phone number is required.', 400);
  return `${digits}@c.us`;
}

export const greenApi = {
  async getStateInstance(creds: GreenApiCredentials) {
    const res = await call<{ stateInstance?: string }>(creds, 'GET', 'getStateInstance');
    return normalizeState(res?.stateInstance);
  },

  /**
   * QR code (base64 PNG) for linking a fresh instance. Polled by the UI
   * until state flips to "authorized".
   */
  async getQrCode(creds: GreenApiCredentials) {
    const res = await call<{ type?: string; message?: string }>(creds, 'GET', 'qr');
    return {
      type: res?.type ?? 'qrCode',
      message: res?.message ?? '',
    };
  },

  async getSettings(creds: GreenApiCredentials) {
    return call<Record<string, unknown>>(creds, 'GET', 'getSettings');
  },

  async setSettings(creds: GreenApiCredentials, settings: Record<string, unknown>) {
    return call(creds, 'POST', 'setSettings', settings);
  },

  /**
   * Wires Green API to send webhooks to our backend for this instance.
   */
  async configureWebhook(
    creds: GreenApiCredentials,
    webhookUrl: string,
    webhookToken: string,
  ) {
    return call(creds, 'POST', 'setSettings', {
      webhookUrl,
      webhookUrlToken: webhookToken,
      outgoingWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
      incomingWebhook: 'yes',
      stateWebhook: 'yes',
      deviceWebhook: 'yes',
    });
  },

  async logout(creds: GreenApiCredentials) {
    return call<{ isLogout?: boolean }>(creds, 'GET', 'logout');
  },

  async sendMessage(
    creds: GreenApiCredentials,
    chatId: string,
    message: string,
    quotedMessageId?: string,
  ): Promise<{ idMessage: string }> {
    return call(creds, 'POST', 'sendMessage', { chatId, message, ...(quotedMessageId ? { quotedMessageId } : {}) });
  },

  /** Sends a file's bytes (photo, document, audio, video) with an optional caption. */
  async sendFileByUpload(
    creds: GreenApiCredentials,
    chatId: string,
    file: { data: Buffer; fileName: string; mimeType: string; caption?: string; quotedMessageId?: string },
  ): Promise<{ idMessage: string }> {
    const url = `${greenMediaHost(creds.apiHost)}/waInstance${creds.idInstance}/sendFileByUpload/${creds.apiToken}`;
    const form = new FormData();
    form.append('chatId', chatId);
    form.append('fileName', file.fileName);
    if (file.caption) form.append('caption', file.caption);
    if (file.quotedMessageId) form.append('quotedMessageId', file.quotedMessageId);
    form.append('file', new Blob([new Uint8Array(file.data)], { type: file.mimeType }), file.fileName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 4);
    try {
      const res = await fetchImpl(url, { method: 'POST', body: form, signal: controller.signal });
      const text = await res.text();
      let payload: any = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* keep as text */
      }
      if (!res.ok || !payload?.idMessage) {
        const msg = payload && typeof payload === 'object' && (payload.message || payload.error)
          ? String(payload.message || payload.error)
          : `Green API sendFileByUpload failed with status ${res.status}`;
        throw new GreenApiError(msg, res.ok ? 502 : res.status, payload);
      }
      return { idMessage: String(payload.idMessage) };
    } catch (err) {
      if (err instanceof GreenApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') throw new GreenApiError('Green API sendFileByUpload timed out', 408);
      throw new GreenApiError(err instanceof Error ? err.message : 'Green API sendFileByUpload failed', 0);
    } finally {
      clearTimeout(timer);
    }
  },

  async sendFileByUrl(
    creds: GreenApiCredentials,
    chatId: string,
    file: { url: string; fileName: string; caption?: string },
  ): Promise<{ idMessage: string }> {
    return call(creds, 'POST', 'sendFileByUrl', {
      chatId,
      urlFile: file.url,
      fileName: file.fileName,
      caption: file.caption,
    });
  },

  async checkWhatsapp(
    creds: GreenApiCredentials,
    phoneNumber: string,
  ): Promise<{ existsWhatsapp: boolean }> {
    const digits = String(phoneNumber).replace(/\D/g, '');
    return call(creds, 'POST', 'checkWhatsapp', { phoneNumber: Number(digits) });
  },

  /**
   * Returns history for a specific chat (most recent first). `count` is
   * clamped by Green API (default 100, max 100 per call).
   */
  async getChatHistory(
    creds: GreenApiCredentials,
    chatId: string,
    count = 100,
  ): Promise<any[]> {
    const res = await call<any>(creds, 'POST', 'getChatHistory', {
      chatId,
      count: Math.min(Math.max(count, 1), 100),
    });
    return Array.isArray(res) ? res : [];
  },

  async getContactInfo(
    creds: GreenApiCredentials,
    chatId: string,
  ): Promise<{ name?: string; avatar?: string } & Record<string, any>> {
    return call(creds, 'POST', 'getContactInfo', { chatId });
  },
};
