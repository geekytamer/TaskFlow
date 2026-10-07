'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { todayIso } from '@/lib/calendar';
import { formatDate, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import { wsWrite } from '@/lib/workspace-client';
import { expenseCategoryKey, type OwnDeal } from '@/lib/workspace-types';
import { DeleteEntry, ExpenseForm } from './expense-form';
import { control } from './field';
import { button, Figure, list, SectionTitle } from './ui';

/** What came in on this deal and what it cost: payments, what is left, and its expenses. */
export function DealMoney({ lang, deal }: { lang: Lang; deal: OwnDeal }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const left = deal.amount === null ? null : Math.max(0, Math.round((deal.amount - deal.received) * 1000) / 1000);
  const fullyPaid = deal.amount !== null && deal.received >= deal.amount;

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const amount = Number(f.get('amount'));
    if (!String(f.get('amount') ?? '').trim() || !Number.isFinite(amount) || amount <= 0) { setError(true); return; }
    setBusy(true);
    const res = await wsWrite(`deals/${deal.id}/payments`, {
      amount, currency: deal.currency, receivedOn: f.get('receivedOn'), note: String(f.get('note') ?? '').trim() || null,
    });
    setBusy(false);
    setError(!res.ok);
    if (res.ok) { form.current?.reset(); router.refresh(); }
  }

  async function markPaid() {
    setBusy(true);
    const res = await wsWrite(`deals/${deal.id}`, { status: 'paid' });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <>
      <section aria-labelledby="payments-title" className="space-y-4">
        <SectionTitle id="payments-title">{t(lang, 'deal.payments')}</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Figure label={t(lang, 'deal.received')} value={<bdi className="tabular-nums">{formatMoney(deal.received, deal.currency, lang)}</bdi>} />
          {left !== null && <Figure label={t(lang, 'deal.left')} value={<bdi className="tabular-nums">{formatMoney(left, deal.currency, lang)}</bdi>} />}
        </dl>
        {fullyPaid && deal.status !== 'paid' && deal.status !== 'cancelled' && (
          <button type="button" onClick={markPaid} disabled={busy} className={button.primary}>{t(lang, 'deal.markPaid')}</button>
        )}
        {deal.payments.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'deal.noPayments')}</p>
        ) : (
          <ul className={list}>
            {deal.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1 py-1.5">
                  <p className="font-medium tabular-nums"><bdi>{formatMoney(p.amount, p.currency, lang)}</bdi></p>
                  <p className="truncate text-sm text-ink-soft">
                    <bdi>{formatDate(p.receivedOn, lang)}</bdi>
                    {p.note && <><span aria-hidden="true"> · </span><bdi dir="auto">{p.note}</bdi></>}
                  </p>
                </div>
                <DeleteEntry lang={lang} path={`payments/${p.id}/delete`} label={formatMoney(p.amount, p.currency, lang)} />
              </li>
            ))}
          </ul>
        )}
        <form ref={form} onSubmit={record} noValidate className="grid gap-3 sm:grid-cols-[9rem_10rem_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <label htmlFor="pay-amount" className="block text-sm font-medium">{t(lang, 'deal.amount')}</label>
            <input id="pay-amount" name="amount" inputMode="decimal" dir="ltr" defaultValue={left ? left : ''} aria-describedby="pay-currency" className={`${control} h-11 tabular-nums`} />
          </div>
          <div className="space-y-2">
            <label htmlFor="pay-date" className="block text-sm font-medium">{t(lang, 'deal.receivedOn')}</label>
            <input id="pay-date" name="receivedOn" type="date" defaultValue={todayIso()} className={`${control} h-11`} />
          </div>
          <div className="space-y-2">
            <label htmlFor="pay-note" className="block text-sm font-medium">{t(lang, 'money.note')}</label>
            <input id="pay-note" name="note" dir="auto" maxLength={500} className={`${control} h-11`} />
          </div>
          <button type="submit" disabled={busy} className={button.secondary}>{t(lang, 'deal.recordPayment')}</button>
          <p id="pay-currency" className="text-sm text-ink-soft sm:col-span-4">{t(lang, 'deal.paymentCurrency').replace('{c}', deal.currency)}</p>
        </form>
        {error && <p role="alert" className="text-sm text-danger">{t(lang, 'deal.errFailed')}</p>}
      </section>

      <section aria-labelledby="deal-expenses-title" className="space-y-4">
        <SectionTitle id="deal-expenses-title">{t(lang, 'deal.expenses')}</SectionTitle>
        {deal.expenses.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'deal.noExpenses')}</p>
        ) : (
          <ul className={list}>
            {deal.expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1 py-1.5">
                  <p className="font-medium"><span className="tabular-nums"><bdi>{formatMoney(e.amount, e.currency, lang)}</bdi></span> <span className="font-normal text-ink-soft">· {t(lang, expenseCategoryKey(e.category))}</span></p>
                  <p className="truncate text-sm text-ink-soft"><bdi>{formatDate(e.spentOn, lang)}</bdi>{e.note && <> · <bdi dir="auto">{e.note}</bdi></>}</p>
                </div>
                <DeleteEntry lang={lang} path={`expenses/${e.id}/delete`} label={t(lang, expenseCategoryKey(e.category))} />
              </li>
            ))}
          </ul>
        )}
        <ExpenseForm lang={lang} defaultCurrency={deal.currency} dealId={deal.id} />
      </section>
    </>
  );
}
