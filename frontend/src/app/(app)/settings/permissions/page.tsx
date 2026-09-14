'use client';

import * as React from 'react';
import { PermissionsPage } from '@/modules/permissions/components/permissions-page';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';

export default function PermissionsRoute() {
  const { user, loading, effectiveRole, allowed } = useAuthGuard(['Admin'], { permission: 'settings:administration.write' });
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.adminOnly')}</p>
      </div>
    );
  }

  return <PermissionsPage />;
}
