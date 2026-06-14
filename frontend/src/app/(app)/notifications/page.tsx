'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { NotificationsPage } from '@/modules/notifications/components/notifications-page';

export default function NotificationsRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager', 'Accountant', 'Employee']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <NotificationsPage />;
}
