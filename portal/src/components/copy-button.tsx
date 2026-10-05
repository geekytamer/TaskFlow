'use client';

import { useState } from 'react';

/** Copies a value (an IBAN, a reference) and says so, for people paying from a phone. */
export function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
      }}
      className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent/10"
    >
      <span aria-live="polite">{copied ? done : label}</span>
    </button>
  );
}
