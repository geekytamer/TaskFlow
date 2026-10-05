'use client';

import { PageError } from '@/components/page-error';

/** Errors above the portal's own boundaries (its layout, the session check): a plain page with a retry. */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-xl px-4 py-16"><PageError reset={reset} /></main>;
}
