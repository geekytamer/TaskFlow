'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { WhatsappInboxPage } from '@/modules/whatsapp/components/whatsapp-inbox-page';

export default function WhatsappRoute() {
  const { user, loading } = useAuthGuard('whatsapp.view');
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  // The inbox reads ?chat= (a notification opens its chat), which needs a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <WhatsappInboxPage />
    </React.Suspense>
  );
}
