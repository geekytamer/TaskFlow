'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { PerformanceDashboard } from '@/modules/crm/components/performance-dashboard';

export default function PerformancePage() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <PerformanceDashboard />;
}
