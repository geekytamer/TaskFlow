'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { ContactsPage } from '@/modules/contacts/components/contacts-page';

export default function ContactsRoute() {
  const { user, loading, effectiveRole } = useAuthGuard(['Admin', 'Manager', 'Accountant', 'Employee']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <ContactsPage />;
}
