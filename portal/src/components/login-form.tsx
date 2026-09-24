'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, primaryButton } from './field';

export interface LoginStrings {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  failed: string;
  throttled: string;
  unavailable: string;
}

export function LoginForm({ strings }: { strings: LoginStrings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      setError(response.status === 401 ? strings.failed : response.status === 429 ? strings.throttled : strings.unavailable);
    } catch {
      setError(strings.unavailable);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field id="email" type="email" label={strings.email} autoComplete="username" required dir="ltr" />
      <Field id="password" type="password" label={strings.password} autoComplete="current-password" required />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
