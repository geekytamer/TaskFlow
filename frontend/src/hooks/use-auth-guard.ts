'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './use-toast';
import { useCurrentUser } from './use-current-user';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissionsOptional } from '@/context/permissions-context';
import { guardDecision } from '@/lib/guard-decision';

/**
 * Signs the person in, and with `permission` (a catalogue key such as
 * 'sales.view') turns them away from a page they may not open. The server's
 * permissions are the only authority: until they have arrived for the selected
 * company the page reports `loading`, never "allowed".
 *
 * `effectiveRole` is the person's role name in the selected company, for
 * display only; no access decision may read it.
 */
export function useAuthGuard(permission?: string) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { user, loading } = useCurrentUser();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const effectiveRole =
    (selectedCompany &&
      user?.companyRoles?.find((c) => c.companyId === selectedCompany.id)?.role) ||
    user?.role;

  const permissions = usePermissionsOptional();
  const decision = guardDecision({
    permission,
    userLoading: loading,
    companyLoading,
    hasCompany: Boolean(selectedCompany),
    permissions,
  });
  const { denied } = decision;

  // The deny action (warn + toast + redirect) must fire once, not on every
  // re-render before navigation completes.
  const actedRef = React.useRef(false);

  React.useEffect(() => {
    if (loading || companyLoading) return;
    if (!user) {
      if (actedRef.current) return;
      actedRef.current = true;
      router.push('/login');
      return;
    }
    if (!denied || actedRef.current) return;
    actedRef.current = true;
    console.warn(`User lacks ${permission} and was refused this page`);
    toast({
      variant: 'destructive',
      title: t('common.accessDenied'),
      description: t('auth.guardDenied'),
    });
    router.push('/'); // Redirect to a safe default page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, companyLoading, denied, permission]);

  return {
    user,
    loading: decision.loading,
    effectiveRole,
    /** False when this user may not open the page (or the answer is not in yet). */
    allowed: decision.allowed,
    /** The permissions could not be loaded: PermissionsErrorNotice offers Retry; not a denial. */
    permissionsError: decision.error,
    retryPermissions: permissions?.refresh,
  };
}
