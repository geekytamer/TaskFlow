'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { button } from './ui';

const control =
  'w-full min-h-11 rounded-control border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const readBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** "I have made a transfer": amount, date, reference and the receipt, sent for staff to check. */
export function TransferForm({ lang, invoiceId, room, currency }: { lang: Lang; invoiceId: string; room: number; currency: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [sent, setSent] = useState(false);

  if (room <= 0.0005) return <p className="text-sm text-ink-soft">{t(lang, 'cp.form.nothingLeft')}</p>;

  if (!open) {
    return (
      <div className="space-y-2">
        {sent && <p role="status" className="text-sm text-success">{t(lang, 'cp.form.sent')}</p>}
        <button type="button" className={button.primary} onClick={() => { setOpen(true); setSent(false); }}>{t(lang, 'cp.form.open')}</button>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(String(form.get('amount') ?? '').replace(/,/g, ''));
    const paidOn = String(form.get('paidOn') ?? '');
    const reference = String(form.get('reference') ?? '').trim();
    const file = form.get('receipt');
    if (!Number.isFinite(amount) || amount <= 0 || amount > room + 0.0005) return setError('cp.form.errAmount');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > today()) return setError('cp.form.errDate');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES || !TYPES.includes(file.type)) return setError('cp.form.errReceipt');
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, paidOn, reference: reference || undefined, fileName: file.name, contentBase64: await readBase64(file) }),
      });
      if (response.status === 201) {
        setOpen(false);
        setSent(true);
        router.refresh();
      } else {
        setError(response.status === 409 ? 'cp.form.errAmount' : response.status === 415 || response.status === 413 ? 'cp.form.errReceipt' : 'cp.form.errFailed');
      }
    } catch {
      setError('cp.form.errFailed');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <h3 className="text-base font-semibold">{t(lang, 'cp.form.title')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5" htmlFor={`${id}-amount`}>
          <span className="text-sm font-medium">{t(lang, 'cp.form.amount')} <bdi className="text-ink-soft">({currency})</bdi></span>
          <input id={`${id}-amount`} name="amount" inputMode="decimal" defaultValue={room.toFixed(3)} dir="ltr" className={control} />
        </label>
        <label className="block space-y-1.5" htmlFor={`${id}-date`}>
          <span className="text-sm font-medium">{t(lang, 'cp.form.date')}</span>
          <input id={`${id}-date`} name="paidOn" type="date" defaultValue={today()} max={today()} className={control} />
        </label>
      </div>
      <label className="block space-y-1.5" htmlFor={`${id}-ref`}>
        <span className="text-sm font-medium">{t(lang, 'cp.form.reference')}</span>
        <input id={`${id}-ref`} name="reference" maxLength={80} dir="auto" className={control} />
      </label>
      <label className="block space-y-1.5" htmlFor={`${id}-file`}>
        <span className="text-sm font-medium">{t(lang, 'cp.form.receipt')}</span>
        <input id={`${id}-file`} name="receipt" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm file:me-3 file:min-h-11 file:rounded-control file:border-0 file:bg-ink/[0.06] file:px-4 file:font-semibold file:text-ink" />
        <span className="block text-xs text-ink-soft">{t(lang, 'cp.form.receiptHint')}</span>
      </label>
      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={button.primary}>{busy ? t(lang, 'form.submitting') : t(lang, 'cp.form.submit')}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(null); }} className={button.secondary}>{t(lang, 'cp.form.cancel')}</button>
      </div>
    </form>
  );
}
