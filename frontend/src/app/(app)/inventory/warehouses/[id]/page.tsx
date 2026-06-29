'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { WarehouseDetailPage } from '@/modules/inventory/components/warehouse-detail-page';

export default function WarehouseDetailRoute() {
  const { user, loading, effectiveRole } = useAuthGuard(['Admin', 'Manager', 'Accountant']);
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const warehouseId = params?.id;

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!effectiveRole || !['Admin', 'Manager', 'Accountant'].includes(effectiveRole)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.operationsOnly')}</p>
      </div>
    );
  }

  if (!warehouseId) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  return <WarehouseDetailPage warehouseId={warehouseId} />;
}
