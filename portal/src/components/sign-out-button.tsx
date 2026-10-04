'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/session/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex min-h-11 items-center rounded-md px-2 sm:min-h-0 sm:py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
    >
      {label}
    </button>
  );
}
