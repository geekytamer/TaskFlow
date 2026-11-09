'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { PayoutAccount, PayoutMethod } from '@/lib/influencer-types';
import { t, type Key, type Lang } from '@/lib/i18n';
import { control, Field, primaryButton } from './field';

const METHODS: PayoutMethod[] = ['Bank transfer', 'Wallet', 'Cash', 'Other'];

/**
 * Asks to be paid to one account. Sent as a change request: the account
 * manager checks it before it replaces what is on file.
 */
export function PayoutDetailsForm({ lang, current }: { lang: Lang; current: PayoutAccount | undefined }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PayoutMethod>(current?.method ?? 'Bank transfer');
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
        {t(lang, current ? 'payd.edit' : 'payd.add')}
      </button>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim() || undefined;
    const account: Partial<PayoutAccount> = {
      ...(current?.id ? { id: current.id } : {}),
      method,
      accountHolder: value('accountHolder'),
      ...(method === 'Bank transfer'
        ? { bankName: value('bankName'), iban: value('iban'), accountNumber: value('accountNumber'), swift: value('swift') }
        : {}),
      ...(method === 'Wallet' ? { walletNumber: value('walletNumber') } : {}),
    };
    if (method === 'Bank transfer' && !account.iban && !account.accountNumber) { setError('payd.errMissing'); return; }
    if (method === 'Wallet' && !account.walletNumber) { setError('payd.errMissing'); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/change-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payoutAccounts: [account] }),
      });
      if (res.status === 201) { router.refresh(); return; }
      setError(res.status === 409 ? 'prof.errPending' : res.status === 400 ? 'payd.errInvalid' : 'prof.errFailed');
    } catch {
      setError('prof.errFailed');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-xl border border-line bg-surface p-5 md:p-6">
      <div className="space-y-2">
        <label htmlFor="payoutMethod" className="block text-sm font-medium">{t(lang, 'payd.method')}</label>
        <select id="payoutMethod" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)} className={`${control} h-11`}>
          {METHODS.map((m) => <option key={m} value={m}>{t(lang, `payd.m.${m}` as Key)}</option>)}
        </select>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="accountHolder" label={t(lang, 'payd.holder')} dir="auto" maxLength={120} autoComplete="name" defaultValue={current?.accountHolder ?? ''} />
        {method === 'Bank transfer' && (
          <>
            <Field id="bankName" label={t(lang, 'payd.bank')} dir="auto" maxLength={120} defaultValue={current?.bankName ?? ''} />
            <Field id="iban" label={t(lang, 'payd.iban')} dir="ltr" maxLength={40} autoCapitalize="characters" spellCheck={false} placeholder="OM81 0180 0000 0129 9123 456" defaultValue={current?.iban ?? ''} />
            <Field id="accountNumber" label={t(lang, 'payd.accountNumber')} dir="ltr" maxLength={40} inputMode="numeric" spellCheck={false} defaultValue={current?.accountNumber ?? ''} />
            <Field id="swift" label={t(lang, 'payd.swift')} dir="ltr" maxLength={15} autoCapitalize="characters" spellCheck={false} defaultValue={current?.swift ?? ''} />
          </>
        )}
        {method === 'Wallet' && (
          <Field id="walletNumber" label={t(lang, 'payd.wallet')} dir="ltr" maxLength={40} inputMode="tel" defaultValue={current?.walletNumber ?? ''} />
        )}
      </div>
      {method === 'Bank transfer' && <p className="text-sm text-ink-soft">{t(lang, 'payd.hint')}</p>}
      {error && <p role="alert" className="text-sm text-danger">{t(lang, error)}</p>}
      <button type="submit" disabled={busy} className={`${primaryButton} md:w-auto md:px-8`}>{t(lang, 'payd.submit')}</button>
    </form>
  );
}
