'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { wsWrite } from '@/lib/workspace-client';
import { DEAL_STATUSES, dealStatusKey, type DealSummary, type WsContact } from '@/lib/workspace-types';
import { control } from './field';
import { button } from './ui';

const CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP'];

/**
 * Adding or editing one of the influencer's own deals. The checks here only
 * save a round trip; the server checks everything again.
 */
export function DealForm({ lang, contacts, defaultCurrency, deal, presetContactId, onDone }: {
  lang: Lang;
  contacts: WsContact[];
  defaultCurrency: string;
  deal?: DealSummary;
  presetContactId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Key[]>([]);
  const [busy, setBusy] = useState(false);
  const currencies = CURRENCIES.includes(deal?.currency ?? defaultCurrency) ? CURRENCIES : [deal?.currency ?? defaultCurrency, ...CURRENCIES];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value = (k: string) => String(f.get(k) ?? '').trim();
    const amountRaw = value('amount');
    const problems: Key[] = [];
    if (value('title').length < 2) problems.push('deal.errTitle');
    if (amountRaw && (!Number.isFinite(Number(amountRaw)) || Number(amountRaw) < 0)) problems.push('deal.errAmount');
    if (value('startDate') && value('endDate') && value('endDate') < value('startDate')) problems.push('deal.errDates');
    setErrors(problems);
    if (problems.length) return;

    setBusy(true);
    const body = {
      title: value('title'), wsContactId: value('wsContactId') || null, amount: amountRaw === '' ? null : Number(amountRaw),
      currency: value('currency'), status: value('status'), startDate: value('startDate') || null, endDate: value('endDate') || null,
      notes: value('notes') || null,
    };
    const res = await wsWrite<{ id: string }>(deal ? `deals/${deal.id}` : 'deals', body);
    setBusy(false);
    if (!res.ok || !res.data) { setErrors(['deal.errFailed']); return; }
    if (deal) { onDone?.(); router.refresh(); } else router.push(`/deals/${res.data.id}`);
  }

  const label = 'block text-sm font-medium';
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="deal-title" className={label}>{t(lang, 'deal.titleField')}</label>
        <input id="deal-title" name="title" dir="auto" required maxLength={160} defaultValue={deal?.title} placeholder={t(lang, 'deal.titleHint')} className={`${control} h-11`} />
      </div>

      <div className="space-y-2">
        <label htmlFor="deal-brand" className={label}>{t(lang, 'deal.brand')}</label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <select id="deal-brand" name="wsContactId" defaultValue={deal?.brand?.id ?? presetContactId ?? ''} className={`${control} h-11 sm:max-w-xs`}>
            <option value="">{t(lang, 'deal.noBrand')}</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.name} · ${c.company}` : c.name}</option>)}
          </select>
          {!deal && <Link href="/contacts?new=1" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline">{t(lang, 'deal.addContact')}</Link>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <label htmlFor="deal-amount" className={label}>{t(lang, 'deal.amount')}</label>
          <input id="deal-amount" name="amount" inputMode="decimal" dir="ltr" defaultValue={deal?.amount ?? ''} className={`${control} h-11 tabular-nums`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="deal-currency" className={label}>{t(lang, 'deal.currency')}</label>
          <select id="deal-currency" name="currency" defaultValue={deal?.currency ?? defaultCurrency} className={`${control} h-11`}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="deal-status" className={label}>{t(lang, 'deal.status')}</label>
          <select id="deal-status" name="status" defaultValue={deal?.status ?? 'confirmed'} className={`${control} h-11`}>
            {DEAL_STATUSES.map((s) => <option key={s} value={s}>{t(lang, dealStatusKey(s))}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="deal-start" className={label}>{t(lang, 'deal.start')}</label>
          <input id="deal-start" name="startDate" type="date" defaultValue={deal?.startDate ?? ''} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="deal-end" className={label}>{t(lang, 'deal.end')}</label>
          <input id="deal-end" name="endDate" type="date" defaultValue={deal?.endDate ?? ''} className={`${control} h-11`} />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="deal-notes" className={label}>{t(lang, 'deal.notes')}</label>
        <textarea id="deal-notes" name="notes" dir="auto" rows={3} maxLength={4000} defaultValue={deal?.notes ?? ''} className={`${control} py-2.5 leading-relaxed`} />
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-danger">{errors.map((e) => <li key={e}>{t(lang, e)}</li>)}</ul>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={button.primary}>{busy ? t(lang, 'deal.saving') : t(lang, deal ? 'deal.save' : 'deal.create')}</button>
        {deal && <button type="button" onClick={onDone} className={button.secondary}>{t(lang, 'deal.cancelEdit')}</button>}
      </div>
    </form>
  );
}
