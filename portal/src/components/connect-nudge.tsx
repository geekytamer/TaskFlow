'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { button, panel } from './ui';

const KEY = 'portal.connectNudgeDismissed';

/** A one-time prompt on Home while no account is connected; "Not now" hides it on this device. */
export function ConnectNudge({ lang }: { lang: Lang }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(KEY) === '1'); } catch { setHidden(false); }
  }, []);
  if (hidden) return null;
  return (
    <section aria-labelledby="nudge-title" className={`${panel} flex flex-wrap items-center justify-between gap-4 p-5`}>
      <div className="min-w-0 max-w-prose">
        <h2 id="nudge-title" className="font-semibold">{t(lang, 'conn.nudgeTitle')}</h2>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{t(lang, 'conn.nudgeBody')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/connections" className={button.primary}>{t(lang, 'conn.nudgeAction')}</Link>
        <button type="button" onClick={() => { try { window.localStorage.setItem(KEY, '1'); } catch { /* private mode: hide for now only */ } setHidden(true); }} className={button.ghost}>
          {t(lang, 'conn.dismiss')}
        </button>
      </div>
    </section>
  );
}
