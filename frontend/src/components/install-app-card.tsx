'use client';

import * as React from 'react';
import { Share, SquarePlus, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/i18n-context';
import { INSTALL_CARD_DISMISSED_KEY, showInstallCard } from '@/lib/push';

/** Fired to bring the card back after it was dismissed (the phone card's "Show the steps"). */
export const INSTALL_CARD_SHOW_EVENT = 'taskflow:install-card-show';

const readDismissed = () => {
  try { return window.localStorage.getItem(INSTALL_CARD_DISMISSED_KEY) === '1'; } catch { return false; }
};
const writeDismissed = (value: boolean) => {
  try {
    if (value) window.localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, '1');
    else window.localStorage.removeItem(INSTALL_CARD_DISMISSED_KEY);
  } catch { /* private mode: the card just comes back next time */ }
};

/** Brings the install card back on this page. */
export function showInstallSteps() {
  writeDismissed(false);
  window.dispatchEvent(new Event(INSTALL_CARD_SHOW_EVENT));
}

/**
 * On an iPhone or iPad in Safari: how to add TaskFlow to the home screen, which
 * is what makes phone notifications possible there. Hidden once opened from the
 * icon, or once dismissed on this device.
 */
export function InstallAppCard() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const check = () => setVisible(showInstallCard({ ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints ?? 0, standalone, dismissed: readDismissed() }));
    check();
    window.addEventListener(INSTALL_CARD_SHOW_EVENT, check);
    return () => window.removeEventListener(INSTALL_CARD_SHOW_EVENT, check);
  }, []);

  if (!visible) return null;

  const dismiss = () => { writeDismissed(true); setVisible(false); };
  const steps: Array<{ icon: React.ReactNode; text: string }> = [
    { icon: <Share className="h-4 w-4" aria-hidden="true" />, text: tr('In Safari, tap the Share button.', 'في سفاري اضغط زر المشاركة.') },
    { icon: <SquarePlus className="h-4 w-4" aria-hidden="true" />, text: tr('Choose “Add to Home Screen”.', 'اختر «إضافة إلى الشاشة الرئيسية».') },
    { icon: <Smartphone className="h-4 w-4" aria-hidden="true" />, text: tr('Open TaskFlow from the new icon.', 'افتح TaskFlow من الأيقونة الجديدة.') },
  ];

  return (
    <section aria-labelledby="install-app-title" className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="install-app-title" className="font-semibold">{tr('Add TaskFlow to your Home Screen', 'أضف TaskFlow إلى الشاشة الرئيسية')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tr('On iPhone and iPad, phone notifications work only from the Home Screen icon.', 'في آيفون وآيباد تعمل إشعارات الهاتف فقط من أيقونة الشاشة الرئيسية.')}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="-me-2 -mt-1 h-9 w-9 shrink-0" onClick={dismiss} aria-label={tr('Hide these steps', 'إخفاء هذه الخطوات')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">{s.icon}</span>
            <span><span className="font-medium tabular-nums">{i + 1}.</span> {s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
