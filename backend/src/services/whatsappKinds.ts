/**
 * What kind of attachment a WhatsApp message carries, and what each provider
 * accepts. Shared by sending, both webhooks and the Green API history import.
 */

import type { WhatsAppMessageType } from '../types';

/** The largest file we take in (Meta's cap for audio and video). */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
/** Meta's cap for photos. */
export const CLOUD_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const clean = (mime: string) => mime.split(';')[0].trim().toLowerCase();

export function kindFromMime(mime: string | undefined): Exclude<WhatsAppMessageType, 'text' | 'file'> {
  const m = clean(mime || '');
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Green API names the kind in `typeMessage` ("imageMessage", "audioMessage"…). */
export function kindFromGreenType(typeMessage: unknown, mime?: string): Exclude<WhatsAppMessageType, 'text' | 'file'> {
  const t = String(typeMessage || '').toLowerCase();
  if (t.startsWith('image') || t.startsWith('sticker')) return 'image';
  if (t.startsWith('video')) return 'video';
  if (t.startsWith('audio') || t.startsWith('ptt')) return 'audio';
  if (t.startsWith('document')) return mime ? kindFromMime(mime) === 'document' ? 'document' : kindFromMime(mime) : 'document';
  return kindFromMime(mime);
}

/** What Meta's Cloud API takes as each kind; anything else goes as a document. */
const CLOUD_IMAGE = new Set(['image/jpeg', 'image/png']);
const CLOUD_VIDEO = new Set(['video/mp4', 'video/3gpp']);
const CLOUD_AUDIO = new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg']);

/**
 * The kind to send a file as on the Cloud API. Audio Meta cannot play (webm
 * from some browsers' recorders) is refused rather than sent as a mystery file.
 */
export function cloudSendKind(mime: string, sizeBytes: number): { kind: 'image' | 'video' | 'audio' | 'document' } | { refuse: string } {
  const m = clean(mime);
  if (CLOUD_IMAGE.has(m)) return sizeBytes > CLOUD_MAX_IMAGE_BYTES ? { kind: 'document' } : { kind: 'image' };
  if (CLOUD_VIDEO.has(m)) return { kind: 'video' };
  if (CLOUD_AUDIO.has(m)) return { kind: 'audio' };
  if (m.startsWith('audio/')) return { refuse: 'WhatsApp cannot play this audio format. Record in another browser or attach an MP3/M4A file.' };
  return { kind: 'document' };
}

/** A safe display name: no path parts, no control characters, not empty. */
export function safeFileName(name: unknown, fallback = 'file'): string {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
  return cleaned || fallback;
}
