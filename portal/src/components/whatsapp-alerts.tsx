'use client';

import { useState } from 'react';
import type { AlertSettings } from '@/lib/alert-types';
import { t, type Lang } from '@/lib/i18n';

/** Opt in to WhatsApp alerts: a number, a switch, in the language of the page. */
export function WhatsAppAlerts({ lang, initial }: { lang: Lang; initial: AlertSettings }) {
  const [on, setOn] = useState(initial.whatsapp);
  const [phone, setPhone] = useState(initial.phone ? `+${initial.phone}` : '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!initial.available) return null;

  async function save(next: boolean) {
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: next, phone, lang }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 400 ? t(lang, 'alerts.errPhone') : t(lang, 'prof.errFailed'));
        setState('failed');
        return;
      }
      setOn(body.whatsapp);
      setState('saved');
    } catch {
      setError(t(lang, 'prof.errFailed'));
      setState('failed');
    }
  }

  return (
    <section aria-labelledby="alerts-title" className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="alerts-title" className="font-semibold">{t(lang, 'alerts.title')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(lang, 'alerts.body')}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? 'bg-accent text-white' : 'bg-line text-ink-soft'}`}>
          {t(lang, on ? 'alerts.on' : 'alerts.off')}
        </span>
      </div>
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void save(true); }}>
        <label className="min-w-[220px] flex-1 space-y-1">
          <span className="text-sm font-medium">{t(lang, 'alerts.phone')}</span>
          <input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="+971 50 123 4567" value={phone}
            onChange={(e) => setPhone(e.target.value)} aria-invalid={state === 'failed' || undefined}
            className="block h-11 w-full rounded-[10px] border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink" />
        </label>
        <button type="submit" disabled={state === 'saving' || !phone.trim()}
          className="inline-flex h-11 items-center justify-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60">
          {t(lang, on ? 'alerts.update' : 'alerts.turnOn')}
        </button>
        {on && (
          <button type="button" disabled={state === 'saving'} onClick={() => void save(false)}
            className="inline-flex h-11 items-center px-3 text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
            {t(lang, 'alerts.turnOff')}
          </button>
        )}
      </form>
      <p className={`mt-2 text-sm ${error ? 'text-danger' : 'text-ink-soft'}`} role="status">
        {error ?? (state === 'saved' ? t(lang, on ? 'alerts.savedOn' : 'alerts.savedOff') : t(lang, 'alerts.hint'))}
      </p>
    </section>
  );
}
