import crypto from 'node:crypto';

/**
 * A notification button ("Mark done") acts without a session, so the push
 * carries a short-lived signed token naming who may do what to which thread.
 * The token only says what was offered; the route re-checks access on use.
 * Format: base64url(JSON claims) "." base64url(HMAC-SHA256).
 */

export type PushAction = 'done';
export interface ActionClaims { userId: string; threadId: string; action: PushAction }

export const ACTION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** PUSH_ACTION_SECRET, else derived from the VAPID private key; read on each call so tests can set it. */
function secret(): string | undefined {
  const explicit = process.env.PUSH_ACTION_SECRET;
  if (explicit) return explicit;
  const vapid = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (!vapid) return undefined;
  return crypto.createHash('sha256').update(`taskflow-push-action:${vapid}`).digest('hex');
}

/** Whether tokens can be signed here (no key, no action buttons). */
export const canSignActionTokens = (): boolean => !!secret();

const mac = (key: string, body: string) => crypto.createHmac('sha256', key).update(body).digest();

export function signActionToken(claims: ActionClaims, ttlMs: number = ACTION_TOKEN_TTL_MS): string {
  const key = secret();
  if (!key) throw new Error('PUSH_ACTION_SECRET (or PUSH_VAPID_PRIVATE_KEY) is not set.');
  const body = Buffer.from(JSON.stringify({ u: claims.userId, t: claims.threadId, a: claims.action, exp: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${mac(key, body).toString('base64url')}`;
}

/** The claims of a genuine, unexpired token; null for anything else. */
export function verifyActionToken(token: string): ActionClaims | null {
  const key = secret();
  if (!key || typeof token !== 'string' || token.length > 1000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  const expected = mac(key, body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims: Record<string, unknown>;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!claims || typeof claims !== 'object') return null;
  const { u, t, a, exp } = claims;
  if (typeof u !== 'string' || typeof t !== 'string' || a !== 'done' || typeof exp !== 'number') return null;
  if (!(exp > Date.now())) return null;
  return { userId: u, threadId: t, action: a };
}
