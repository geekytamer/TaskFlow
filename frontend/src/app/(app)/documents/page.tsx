'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { DocumentsPage } from '@/modules/documents/components/documents-page';
import {
  DOCUMENT_WORKSPACE_ROLES,
  canAccessDocumentWorkspace,
} from '@/modules/documents/document-workspace';

export default function DocumentsRoute() {
  const { user, loading, effectiveRole } = useAuthGuard(DOCUMENT_WORKSPACE_ROLES);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!canAccessDocumentWorkspace(effectiveRole)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.financeOnly')}</p>
      </div>
    );
  }

  return <DocumentsPage />;
}
