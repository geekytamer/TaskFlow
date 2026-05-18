'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { CommissionsPageV2 as CommissionsPage } from '@/modules/crm/components/commissions-page-v2';

export default function CommissionsRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager', 'Employee', 'Accountant']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <CommissionsPage />;
}
