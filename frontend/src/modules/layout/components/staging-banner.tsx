'use client';

import * as React from 'react';
import { FlaskConical } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';

/**
 * Marks a staging deployment on every signed-in screen and the login page.
 *
 * Staging can hold a copy of real company data. Without a visible marker,
 * someone will eventually approve an invoice or change a permission there
 * believing it is live. Set NEXT_PUBLIC_APP_ENV=staging when building; left
 * unset, as in production, this renders nothing.
 *
 * Teal on purpose: amber already means impersonation, red means an error, and
 * indigo is the product's own brand colour.
 */
export function StagingBanner() {
  const { t } = useI18n();
  if (process.env.NEXT_PUBLIC_APP_ENV !== 'staging') return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-teal-700 px-4 py-1.5 text-sm text-white print:hidden"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{t('env.stagingTitle')}</span>
      <span className="text-xs text-teal-50/90">{t('env.stagingHint')}</span>
    </div>
  );
}
