'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { AdminPage } from '@/modules/admin/components/admin-page';

export default function AdminRoute() {
  const { user, loading } = useAuthGuard(['Admin']);
  const { t } = useI18n();
  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  if (user.role !== 'Admin') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.accessDenied')}</p>
      </div>
    );
  }
  return <AdminPage />;
}
