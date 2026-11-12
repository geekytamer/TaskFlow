/**
 * Meta WhatsApp Cloud API client (the official WhatsApp Business Platform).
 * One company = one phone number: {phoneNumberId, accessToken, wabaId}.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Thin on purpose, like greenApi.ts: no caching, no retry.
 */

import crypto from 'node:crypto';

export const CLOUD_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const GRAPH_HOST = process.env.WHATSAPP_GRAPH_HOST || 'https://graph.facebook.com';
const REQUEST_TIMEOUT_MS = Number(process.env.WHATSAPP_CLOUD_TIMEOUT_MS) || 15000;

export interface CloudCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
}

export class CloudApiError extends Error {
  status: number;
  /** Meta's numeric error code, e.g. 131047 = outside the 24-hour window. */
  code?: number;
  body?: unknown;
  constructor(message: string, status: number, code?: number, body?: unknown) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Meta codes that mean "the 24-hour window is closed, use a template". */
export const WINDOW_CLOSED_CODES = new Set([131047, 131026]);

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => fetch(...args);
/** Tests swap the network for a fake. */
export function setCloudFetch(fn: Fetch | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

async function call<T = any>(
  creds: CloudCredentials,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${GRAPH_HOST}/${CLOUD_GRAPH_VERSION}/${path.replace(/^\//, '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let payload: any = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      /* keep as text */
    }
    if (!res.ok) {
      const err = payload && typeof payload === 'object' ? payload.error : undefined;
      const details = err?.error_data?.details;
      const msg = err?.message
        ? `${String(err.message)}${details ? ` — ${String(details)}` : ''}`
        : `WhatsApp Cloud API ${path} failed with status ${res.status}`;
      throw new CloudApiError(msg, res.status, typeof err?.code === 'number' ? err.code : undefined, payload);
    }
    return payload as T;
  } catch (err) {
    if (err instanceof CloudApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CloudApiError(`WhatsApp Cloud API ${path} timed out`, 408);
    }
    throw new CloudApiError(err instanceof Error ? err.message : `WhatsApp Cloud API ${path} failed`, 0);
  } finally {
    clearTimeout(timer);
  }
}

/** Digits only, the form Meta wants in `to`. */
export function toCloudRecipient(phoneOrChatId: string): string {
  const digits = String(phoneOrChatId).replace(/@c\.us$/, '').replace(/\D/g, '');
  if (!digits) throw new CloudApiError('Phone number is required.', 400);
  return digits;
}

/** True when Meta's X-Hub-Signature-256 header matches the raw body. */
export function verifyCloudSignature(appSecret: string, raw: Buffer | undefined, header: string): boolean {
  if (!appSecret || !raw || !header.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = crypto.createHmac('sha256', appSecret).update(raw).digest();
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export interface CloudTemplate {
  name: string;
  language: string;
  status: string;
  category?: string;
  /** Body text with {{1}}, {{2}}… placeholders. */
  bodyText: string;
  /** How many {{n}} variables the body takes. */
  variableCount: number;
  headerText?: string;
  footerText?: string;
}

export function countTemplateVariables(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** The template body with its variables filled — what the chat shows. */
export function renderTemplate(text: string, variables: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n) => variables[Number(n) - 1] ?? whole);
}

export const metaWhatsapp = {
  /** Number details; a success means the token and number id are good. */
  async getPhoneNumber(creds: CloudCredentials) {
    return call<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      name_status?: string;
    }>(creds, 'GET', `${encodeURIComponent(creds.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating,name_status`);
  },

  async sendText(creds: CloudCredentials, to: string, body: string, replyToId?: string): Promise<{ idMessage: string }> {
    const res = await call<{ messages?: Array<{ id: string }> }>(creds, 'POST', `${encodeURIComponent(creds.phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toCloudRecipient(to),
      ...(replyToId ? { context: { message_id: replyToId } } : {}),
      type: 'text',
      text: { preview_url: true, body },
    });
    const id = res?.messages?.[0]?.id;
    if (!id) throw new CloudApiError('WhatsApp Cloud API did not return a message id.', 502, undefined, res);
    return { idMessage: id };
  },

  async sendTemplate(
    creds: CloudCredentials,
    to: string,
    template: { name: string; language: string; variables: string[] },
  ): Promise<{ idMessage: string }> {
    const components = template.variables.length
      ? [{ type: 'body', parameters: template.variables.map((text) => ({ type: 'text', text })) }]
      : undefined;
    const res = await call<{ messages?: Array<{ id: string }> }>(creds, 'POST', `${encodeURIComponent(creds.phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toCloudRecipient(to),
      type: 'template',
      template: { name: template.name, language: { code: template.language }, ...(components ? { components } : {}) },
    });
    const id = res?.messages?.[0]?.id;
    if (!id) throw new CloudApiError('WhatsApp Cloud API did not return a message id.', 502, undefined, res);
    return { idMessage: id };
  },

  /** Hands a file's bytes to Meta; the id it returns is then sent as a message. */
  async uploadMedia(creds: CloudCredentials, file: { data: Buffer; fileName: string; mimeType: string }): Promise<string> {
    const url = `${GRAPH_HOST}/${CLOUD_GRAPH_VERSION}/${encodeURIComponent(creds.phoneNumberId)}/media`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', file.mimeType);
    form.append('file', new Blob([new Uint8Array(file.data)], { type: file.mimeType }), file.fileName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 4);
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${creds.accessToken}` }, body: form, signal: controller.signal });
      const payload: any = await res.json().catch(() => null);
      if (!res.ok || !payload?.id) {
        const err = payload?.error;
        throw new CloudApiError(err?.message ? String(err.message) : `WhatsApp Cloud API media upload failed with status ${res.status}`, res.ok ? 502 : res.status, typeof err?.code === 'number' ? err.code : undefined, payload);
      }
      return String(payload.id);
    } catch (err) {
      if (err instanceof CloudApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') throw new CloudApiError('WhatsApp Cloud API media upload timed out', 408);
      throw new CloudApiError(err instanceof Error ? err.message : 'WhatsApp Cloud API media upload failed', 0);
    } finally {
      clearTimeout(timer);
    }
  },

  /** Sends an uploaded file as a photo, video, audio or document. Audio takes no caption. */
  async sendMedia(
    creds: CloudCredentials,
    to: string,
    media: { kind: 'image' | 'video' | 'audio' | 'document'; mediaId: string; caption?: string; fileName?: string; replyToId?: string },
  ): Promise<{ idMessage: string }> {
    const part: Record<string, unknown> = { id: media.mediaId };
    if (media.caption && media.kind !== 'audio') part.caption = media.caption;
    if (media.kind === 'document' && media.fileName) part.filename = media.fileName;
    const res = await call<{ messages?: Array<{ id: string }> }>(creds, 'POST', `${encodeURIComponent(creds.phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toCloudRecipient(to),
      ...(media.replyToId ? { context: { message_id: media.replyToId } } : {}),
      type: media.kind,
      [media.kind]: part,
    });
    const id = res?.messages?.[0]?.id;
    if (!id) throw new CloudApiError('WhatsApp Cloud API did not return a message id.', 502, undefined, res);
    return { idMessage: id };
  },

  /** Approved templates only — the only ones Meta lets us send. */
  async listTemplates(creds: CloudCredentials): Promise<CloudTemplate[]> {
    if (!creds.wabaId) throw new CloudApiError('WhatsApp Business Account ID is not set.', 400);
    const res = await call<{ data?: any[] }>(
      creds,
      'GET',
      `${encodeURIComponent(creds.wabaId)}/message_templates?fields=name,language,status,category,components&limit=200`,
    );
    const rows = Array.isArray(res?.data) ? res.data : [];
    return rows
      .filter((t) => String(t?.status || '').toUpperCase() === 'APPROVED')
      .map((t) => {
        const components: any[] = Array.isArray(t.components) ? t.components : [];
        const part = (type: string) => components.find((c) => String(c?.type || '').toUpperCase() === type);
        const bodyText = String(part('BODY')?.text || '');
        const header = part('HEADER');
        return {
          name: String(t.name),
          language: String(t.language),
          status: 'APPROVED',
          category: t.category ? String(t.category) : undefined,
          bodyText,
          variableCount: countTemplateVariables(bodyText),
          headerText: header && String(header.format || 'TEXT').toUpperCase() === 'TEXT' && header.text ? String(header.text) : undefined,
          footerText: part('FOOTER')?.text ? String(part('FOOTER').text) : undefined,
        };
      });
  },

  /** Downloads an inbound media file (two steps: its URL, then the bytes). */
  async downloadMedia(creds: CloudCredentials, mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const meta = await call<{ url?: string; mime_type?: string }>(creds, 'GET', encodeURIComponent(mediaId));
    if (!meta?.url) throw new CloudApiError('Media not found.', 404);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 2);
    try {
      const res = await fetchImpl(meta.url, { headers: { Authorization: `Bearer ${creds.accessToken}` }, signal: controller.signal });
      if (!res.ok) throw new CloudApiError(`Media download failed with status ${res.status}`, res.status);
      return { data: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type || res.headers.get('content-type') || 'application/octet-stream' };
    } finally {
      clearTimeout(timer);
    }
  },
};
