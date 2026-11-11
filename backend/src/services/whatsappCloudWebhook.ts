/**
 * Reads one Meta WhatsApp Cloud API webhook delivery into the inbox:
 * new messages from customers and status updates on ours.
 * Payload shape: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

import type { DataStore } from '../data/store';
import type { WhatsAppInstance, WhatsAppMessageStatus, WhatsAppMessageType } from '../types';

/** Inbound media links point at our own proxy; the inbox fetches them signed in. */
export const CLOUD_MEDIA_PREFIX = 'cloud-media:';

interface IngestResult {
  messages: number;
  statuses: number;
  /** Ids of saved inbound messages linked to a contact (for follow-ups). */
  linkedInbound: Array<{ id: string; contactId: string }>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function readMessage(m: any): { type: WhatsAppMessageType; body: string; mediaId?: string; fileName?: string } {
  const kind = str(m?.type);
  switch (kind) {
    case 'text':
      return { type: 'text', body: str(m?.text?.body) };
    case 'image':
      return { type: 'image', body: str(m?.image?.caption), mediaId: str(m?.image?.id) || undefined, fileName: 'image' };
    case 'document':
      return {
        type: 'document',
        body: str(m?.document?.caption),
        mediaId: str(m?.document?.id) || undefined,
        fileName: str(m?.document?.filename) || 'document',
      };
    case 'audio':
    case 'voice':
      return { type: 'file', body: '', mediaId: str(m?.audio?.id || m?.voice?.id) || undefined, fileName: 'audio' };
    case 'video':
      return { type: 'file', body: str(m?.video?.caption), mediaId: str(m?.video?.id) || undefined, fileName: 'video' };
    case 'sticker':
      return { type: 'image', body: '', mediaId: str(m?.sticker?.id) || undefined, fileName: 'sticker' };
    case 'location': {
      const loc = m?.location || {};
      const where = [str(loc.name), str(loc.address)].filter(Boolean).join(' — ');
      const link = loc.latitude != null && loc.longitude != null ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}` : '';
      return { type: 'text', body: ['📍', where, link].filter(Boolean).join(' ') };
    }
    case 'button':
      return { type: 'text', body: str(m?.button?.text) };
    case 'interactive':
      return { type: 'text', body: str(m?.interactive?.button_reply?.title || m?.interactive?.list_reply?.title) };
    case 'contacts': {
      const names = (Array.isArray(m?.contacts) ? m.contacts : []).map((c: any) => {
        const phone = str(c?.phones?.[0]?.phone);
        return [str(c?.name?.formatted_name), phone].filter(Boolean).join(' ');
      });
      return { type: 'text', body: `👤 ${names.join(', ')}` };
    }
    default:
      return { type: 'text', body: '' };
  }
}

function mapStatus(raw: string): WhatsAppMessageStatus | undefined {
  switch (raw) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return undefined;
  }
}

export function ingestCloudWebhook(store: DataStore, instance: WhatsAppInstance, payload: any): IngestResult {
  const result: IngestResult = { messages: 0, statuses: 0, linkedInbound: [] };
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (str(change?.field) !== 'messages') continue;
      const value = change?.value || {};
      // One app can serve several numbers: take only this company's number.
      const numberId = str(value?.metadata?.phone_number_id);
      if (numberId && numberId !== instance.idInstance) continue;

      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const from = str(m?.from).replace(/\D/g, '');
        const externalId = str(m?.id);
        if (!from || !externalId) continue;
        const read = readMessage(m);
        const saved = store.createWhatsappMessage({
          companyId: instance.companyId,
          instanceId: instance.id,
          direction: 'inbound',
          externalId,
          chatId: `${from}@c.us`,
          phone: from,
          type: read.type,
          body: read.body,
          mediaUrl: read.mediaId ? `${CLOUD_MEDIA_PREFIX}${read.mediaId}` : undefined,
          fileName: read.mediaId ? read.fileName : undefined,
          status: 'delivered',
          receivedAt: new Date((Number(m?.timestamp) || Date.now() / 1000) * 1000),
        });
        result.messages += 1;
        if (saved.contactId) result.linkedInbound.push({ id: saved.id, contactId: saved.contactId });
      }

      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        const status = mapStatus(str(s?.status));
        const externalId = str(s?.id);
        if (!status || !externalId) continue;
        const err = Array.isArray(s?.errors) ? s.errors[0] : undefined;
        const error = err
          ? [str(err.title || err.message), str(err?.error_data?.details)].filter(Boolean).join(' — ') || `Error ${str(err.code)}`
          : undefined;
        const at = Number(s?.timestamp) ? new Date(Number(s.timestamp) * 1000) : undefined;
        store.updateWhatsappMessageStatus(externalId, status, at, error);
        result.statuses += 1;
      }
    }
  }
  return result;
}
