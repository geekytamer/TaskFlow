'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { DocumentsPage } from '@/modules/documents/components/documents-page';

export default function DocumentsRoute() {
  const { user, loading, allowed } = useAuthGuard('documents.view');
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
        <p className="text-muted-foreground">{t('auth.financeOnly')}</p>
      </div>
    );
  }

  return <DocumentsPage />;
}
