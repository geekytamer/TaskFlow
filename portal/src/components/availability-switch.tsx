'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AVAILABILITY, type Availability } from '@/lib/influencer-types';
import { t, type Key, type Lang } from '@/lib/i18n';

export function AvailabilitySwitch({ lang, value }: { lang: Lang; value: Availability | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  async function choose(next: Availability) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setState('saving');
    try {
      const res = await fetch('/api/profile/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('saved');
      router.refresh();
    } catch {
      setCurrent(previous);
      setState('failed');
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t(lang, 'prof.availability')}</legend>
      <div className="flex flex-wrap gap-2">
        {AVAILABILITY.map((a) => {
          const on = current === a;
          return (
            <label key={a} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors ${on ? 'border-accent bg-accent text-accent-ink' : 'border-field bg-surface hover:border-ink/60'}`}>
              <input type="radio" name="availability" className="sr-only" checked={on} disabled={state === 'saving'} onChange={() => choose(a)} />
              {t(lang, `avail.${a}` as Key)}
            </label>
          );
        })}
      </div>
      <p className="text-sm text-ink-soft" role="status">
        {state === 'saved' ? t(lang, 'prof.saved') : state === 'failed' ? t(lang, 'prof.errFailed') : t(lang, 'prof.availabilityHint')}
      </p>
    </fieldset>
  );
}
