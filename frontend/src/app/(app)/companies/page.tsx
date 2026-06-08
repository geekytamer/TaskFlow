'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';

export default function CompaniesRoute() {
  const router = useRouter();
  const { user, loading } = useAuthGuard();
  const { t } = useI18n();

  React.useEffect(() => {
    if (loading || !user) return;
    router.replace(user.isSuperAdmin ? '/admin' : '/');
  }, [loading, router, user]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );
}
