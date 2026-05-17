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
    const res = await fetch(url, {
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
  ): Promise<{ idMessage: string }> {
    return call(creds, 'POST', 'sendMessage', { chatId, message });
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
};
