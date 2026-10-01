'use client';

import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { ReferralQueue } from '@/modules/portal-access/components/referral-queue';
import { useCanManagePortal } from '@/modules/portal-access/lib/use-can-manage-portal';

export default function PortalReferralsRoute() {
  const { user, loading } = useAuthGuard();
  const canManage = useCanManagePortal();
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  if (!canManage) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.operationsOnly')}</p>
      </div>
    );
  }
  return <ReferralQueue />;
}
