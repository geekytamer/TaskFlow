'use client';

import * as React from 'react';
import { SettingsPage } from '@/modules/settings/components/settings-page';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';

export default function SettingsRoute() {
  const { user, loading, effectiveRole } = useAuthGuard(['Admin']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (effectiveRole !== 'Admin') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.adminOnly')}</p>
      </div>
    );
  }

  return <SettingsPage />;
}
