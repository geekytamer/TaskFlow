'use client';

import * as React from 'react';
import { Monitor, Smartphone, Trash2 } from 'lucide-react';
import { showInstallSteps } from '@/components/install-app-card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/i18n-context';
import { useBrand } from '@/modules/branding/brand-context';
import {
  listPushDevices, removePushDevice, testPushDevice, type PushDevice,
} from '@/services/notificationService';
import { announcePhoneNotificationsChanged, usePhoneNotifications } from '../use-phone-notifications';

/**
 * Turns phone notifications on or off for this device. Where it cannot work yet
 * it says why (on an iPhone: add TaskFlow to the home screen first) instead of
 * showing a button that would do nothing.
 */
export function PhoneNotificationsCard() {
  const { language } = useI18n();
  const { brandText } = useBrand();
  const tr = (en: string, ar: string) => brandText(language === 'ar' ? ar : en);
  const { state, busy, failed, enable, disable } = usePhoneNotifications();
  const [devices, setDevices] = React.useState<PushDevice[] | null>(null);

  /** Lists this person's devices, marking this one by its own subscription endpoint. */
  const loadDevices = React.useCallback(async () => {
    let endpoint: string | undefined;
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.getRegistration();
        endpoint = (await reg?.pushManager.getSubscription())?.endpoint;
      }
    } catch { /* no subscription to compare */ }
    setDevices(await listPushDevices(endpoint).catch(() => null));
  }, []);

  React.useEffect(() => {
    if (state !== 'checking') void loadDevices();
  }, [state, loadDevices]);

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
            <div className="space-y-1">
              {note('On iPhone and iPad, add TaskFlow to your Home Screen first, open it from the icon, then turn notifications on here.', 'في آيفون وآيباد أضف TaskFlow إلى الشاشة الرئيسية أولاً، وافتحه من الأيقونة، ثم فعّل الإشعارات من هنا.')}
              <Button size="sm" variant="link" className="h-auto p-0" onClick={showInstallSteps}>{tr('Show the steps', 'اعرض الخطوات')}</Button>
            </div>
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
      {devices && devices.length > 0 && (
        <DeviceList
          devices={devices}
          onChanged={loadDevices}
          onRemovedCurrent={async () => {
            try { await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().then((sub) => sub?.unsubscribe()); } catch { /* already gone upstream */ }
            announcePhoneNotificationsChanged();
          }}
        />
      )}
    </div>
  );
}

/** The devices that get this person's phone notifications: send a test to one, or remove it. */
function DeviceList({ devices, onChanged, onRemovedCurrent }: { devices: PushDevice[]; onChanged: () => Promise<void>; onRemovedCurrent: () => Promise<void> }) {
  const { language } = useI18n();
  const { brandText } = useBrand();
  const tr = (en: string, ar: string) => brandText(language === 'ar' ? ar : en);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ id: string; text: string; error?: boolean } | null>(null);
  const date = (iso: string) => new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  const test = async (d: PushDevice) => {
    setBusyId(d.id);
    setStatus(null);
    try {
      const r = await testPushDevice(d.id);
      if (r.removed) { setStatus({ id: d.id, text: tr('That device no longer accepts notifications, so it was removed.', 'هذا الجهاز لم يعد يستقبل الإشعارات، فأُزيل.') }); await onChanged(); }
      else if (r.delivered) { setStatus({ id: d.id, text: tr('Test sent. It should appear on that device in a moment.', 'أُرسل الاختبار. سيظهر على ذلك الجهاز خلال لحظات.') }); await onChanged(); }
      else setStatus({ id: d.id, text: tr('The test could not be sent. Try again in a minute.', 'تعذّر إرسال الاختبار. حاول بعد دقيقة.'), error: true });
    } catch {
      setStatus({ id: d.id, text: tr('The test could not be sent. Try again in a minute.', 'تعذّر إرسال الاختبار. حاول بعد دقيقة.'), error: true });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (d: PushDevice) => {
    setBusyId(d.id);
    setStatus(null);
    try {
      await removePushDevice(d.id);
      if (d.current) await onRemovedCurrent();
      await onChanged();
    } catch {
      setStatus({ id: d.id, text: tr('That did not work. Please try again.', 'لم تنجح العملية. حاول مرة أخرى.'), error: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 border-t pt-3">
      <h4 className="text-sm font-semibold">{tr('Your devices', 'أجهزتك')}</h4>
      <ul className="mt-2 divide-y">
        {devices.map((d) => {
          const Icon = /iPhone|iPad|Android/.test(d.label) ? Smartphone : Monitor;
          return (
            <li key={d.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <bdi>{d.label}</bdi>
                    {d.current && <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{tr('This device', 'هذا الجهاز')}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.lastSentAt ? tr(`Last notified ${date(d.lastSentAt)}`, `آخر إشعار ${date(d.lastSentAt)}`) : tr(`Added ${date(d.createdAt)}`, `أُضيف ${date(d.createdAt)}`)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => test(d)} aria-label={tr(`Send a test to ${d.label}`, `أرسل اختباراً إلى ${d.label}`)}>
                    {busyId === d.id ? tr('One moment…', 'لحظة…') : tr('Send test', 'إرسال اختبار')}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" disabled={busyId !== null} onClick={() => remove(d)} aria-label={tr(`Remove ${d.label}`, `إزالة ${d.label}`)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {status?.id === d.id && <p role={status.error ? 'alert' : 'status'} className={`mt-1 text-xs ${status.error ? 'text-destructive' : 'text-muted-foreground'}`}>{status.text}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
