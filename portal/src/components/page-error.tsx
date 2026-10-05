'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { button } from './ui';

/** A page that failed to load: say so plainly and offer the retry. */
export function PageError({ reset }: { reset: () => void }) {
  // The page language lives on <html>; the error boundary has no server props.
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');
  // reset() alone re-renders what failed; refresh() asks the server for the data again.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  useEffect(() => { setLang(document.documentElement.lang === 'ar' ? 'ar' : 'en'); }, []);
  return (
    <div role="alert" className="max-w-xl py-10">
      <h1 className="text-[28px] font-semibold tracking-tight">{t(lang, 'state.errorTitle')}</h1>
      <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'state.errorBody')}</p>
      <button type="button" onClick={retry} className={`${button.primary} mt-6`}>{t(lang, 'state.retry')}</button>
    </div>
  );
}
