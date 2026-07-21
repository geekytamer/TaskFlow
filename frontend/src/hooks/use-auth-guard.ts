
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types';
import { useToast } from './use-toast';
import { useCurrentUser } from './use-current-user';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { user, loading } = useCurrentUser();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const effectiveRole =
    (selectedCompany &&
      user?.companyRoles?.find((c) => c.companyId === selectedCompany.id)?.role) ||
    user?.role;

  // allowedRoles is typically passed as a new array literal each render, so
  // depend on a stable key instead — otherwise the effect (which toasts, and a
  // toast triggers a re-render) would re-run every render in an infinite loop.
  const allowedKey = allowedRoles ? [...allowedRoles].sort().join(',') : '';
  // The deny action (warn + toast + redirect) must fire once, not on every
  // re-render before navigation completes.
  const actedRef = React.useRef(false);

  React.useEffect(() => {
    if (loading || companyLoading) {
      return; // Wait for the user state to be determined
    }
    if (!user) {
      if (actedRef.current) return;
      actedRef.current = true;
      router.push('/login');
      return;
    }
    if (allowedRoles && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
      if (actedRef.current) return;
      actedRef.current = true;
      console.warn(
        `User with role ${effectiveRole} tried to access a page restricted to ${allowedKey}`,
      );
      toast({
        variant: 'destructive',
        title: t('common.accessDenied'),
        description: t('auth.guardDenied'),
      });
      router.push('/'); // Redirect to a safe default page
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, companyLoading, effectiveRole, allowedKey]);

  return { user, loading: loading || companyLoading, effectiveRole };
}
