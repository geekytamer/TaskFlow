'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, primaryButton } from './field';

export interface AcceptStrings {
  password: string;
  confirm: string;
  submit: string;
  submitting: string;
  mismatch: string;
  tooShort: string;
  failed: string;
}

export function AcceptForm({ token, strings }: { token: string; strings: AcceptStrings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 10) return setError(strings.tooShort);
    if (password !== form.get('confirm')) return setError(strings.mismatch);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(strings.failed);
    } catch {
      setError(strings.failed);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field id="password" type="password" label={strings.password} autoComplete="new-password" required />
      <Field id="confirm" type="password" label={strings.confirm} autoComplete="new-password" required />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
