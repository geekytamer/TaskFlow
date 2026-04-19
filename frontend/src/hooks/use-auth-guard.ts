
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
  const { selectedCompany } = useCompany();
  const effectiveRole =
    (selectedCompany &&
      user?.companyRoles?.find((c) => c.companyId === selectedCompany.id)?.role) ||
    user?.role;
  
  React.useEffect(() => {
    if (loading) {
      return; // Wait for the user state to be determined
    }

    if (!user) {
      // Not logged in, redirect to login page
      router.push('/login');
      return;
    }

    // User is logged in, check roles
    if (allowedRoles && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
      console.warn(
        `User with role ${effectiveRole} tried to access a page restricted to ${allowedRoles.join(', ')}`,
      );
      toast({
        variant: 'destructive',
        title: t('common.accessDenied'),
        description: t('auth.guardDenied'),
      });
      router.push('/'); // Redirect to a safe default page
    }
  }, [user, loading, allowedRoles, router, toast, t]);


  return { user, loading, effectiveRole };
}
