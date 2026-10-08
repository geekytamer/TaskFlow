'use client';

import { useEffect, useState } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { pushSupport, urlBase64ToUint8Array, type PushSupport } from '@/lib/push';
import { button, panel } from './ui';

type State = 'checking' | PushSupport | 'not-set-up' | 'blocked' | 'off' | 'on';

/**
 * Turns phone notifications on or off for this device. Where it cannot work
 * yet it says why and what to do (on an iPhone: add to the home screen first),
 * instead of showing a button that would do nothing.
 */
export function PhoneNotifications({ lang }: { lang: Lang }) {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const support = pushSupport({
        ua: navigator.userAgent, standalone, touchPoints: navigator.maxTouchPoints ?? 0,
        hasPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
      });
      if (support !== 'ok') { setState(support); return; }
      const key = await fetch('/api/push/public-key').then((r) => r.json()).catch(() => ({ enabled: false }));
      if (!key.enabled) { setState('not-set-up'); return; }
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setBusy(true);
    setError(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
      const key = await fetch('/api/push/public-key').then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) { await sub.unsubscribe(); throw new Error('subscribe failed'); }
      setState('on');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const note = (key: Key) => <p className="text-sm leading-relaxed text-ink-soft">{t(lang, key)}</p>;
  return (
    <section aria-labelledby="push-title" className={`${panel} space-y-3 p-5`}>
      <div>
        <h2 id="push-title" className="font-semibold">{t(lang, 'push.title')}</h2>
        <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-soft">{t(lang, 'push.why')}</p>
      </div>
      {state === 'checking' && <p className="text-sm text-ink-soft">{t(lang, 'push.working')}</p>}
      {state === 'unsupported' && note('push.unsupported')}
      {state === 'ios-too-old' && note('push.iosOld')}
      {state === 'not-set-up' && note('push.notSetUp')}
      {state === 'blocked' && note('push.blocked')}
      {state === 'ios-install' && (
        <div className="space-y-2 text-sm">
          <p className="text-ink-soft">{t(lang, 'push.iosInstall')}</p>
          <ol className="list-decimal space-y-1 ps-5 leading-relaxed">
            <li>{t(lang, 'push.iosStep1')} <ShareGlyph /></li>
            <li>{t(lang, 'push.iosStep2')}</li>
            <li>{t(lang, 'push.iosStep3')}</li>
          </ol>
        </div>
      )}
      {state === 'off' && <button type="button" onClick={enable} disabled={busy} className={button.primary}>{busy ? t(lang, 'push.working') : t(lang, 'push.enable')}</button>}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-success">{t(lang, 'push.on')}</p>
          <button type="button" onClick={disable} disabled={busy} className={button.secondary}>{t(lang, 'push.disable')}</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{t(lang, 'push.failed')}</p>}
    </section>
  );
}

/** Safari's share icon, so the step points at what they will see. */
function ShareGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="inline h-4 w-4 align-[-3px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V1.5M5 4.5l3-3 3 3" />
      <path d="M4.5 7H3.5v7.5h9V7h-1" />
    </svg>
  );
}
