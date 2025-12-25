
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types';
import { useToast } from './use-toast';
import { useCurrentUser } from './use-current-user';
import { useCompany } from '@/context/company-context';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading } = useCurrentUser();
  const { selectedCompany } = useCompany();
  
  React.useEffect(() => {
    if (loading) {
      return; // Wait for the user state to be determined
    }

    if (!user) {
      // Not logged in, redirect to login page
      router.push('/login');
      return;
    }

    const effectiveRole =
      (selectedCompany &&
        user.companyRoles?.find((c) => c.companyId === selectedCompany.id)?.role) ||
      user.role;

    // User is logged in, check roles
    if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
      console.warn(
        `User with role ${effectiveRole} tried to access a page restricted to ${allowedRoles.join(', ')}`,
      );
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: "You don't have permission to view this page.",
      });
      router.push('/'); // Redirect to a safe default page
    }
  }, [user, loading, allowedRoles, router, toast]);


  return { user, loading };
}
