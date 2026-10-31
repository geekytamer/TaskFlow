'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { FlexiKind } from '@/lib/flexi';
import { FilePicker, type UploadedFile } from './file-picker';

/**
 * Asks PEAK for a Peak Flexi balance: activation with the commercial
 * registration, or an increase with a 3-month statement and solvency papers.
 */
export function FlexiApplyForm({ lang, kind, balance, currency }: { lang: Lang; kind: FlexiKind; balance: number; currency: string }) {
  const router = useRouter();
  const [crNumber, setCrNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [crCopy, setCrCopy] = useState<UploadedFile[]>([]);
  const [statement, setStatement] = useState<UploadedFile[]>([]);
  const [solvency, setSolvency] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = 'h-12 w-full rounded-control border border-white/[0.16] bg-transparent px-4 text-[16px] outline-none focus:border-accent';
  const label = 'mb-2 block text-sm font-semibold';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const wanted = Number(amount);
    if (kind === 'activation' && (!crNumber.trim() || crCopy.length === 0)) return setError(t(lang, 'fx.errCr'));
    if (kind === 'increase' && (!(wanted > balance) || statement.length === 0 || solvency.length === 0)) return setError(t(lang, 'fx.errIncrease'));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/flexi/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'activation'
          ? { kind, crNumber: crNumber.trim(), note: note.trim() || undefined, fileIds: crCopy.map((f) => f.id) }
          : { kind, requestedAmount: wanted, note: note.trim() || undefined, fileIds: [...statement, ...solvency].map((f) => f.id) }),
      });
      if (response.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const body = await response.json().catch(() => ({})) as { message?: string };
      setError(response.status === 400 || response.status === 409 ? body.message ?? t(lang, 'fx.failed') : t(lang, 'fx.failed'));
    } catch {
      setError(t(lang, 'fx.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-[28px] border border-white/[0.08] p-5 card-surface sm:p-7" noValidate>
      {kind === 'activation' ? (
        <>
          <div>
            <label htmlFor="fx-cr" className={label}>{t(lang, 'fx.cr')} <span className="text-accent">*</span></label>
            <input id="fx-cr" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} required maxLength={40} inputMode="numeric" dir="ltr" className={`${input} text-start`} />
          </div>
          <fieldset>
            <legend className={label}>{t(lang, 'fx.crCopy')} <span className="text-accent">*</span></legend>
            <FilePicker lang={lang} files={crCopy} onChange={setCrCopy} disabled={busy} />
          </fieldset>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="fx-amount" className={label}>{t(lang, 'fx.amount')} <span className="text-accent">*</span></label>
            <input id="fx-amount" value={amount} onChange={(e) => setAmount(e.target.value)} required type="number" min={balance + 1} inputMode="decimal" dir="ltr" className={`${input} text-start`} />
            <p className="mt-2 text-sm text-ink-soft"><bdi>{t(lang, 'fx.amountHint').replace('{b}', formatMoney(balance, currency, lang))}</bdi></p>
          </div>
          <fieldset>
            <legend className={label}>{t(lang, 'fx.statement')} <span className="text-accent">*</span></legend>
            <FilePicker lang={lang} files={statement} onChange={setStatement} disabled={busy} />
          </fieldset>
          <fieldset>
            <legend className={label}>{t(lang, 'fx.solvency')} <span className="text-accent">*</span></legend>
            <FilePicker lang={lang} files={solvency} onChange={setSolvency} disabled={busy} />
          </fieldset>
        </>
      )}
      <div>
        <label htmlFor="fx-note" className={label}>{t(lang, 'fx.note')}</label>
        <textarea id="fx-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="w-full rounded-control border border-white/[0.16] bg-transparent px-4 py-3 text-[16px] outline-none focus:border-accent" />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-300">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex h-12 w-full items-center justify-center rounded-control bg-accent px-6 text-[16px] font-bold text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-60 sm:w-auto">
        {busy ? t(lang, 'fx.sending') : t(lang, 'fx.submit')}
      </button>
    </form>
  );
}
