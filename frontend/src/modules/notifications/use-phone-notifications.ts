'use client';

import * as React from 'react';
import { pushSupport, urlBase64ToUint8Array, type PushSupport } from '@/lib/push';
import { getPushKey, subscribePush, unsubscribePush } from '@/services/notificationService';

export type PhoneNotificationState = 'checking' | PushSupport | 'not-set-up' | 'blocked' | 'off' | 'on';

/** Notifies other parts of the page (the prompt, the settings card) that this device changed. */
const CHANGED_EVENT = 'phone-notifications-changed';

/** Tell every view of this device's notifications to look again. */
export function announcePhoneNotificationsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

async function readState(): Promise<PhoneNotificationState> {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const support = pushSupport({
    ua: navigator.userAgent,
    standalone,
    touchPoints: navigator.maxTouchPoints ?? 0,
    hasPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  });
  if (support !== 'ok') return support;
  const key = await getPushKey().catch(() => ({ enabled: false }));
  if (!key.enabled) return 'not-set-up';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

/**
 * Phone notifications for this device: whether they can work here, and turning
 * them on or off. Turning on must start from a tap (browsers require it).
 */
export function usePhoneNotifications() {
  const [state, setState] = React.useState<PhoneNotificationState>('checking');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    const refresh = () => readState().then((s) => live && setState(s)).catch(() => live && setState('unsupported'));
    void refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => {
      live = false;
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  }, []);

  const enable = React.useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return false;
      }
      const key = await getPushKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey!) });
      try { await subscribePush(sub.toJSON()); } catch (error) { await sub.unsubscribe(); throw error; }
      setState('on');
      announcePhoneNotificationsChanged();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = React.useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await unsubscribePush(sub.endpoint).catch(() => undefined); await sub.unsubscribe(); }
      setState('off');
      announcePhoneNotificationsChanged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, failed, enable, disable };
}
