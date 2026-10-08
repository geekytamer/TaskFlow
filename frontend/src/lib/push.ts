/**
 * Browser safe. Whether this device can get phone notifications, and what to
 * tell the person when it cannot yet. iPhones and iPads get them only from
 * iOS 16.4, and only once the portal is added to the home screen.
 */

export type PushSupport = 'ok' | 'ios-install' | 'ios-too-old' | 'unsupported';

function iosVersion(ua: string, touchPoints: number): number | null {
  const os = /(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(ua);
  if (os) return Number(os[1]) + Number(os[2]) / 100;
  // iPadOS asks for desktop sites and says "Macintosh"; touch gives it away.
  if (/Macintosh/.test(ua) && touchPoints > 1) {
    const v = /Version\/(\d+)\.(\d+)/.exec(ua);
    return v ? Number(v[1]) + Number(v[2]) / 100 : 16.4;
  }
  return null;
}

export function pushSupport({ ua, standalone, hasPush, touchPoints }: { ua: string; standalone: boolean; hasPush: boolean; touchPoints: number }): PushSupport {
  const ios = iosVersion(ua, touchPoints);
  if (ios !== null) {
    if (ios < 16.04) return 'ios-too-old';
    if (!standalone) return 'ios-install';
    return hasPush ? 'ok' : 'unsupported';
  }
  return hasPush ? 'ok' : 'unsupported';
}

/** The VAPID public key as the bytes PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
