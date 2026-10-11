'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { TUTORIAL_ENABLED } from '@/lib/features';
import { GuidePage } from '@/modules/guide/components/guide-page';

export default function GuideRoute() {
  // Every role gets the guide — it explains whatever that role can reach.
  const { user, loading } = useAuthGuard();
  const { t } = useI18n();
  const router = useRouter();

  // With the tutorial switched off, an old link or bookmark lands on the dashboard.
  React.useEffect(() => {
    if (!TUTORIAL_ENABLED) router.replace('/');
  }, [router]);

  if (!TUTORIAL_ENABLED || loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return <GuidePage />;
}
