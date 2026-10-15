'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { InboxPage } from '@/modules/conversations/components/inbox-page';

export default function InboxRoute() {
  const { user, loading } = useAuthGuard();
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  return (
    <React.Suspense fallback={null}>
      <InboxPage />
    </React.Suspense>
  );
}
