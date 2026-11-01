'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useCanReviewFlexi } from '@/modules/flexi/lib/use-can-review-flexi';

/** Every Peak Flexi page: signed in, and allowed to review Peak Flexi. */
export function FlexiRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthGuard();
  const canReview = useCanReviewFlexi();
  const { t } = useI18n();
  if (loading || !user) {
    return <div className="flex h-full w-full items-center justify-center"><p className="text-muted-foreground">{t('common.loading')}</p></div>;
  }
  if (!canReview) {
    return <div className="flex h-full w-full items-center justify-center"><p className="text-muted-foreground">{t('auth.operationsOnly')}</p></div>;
  }
  return <React.Suspense fallback={null}>{children}</React.Suspense>;
}
