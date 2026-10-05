'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { button } from './ui';

const control =
  'w-full rounded-control border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

export function ReferralForm({ lang, currency, startOpen = true }: { lang: Lang; currency: string; startOpen?: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Key[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(startOpen);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const prospectName = String(form.get('prospectName') ?? '').trim();
    const prospectContact = String(form.get('prospectContact') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const valueRaw = String(form.get('estimatedValue') ?? '').trim();

    const problems: Key[] = [];
    if (prospectName.length < 2) problems.push('ref.errName');
    if (prospectContact.length < 3) problems.push('ref.errContact');
    if (description.length < 10) problems.push('ref.errDescription');
    if (valueRaw && (!Number.isFinite(Number(valueRaw)) || Number(valueRaw) < 0)) problems.push('ref.errValue');
    setErrors(problems);
    setSent(false);
    if (problems.length) return;

    setBusy(true);
    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectName, prospectContact, description, estimatedValue: valueRaw ? Number(valueRaw) : null }),
      });
      if (response.status === 201) {
        formEl.reset();
        setSent(true);
        if (!startOpen) setOpen(false);
        router.refresh();
      } else {
        setErrors([response.status === 429 ? 'ref.errTooMany' : 'ref.errFailed']);
      }
    } catch {
      setErrors(['ref.errFailed']);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setOpen(true)} className={button.primary}>{t(lang, 'ref.new')}</button>
        {sent && <p role="status" className="text-sm font-medium text-success">{t(lang, 'ref.sent')}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-panel border border-line bg-surface p-5 md:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{t(lang, 'ref.new')}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="prospectName" className="block text-sm font-medium">{t(lang, 'ref.prospectName')}</label>
          <input id="prospectName" name="prospectName" dir="auto" maxLength={120} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="prospectContact" className="block text-sm font-medium">{t(lang, 'ref.prospectContact')}</label>
          <input id="prospectContact" name="prospectContact" dir="auto" maxLength={200} aria-describedby="prospectContact-hint" className={`${control} h-11`} />
          <p id="prospectContact-hint" className="text-sm text-ink-soft">{t(lang, 'ref.prospectContactHint')}</p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium">{t(lang, 'ref.description')}</label>
          <textarea id="description" name="description" dir="auto" rows={4} maxLength={2000} className={`${control} py-2.5 leading-relaxed`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="estimatedValue" className="block text-sm font-medium">{t(lang, 'ref.estimatedValue')}</label>
          <div className="flex items-center gap-2">
            <input id="estimatedValue" name="estimatedValue" type="number" min={0} step="any" inputMode="decimal" className={`${control} h-11`} />
            <span className="text-sm font-medium text-ink-soft">{currency}</span>
          </div>
        </div>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-danger">
          {errors.map((e) => <li key={e}>{t(lang, e)}</li>)}
        </ul>
      )}
      {sent && <p role="status" className="text-sm font-medium text-success">{t(lang, 'ref.sent')}</p>}
      <button type="submit" disabled={busy} className={`${button.primary} w-full md:w-auto md:px-8`}>
        {busy ? t(lang, 'ref.submitting') : t(lang, 'ref.submit')}
      </button>
    </form>
  );
}
