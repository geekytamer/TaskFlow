'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { ContactDetailPage } from '@/modules/contacts/components/contact-detail-page';

export default function ContactDetailRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager', 'Accountant', 'Employee']);
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const contactId = params?.id;

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!contactId) {
    return <div className="p-6 text-sm text-muted-foreground">{t('contact360.missingId')}</div>;
  }

  return <ContactDetailPage contactId={contactId} />;
}
