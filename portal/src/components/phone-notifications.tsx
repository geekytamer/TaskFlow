'use client';

import { useCallback, useEffect, useState } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { pushSupport, urlBase64ToUint8Array, type PushSupport } from '@/lib/push';
import { showInstallSteps } from './install-app-card';
import { button, panel } from './ui';

/** A device that gets this person's phone notifications; `current` is the one asking. */
interface PushDevice { id: string; label: string; lastSentAt: string | null; createdAt: string; current: boolean }

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
  const [devices, setDevices] = useState<PushDevice[] | null>(null);

  /** Lists this person's devices, marking this one by its own subscription endpoint. */
  const loadDevices = useCallback(async () => {
    let endpoint: string | undefined;
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) endpoint = (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription())?.endpoint;
    } catch { /* no subscription to compare */ }
    const res = await fetch(`/api/push/devices${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`).catch(() => null);
    setDevices(res?.ok ? await res.json().catch(() => null) : null);
  }, []);

  useEffect(() => {
    if (state !== 'checking') void loadDevices();
  }, [state, loadDevices]);

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
        <div>
          {note('push.iosFirst')}
          <button type="button" onClick={showInstallSteps} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline">{t(lang, 'push.showSteps')}</button>
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
      {devices && devices.length > 0 && (
        <DeviceList lang={lang} devices={devices} onChanged={loadDevices} onRemovedCurrent={async () => {
          try { await (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription())?.unsubscribe(); } catch { /* already gone upstream */ }
          setState('off');
        }} />
      )}
    </section>
  );
}

/** The devices that get this person's phone notifications: send a test to one, or remove it. */
function DeviceList({ lang, devices, onChanged, onRemovedCurrent }: { lang: Lang; devices: PushDevice[]; onChanged: () => Promise<void>; onRemovedCurrent: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ id: string; key: Key; error?: boolean } | null>(null);
  const date = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  async function test(d: PushDevice) {
    setBusyId(d.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/push/devices/${encodeURIComponent(d.id)}/test`, { method: 'POST' });
      const r = res.ok ? await res.json() : null;
      if (r?.removed) { setStatus({ id: d.id, key: 'push.testGone' }); await onChanged(); }
      else if (r?.delivered) { setStatus({ id: d.id, key: 'push.testSent' }); await onChanged(); }
      else setStatus({ id: d.id, key: 'push.testFailed', error: true });
    } catch {
      setStatus({ id: d.id, key: 'push.testFailed', error: true });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(d: PushDevice) {
    setBusyId(d.id);
    setStatus(null);
    try {
      const res = await fetch(`/api/push/devices/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      if (d.current) await onRemovedCurrent();
      await onChanged();
    } catch {
      setStatus({ id: d.id, key: 'push.failed', error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-t border-line pt-3">
      <h3 className="text-sm font-semibold">{t(lang, 'push.devices')}</h3>
      <ul className="mt-1 divide-y divide-line">
        {devices.map((d) => (
          <li key={d.id} className="py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <bdi dir="ltr">{d.label}</bdi>
                  {d.current && <span className="ms-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{t(lang, 'push.thisDevice')}</span>}
                </p>
                <p className="text-xs text-ink-soft">
                  {d.lastSentAt ? t(lang, 'push.lastSent').replace('{when}', date(d.lastSentAt)) : t(lang, 'push.added').replace('{when}', date(d.createdAt))}
                </p>
              </div>
              <div className="flex items-center">
                <button type="button" disabled={busyId !== null} onClick={() => void test(d)} aria-label={t(lang, 'push.testTo').replace('{device}', d.label)}
                  className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-accent disabled:opacity-60">
                  {busyId === d.id ? t(lang, 'push.working') : t(lang, 'push.sendTest')}
                </button>
                <button type="button" disabled={busyId !== null} onClick={() => void remove(d)} aria-label={t(lang, 'push.remove').replace('{device}', d.label)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-ink/5 hover:text-danger disabled:opacity-60">
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
                  </svg>
                </button>
              </div>
            </div>
            {status?.id === d.id && <p role={status.error ? 'alert' : 'status'} className={`text-xs ${status.error ? 'text-danger' : 'text-ink-soft'}`}>{t(lang, status.key)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
