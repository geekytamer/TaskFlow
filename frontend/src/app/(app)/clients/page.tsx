'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { ClientsPage } from '@/modules/clients/components/clients-page';

export default function ClientsRoute() {
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
        <p className="text-muted-foreground">{t('auth.operationsOnly')}</p>
      </div>
    );
  }

  return <ClientsPage />;
}
