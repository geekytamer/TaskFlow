'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { todayIso } from '@/lib/calendar';
import { t, type Key, type Lang } from '@/lib/i18n';
import { wsWrite } from '@/lib/workspace-client';
import { EXPENSE_CATEGORIES, expenseCategoryKey } from '@/lib/workspace-types';
import { control } from './field';
import { button, panel } from './ui';

const CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP'];

/**
 * Adding an expense: closed behind one button until needed. On a deal page the
 * deal and its currency are fixed; on Money the deal is optional.
 */
export function ExpenseForm({ lang, defaultCurrency, dealId, deals }: {
  lang: Lang;
  defaultCurrency: string;
  dealId?: string;
  deals?: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const currencies = CURRENCIES.includes(defaultCurrency) ? CURRENCIES : [defaultCurrency, ...CURRENCIES];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const amount = Number(f.get('amount'));
    if (!String(f.get('amount') ?? '').trim() || !Number.isFinite(amount) || amount < 0) { setError('deal.errAmount'); return; }
    setBusy(true);
    const res = await wsWrite('expenses', {
      dealId: dealId ?? (f.get('dealId') || null), category: f.get('category'), amount, currency: f.get('currency'),
      spentOn: f.get('spentOn'), note: String(f.get('note') ?? '').trim() || null,
    });
    setBusy(false);
    if (!res.ok) { setError('deal.errFailed'); return; }
    setError(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className={button.secondary}>{t(lang, 'money.addExpense')}</button>;

  const label = 'block text-sm font-medium';
  const id = (k: string) => `exp-${dealId ?? 'any'}-${k}`;
  return (
    <form onSubmit={onSubmit} noValidate className={`${panel} space-y-4 p-4 sm:p-5`}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <div className="space-y-2">
          <label htmlFor={id('category')} className={label}>{t(lang, 'money.category')}</label>
          <select id={id('category')} name="category" defaultValue="production" className={`${control} h-11`}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(lang, expenseCategoryKey(c))}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor={id('amount')} className={label}>{t(lang, 'deal.amount')}</label>
          <input id={id('amount')} name="amount" inputMode="decimal" dir="ltr" required className={`${control} h-11 tabular-nums`} />
        </div>
        <div className="space-y-2">
          <label htmlFor={id('currency')} className={label}>{t(lang, 'deal.currency')}</label>
          <select id={id('currency')} name="currency" defaultValue={defaultCurrency} disabled={Boolean(dealId)} className={`${control} h-11`}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {dealId && <input type="hidden" name="currency" value={defaultCurrency} />}
        </div>
      </div>
      <div className={`grid gap-4 ${deals ? 'sm:grid-cols-2' : ''}`}>
        <div className="space-y-2">
          <label htmlFor={id('date')} className={label}>{t(lang, 'money.spentOn')}</label>
          <input id={id('date')} name="spentOn" type="date" required defaultValue={todayIso()} className={`${control} h-11`} />
        </div>
        {deals && (
          <div className="space-y-2">
            <label htmlFor={id('deal')} className={label}>{t(lang, 'money.forDeal')}</label>
            <select id={id('deal')} name="dealId" defaultValue="" className={`${control} h-11`}>
              <option value="">{t(lang, 'money.noDeal')}</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor={id('note')} className={label}>{t(lang, 'money.note')}</label>
        <input id={id('note')} name="note" dir="auto" maxLength={500} className={`${control} h-11`} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={button.primary}>{busy ? t(lang, 'deal.saving') : t(lang, 'money.addExpense')}</button>
        <button type="button" onClick={() => setOpen(false)} className={button.secondary}>{t(lang, 'deal.cancelEdit')}</button>
      </div>
    </form>
  );
}

/** Deletes one payment or expense, after asking. */
export function DeleteEntry({ lang, path, label }: { lang: Lang; path: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`${t(lang, 'money.delete')}: ${label}`}
      onClick={async () => {
        if (!window.confirm(t(lang, 'money.deleteConfirm'))) return;
        setBusy(true);
        const res = await wsWrite(path);
        setBusy(false);
        if (res.ok) router.refresh();
      }}
      className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-ink-soft hover:text-danger"
    >
      {t(lang, 'money.delete')}
    </button>
  );
}
