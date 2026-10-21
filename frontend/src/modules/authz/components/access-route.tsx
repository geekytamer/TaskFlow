'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { ListSkeleton } from './shared';

/**
 * The page guard of the access screens: People and Roles need
 * people.view_roles (the server's gate for reading them); the Group screens
 * pass no permission and decide on the group (GET /holding-groups).
 */
export function AccessRoute({ permission, children }: { permission?: string; children: React.ReactNode }) {
  const { user, loading, allowed } = useAuthGuard(permission);
  const { t } = useI18n();
  if (loading || !user) return <div className="mx-auto w-full max-w-5xl"><ListSkeleton rows={4} /></div>;
  if (permission && !allowed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('auth.adminOnly')}</p>
      </div>
    );
  }
  return <>{children}</>;
}
