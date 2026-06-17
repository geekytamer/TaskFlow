'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { CompanyProfilePanel } from '@/modules/companies/components/company-profile-panel';

export default function CompanyProfileRoute() {
  const { user, loading, effectiveRole } = useAuthGuard(['Admin', 'Manager']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!effectiveRole || !['Admin', 'Manager'].includes(effectiveRole)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.operationsOnly')}</p>
      </div>
    );
  }

  return <CompanyProfilePanel />;
}
