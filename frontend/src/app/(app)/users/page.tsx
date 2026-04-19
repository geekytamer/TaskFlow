'use client';

import * as React from 'react';
import { UsersPage } from '@/modules/users/components/users-page';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';

export default function UsersRoute() {
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
        <p className="text-muted-foreground">{t('auth.managerAdminOnly')}</p>
      </div>
    );
  }

  return <UsersPage />;
}
