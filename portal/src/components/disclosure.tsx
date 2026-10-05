'use client';

import { useId, useState, type ReactNode } from 'react';

/**
 * Collapsed on phones behind a labelled button, always open on wide screens.
 * The content stays one set of fields, so a form never submits duplicates.
 */
export function Disclosure({ label, children, defaultOpen = false }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 items-center gap-2 rounded-control border border-field bg-surface px-4 text-[15px] font-semibold lg:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M3.5 6h13M6 10h8M8.5 14h3" /></svg>
        {label}
      </button>
      <div id={id} className={`${open ? 'mt-4 block' : 'hidden'} lg:mt-0 lg:block`}>{children}</div>
    </div>
  );
}
