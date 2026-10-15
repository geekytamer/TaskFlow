'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { INSTALL_CARD_DISMISSED_KEY, showInstallCard } from '@/lib/push';
import { panel } from './ui';

/** Fired to bring the card back after it was dismissed (the phone card's "Show the steps"). */
export const INSTALL_CARD_SHOW_EVENT = 'portal:install-card-show';

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
 * On an iPhone or iPad in Safari: how to add the portal to the home screen,
 * which is what makes phone notifications possible there. Hidden once opened
 * from the icon, or once dismissed on this device.
 */
export function InstallAppCard({ lang }: { lang: Lang }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const check = () => setVisible(showInstallCard({ ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints ?? 0, standalone, dismissed: readDismissed() }));
    check();
    window.addEventListener(INSTALL_CARD_SHOW_EVENT, check);
    return () => window.removeEventListener(INSTALL_CARD_SHOW_EVENT, check);
  }, []);

  if (!visible) return null;

  const dismiss = () => { writeDismissed(true); setVisible(false); };
  const steps: Array<{ icon: ReactNode; text: string }> = [
    { icon: <ShareGlyph />, text: t(lang, 'push.iosStep1') },
    { icon: <AddGlyph />, text: t(lang, 'push.iosStep2') },
    { icon: <PhoneGlyph />, text: t(lang, 'install.step3') },
  ];

  return (
    <section aria-labelledby="install-app-title" className={`${panel} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="install-app-title" className="font-semibold">{t(lang, 'install.title')}</h2>
          <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-soft">{t(lang, 'install.body')}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t(lang, 'install.hide')}
          className="-me-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">{s.icon}</span>
            <span className="leading-relaxed"><span className="font-semibold tabular-nums">{i + 1}.</span> {s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const glyph = 'h-4 w-4';
/** Safari's share icon, so the step points at what they will see. */
function ShareGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V1.5M5 4.5l3-3 3 3" />
      <path d="M4.5 7H3.5v7.5h9V7h-1" />
    </svg>
  );
}
function AddGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="3" />
      <path d="M8 5.5v5M5.5 8h5" />
    </svg>
  );
}
function PhoneGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="1.5" width="8" height="13" rx="2" />
      <path d="M7 12.5h2" />
    </svg>
  );
}
