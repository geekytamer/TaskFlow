import webpush from 'web-push';
import { HttpError } from '../http';
import type { DataStore } from '../data/store';
import type { PushAudience } from './push-store';

/**
 * Phone notifications through Web Push (VAPID). Off unless PUSH_VAPID_PUBLIC_KEY,
 * PUSH_VAPID_PRIVATE_KEY and PUSH_SUBJECT are set. A payload says what happened
 * and where to look; never amounts, rates or anything a lock screen should not show.
 */

export interface PushPayload { title: string; body: string; url: string; tag: string }
export interface DeviceSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
/** Sends one payload to one device; resolves with the push service's status. Tests inject a fake. */
export type PushSender = (subscription: DeviceSubscription, payload: string) => Promise<{ statusCode: number }>;
export interface PushConfig { publicKey: string; send: PushSender }

export function pushConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PushConfig | undefined {
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY;
  const privateKey = env.PUSH_VAPID_PRIVATE_KEY;
  const subject = env.PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return undefined;
  const details = { subject, publicKey, privateKey };
  return {
    publicKey,
    send: async (subscription, payload) => {
      try {
        const res = await webpush.sendNotification(subscription, payload, { vapidDetails: details, TTL: 24 * 60 * 60 });
        return { statusCode: res.statusCode };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (typeof status === 'number') return { statusCode: status };
        throw error;
      }
    },
  };
}

/** Reads a browser PushSubscription.toJSON() body. */
export function parseSubscription(body: unknown): DeviceSubscription {
  const b = (body ?? {}) as Record<string, unknown>;
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const ok = typeof b.endpoint === 'string' && /^https:\/\/\S{1,2000}$/.test(b.endpoint)
    && typeof keys.p256dh === 'string' && keys.p256dh.length > 0 && keys.p256dh.length < 200
    && typeof keys.auth === 'string' && keys.auth.length > 0 && keys.auth.length < 100;
  if (!ok) throw new HttpError(400, 'Send the browser push subscription: an https endpoint with its p256dh and auth keys.');
  return { endpoint: b.endpoint as string, keys: { p256dh: keys.p256dh as string, auth: keys.auth as string } };
}

/**
 * Sends to every device of one person. A device the push service reports gone
 * (404 or 410) is removed; a network error leaves it for next time. Returns how
 * many devices accepted it.
 */
export async function sendToPrincipal(store: DataStore, send: PushSender, audience: PushAudience, principalId: string, payload: PushPayload): Promise<number> {
  let delivered = 0;
  const body = JSON.stringify(payload);
  for (const s of store.push.forPrincipal(audience, principalId)) {
    try {
      const { statusCode } = await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      if (statusCode === 404 || statusCode === 410) { store.push.remove(s.id); continue; }
      if (statusCode >= 200 && statusCode < 300) { store.push.markSent(s.id); delivered += 1; }
    } catch {
      // Unreachable for now; the device stays and the next notification tries again.
    }
  }
  return delivered;
}
