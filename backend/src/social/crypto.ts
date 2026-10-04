import crypto from 'node:crypto';

/**
 * Social platform tokens, sealed with AES-256-GCM under a key id so keys can
 * rotate: the first key in SOCIAL_TOKEN_KEYS seals, every listed key opens.
 * Format: v1:<kid>:<iv>:<tag>:<data>, base64url parts.
 */

type Keyring = { sealWith: string; keys: Map<string, Buffer> };

// Development and tests only: a fixed key, so tokens survive restarts of the
// local server. Production refuses to run without SOCIAL_TOKEN_KEYS.
const DEV_KEY = crypto.createHash('sha256').update('taskflow-social-dev-key-not-for-production').digest();

function keyring(): Keyring {
  const raw = process.env.SOCIAL_TOKEN_KEYS?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('SOCIAL_TOKEN_KEYS must be set in production.');
    return { sealWith: 'dev', keys: new Map([['dev', DEV_KEY]]) };
  }
  const keys = new Map<string, Buffer>();
  let sealWith = '';
  for (const entry of raw.split(',')) {
    const [kid, hex] = entry.trim().split(':');
    if (!kid || !/^[0-9a-f]{64}$/i.test(hex ?? '')) throw new Error('SOCIAL_TOKEN_KEYS entries must be kid:<64 hex characters>.');
    keys.set(kid, Buffer.from(hex, 'hex'));
    sealWith ||= kid;
  }
  return { sealWith, keys };
}

export function sealToken(plain: string): string {
  const { sealWith, keys } = keyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(sealWith)!, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', sealWith, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

export function openToken(sealed: string): string {
  const [version, kid, iv, tag, data] = sealed.split(':');
  if (version !== 'v1' || !kid || !iv || !tag || !data) throw new Error('Not a sealed token.');
  const key = keyring().keys.get(kid);
  if (!key) throw new Error(`Unknown key "${kid}" for a sealed token.`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
