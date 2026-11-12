'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { WhatsappCampaignsPage } from '@/modules/whatsapp/components/whatsapp-campaigns-page';

export default function WhatsappCampaignsRoute() {
  const { user, loading } = useAuthGuard('whatsapp.view');
  const { t } = useI18n();
  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  return <WhatsappCampaignsPage />;
}
