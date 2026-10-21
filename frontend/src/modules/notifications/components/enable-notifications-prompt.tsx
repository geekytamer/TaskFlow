'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BellRing, X } from 'lucide-react';
import { showInstallSteps } from '@/components/install-app-card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { usePhoneNotifications } from '../use-phone-notifications';

const DISMISSED_KEY = 'taskflow_push_prompt_dismissed_at';
/** "Later" hides the prompt for two weeks on this device. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function snoozed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Asks, once per device, to turn on phone notifications: tasks, messages and
 * approvals then arrive like any app's, even with the app closed. On an iPhone
 * that has not added the app to the home screen yet, it points to how.
 * Says nothing where notifications cannot work, are already on, or were refused.
 */
export function EnableNotificationsPrompt() {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useI18n();
  const ar = language === 'ar';
  const { toast } = useToast();
  const { state, busy, failed, enable } = usePhoneNotifications();
  const [hidden, setHidden] = React.useState(true);

  React.useEffect(() => setHidden(snoozed()), []);

  // The Notifications page has the full control; no need to ask twice there.
  if (hidden || pathname === '/notifications') return null;
  if (state !== 'off' && state !== 'ios-install') return null;

  const later = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* shows again next time */ }
    setHidden(true);
  };

  const turnOn = async () => {
    if (await enable()) {
      toast({
        title: ar ? 'تم تفعيل الإشعارات' : 'Notifications are on',
        description: ar ? 'ستصلك التنبيهات على هذا الجهاز.' : 'Alerts will reach this device.',
      });
    }
  };

  const install = state === 'ios-install';

  return (
    <div
      role="region"
      aria-label={ar ? 'تفعيل الإشعارات' : 'Turn on notifications'}
      className="mb-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:items-center sm:p-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <BellRing className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {install
            ? ar ? 'لتصلك الإشعارات على الآيفون' : 'Get notifications on your iPhone'
            : ar ? 'فعّل الإشعارات على هذا الجهاز' : 'Turn on notifications for this device'}
        </p>
        <p className="text-xs text-muted-foreground">
          {install
            ? ar
              ? 'أضف التطبيق إلى الشاشة الرئيسية وافتحه من الأيقونة، ثم فعّل الإشعارات.'
              : 'Add the app to your Home Screen, open it from the icon, then turn notifications on.'
            : ar
              ? 'تصلك المهام والرسائل والموافقات حتى والتطبيق مقفل.'
              : 'Tasks, messages and approvals reach you even when the app is closed.'}
        </p>
        {failed && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {ar ? 'لم تنجح العملية. حاول مرة أخرى.' : 'That did not work. Please try again.'}
          </p>
        )}
        <div className="mt-2 flex gap-2 sm:hidden">
          {install ? (
            <Button size="sm" onClick={() => { showInstallSteps(); router.push('/notifications'); }}>
              {ar ? 'الطريقة' : 'Show me how'}
            </Button>
          ) : (
            <Button size="sm" onClick={turnOn} disabled={busy}>
              {busy ? (ar ? 'لحظة…' : 'One moment…') : ar ? 'تفعيل' : 'Turn on'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={later}>{ar ? 'لاحقاً' : 'Later'}</Button>
        </div>
      </div>
      <div className="hidden shrink-0 gap-2 sm:flex">
        {install ? (
          <Button size="sm" onClick={() => { showInstallSteps(); router.push('/notifications'); }}>
            {ar ? 'الطريقة' : 'Show me how'}
          </Button>
        ) : (
          <Button size="sm" onClick={turnOn} disabled={busy}>
            {busy ? (ar ? 'لحظة…' : 'One moment…') : ar ? 'تفعيل' : 'Turn on'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={later}>{ar ? 'لاحقاً' : 'Later'}</Button>
      </div>
      <button
        type="button"
        onClick={later}
        aria-label={ar ? 'إغلاق' : 'Close'}
        className="-m-1 rounded-md p-1 text-muted-foreground hover:text-foreground sm:hidden"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
