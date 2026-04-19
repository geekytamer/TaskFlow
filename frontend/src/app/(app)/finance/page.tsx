'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { FinancePage } from '@/modules/finance/components/finance-page';
import { useI18n } from '@/context/i18n-context';

export default function FinanceRoute() {
  const { user, loading, effectiveRole } = useAuthGuard(['Admin', 'Manager', 'Accountant']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
       <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!effectiveRole || !['Admin', 'Manager', 'Accountant'].includes(effectiveRole)) {
     return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.financeOnly')}</p>
      </div>
    );
  }

  return <FinancePage />;
}
