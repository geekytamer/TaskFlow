'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { FlexiApplicationsPage } from '@/modules/portal-access/components/flexi-applications-page';
import { useCanReviewFlexi } from '@/modules/portal-access/lib/use-can-review-flexi';

export default function FlexiApplicationsRoute() {
  const { user, loading } = useAuthGuard();
  const canManage = useCanReviewFlexi();
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  if (!canManage) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.operationsOnly')}</p>
      </div>
    );
  }
  return (
    <React.Suspense fallback={null}>
      <FlexiApplicationsPage />
    </React.Suspense>
  );
}
