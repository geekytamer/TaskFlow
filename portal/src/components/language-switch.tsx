'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function LanguageSwitch({ lang }: { lang: 'en' | 'ar' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const target = lang === 'ar' ? 'en' : 'ar';

  async function switchTo() {
    await fetch('/api/lang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: target }),
    });
    start(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={pending}
      lang={target}
      className="inline-flex min-h-11 items-center rounded-md px-2 sm:min-h-0 sm:py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
    >
      {target === 'ar' ? 'العربية' : 'English'}
    </button>
  );
}
