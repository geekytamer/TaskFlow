'use client';

import * as React from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/i18n-context';
import { pushSupport, urlBase64ToUint8Array, type PushSupport } from '@/lib/push';
import { getPushKey, subscribePush, unsubscribePush } from '@/services/notificationService';

type State = 'checking' | PushSupport | 'not-set-up' | 'blocked' | 'off' | 'on';

/**
 * Turns phone notifications on or off for this device. Where it cannot work yet
 * it says why (on an iPhone: add TaskFlow to the home screen first) instead of
 * showing a button that would do nothing.
 */
export function PhoneNotificationsCard() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [state, setState] = React.useState<State>('checking');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const support = pushSupport({
        ua: navigator.userAgent, standalone, touchPoints: navigator.maxTouchPoints ?? 0,
        hasPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
      });
      if (support !== 'ok') { setState(support); return; }
      const key = await getPushKey().catch(() => ({ enabled: false }));
      if (!key.enabled) { setState('not-set-up'); return; }
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  const enable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
      const key = await getPushKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey!) });
      try { await subscribePush(sub.toJSON()); } catch (error) { await sub.unsubscribe(); throw error; }
      setState('on');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await unsubscribePush(sub.endpoint).catch(() => undefined); await sub.unsubscribe(); }
      setState('off');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const note = (en: string, ar: string) => <p className="text-sm text-muted-foreground">{tr(en, ar)}</p>;
  return (
    <div className="mt-4 space-y-2 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="text-sm font-semibold">{tr('Phone notifications on this device', 'إشعارات الهاتف على هذا الجهاز')}</h3>
            <p className="text-sm text-muted-foreground">{tr('The Phone column above decides which categories reach your phone.', 'يحدد عمود «الهاتف» أعلاه الفئات التي تصل إلى هاتفك.')}</p>
          </div>
          {state === 'checking' && note('One moment…', 'لحظة…')}
          {state === 'unsupported' && note('This browser cannot show notifications. Use Chrome on Android, or add TaskFlow to your iPhone home screen.', 'هذا المتصفح لا يعرض الإشعارات. استخدم كروم على أندرويد، أو أضف TaskFlow إلى الشاشة الرئيسية في آيفون.')}
          {state === 'ios-too-old' && note('Update your iPhone or iPad to iOS 16.4 or later to get notifications.', 'حدّث آيفون أو آيباد إلى iOS 16.4 أو أحدث لتصلك الإشعارات.')}
          {state === 'not-set-up' && note('Phone notifications are not available on this server yet.', 'إشعارات الهاتف غير متاحة على هذا الخادم بعد.')}
          {state === 'blocked' && note('Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.', 'الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح أو الهاتف ثم عد إلى هنا.')}
          {state === 'ios-install' && (
            <ol className="list-decimal space-y-1 ps-5 text-sm">
              <li>{tr('In Safari, tap the Share button.', 'في سفاري اضغط زر المشاركة.')}</li>
              <li>{tr('Choose “Add to Home Screen”.', 'اختر «إضافة إلى الشاشة الرئيسية».')}</li>
              <li>{tr('Open TaskFlow from the new icon and turn notifications on here.', 'افتح TaskFlow من الأيقونة الجديدة وفعّل الإشعارات من هنا.')}</li>
            </ol>
          )}
          {state === 'off' && <Button size="sm" onClick={enable} disabled={busy}>{busy ? tr('One moment…', 'لحظة…') : tr('Turn on phone notifications', 'تفعيل إشعارات الهاتف')}</Button>}
          {state === 'on' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{tr('On for this device.', 'مفعّلة على هذا الجهاز.')}</span>
              <Button size="sm" variant="outline" onClick={disable} disabled={busy}>{tr('Turn off', 'إيقاف')}</Button>
            </div>
          )}
          {failed && <p role="alert" className="text-sm text-destructive">{tr('That did not work. Please try again.', 'لم تنجح العملية. حاول مرة أخرى.')}</p>}
        </div>
      </div>
    </div>
  );
}
