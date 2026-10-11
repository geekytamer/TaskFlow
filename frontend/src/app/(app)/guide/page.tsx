'use client';

import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { GuidePage } from '@/modules/guide/components/guide-page';

export default function GuideRoute() {
  // Every role gets the guide — it explains whatever that role can reach.
  const { user, loading } = useAuthGuard();
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <GuidePage />;
}
