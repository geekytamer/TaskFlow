'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { BillMatchingPage } from '@/modules/purchases/components/bill-matching-page';

export default function BillMatchingRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager', 'Accountant']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <BillMatchingPage />;
}
