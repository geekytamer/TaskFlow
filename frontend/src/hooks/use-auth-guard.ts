
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types';
import { useToast } from './use-toast';
import { useCurrentUser } from './use-current-user';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissionsOptional } from '@/context/permissions-context';

export interface AuthGuardOptions {
  /**
   * "module:action" required to open this page. Once the server reports a
   * permission set it is the only authority, so a custom group grants access
   * even though the holder's legacy role would not. Until then — and while
   * AUTHZ_ENGINE is 'legacy' — allowedRoles still decides.
   */
  permission?: string;
}

export function useAuthGuard(allowedRoles?: UserRole[], options?: AuthGuardOptions) {
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

  const permissions = usePermissionsOptional();
  const requiredPermission = options?.permission;
  const permissionsDecide = Boolean(requiredPermission) && Boolean(permissions?.loaded);
  const permissionAllows = React.useMemo(() => {
    if (!permissionsDecide || !requiredPermission || !permissions) return false;
    const [module, action] = [
      requiredPermission.slice(0, requiredPermission.indexOf(':')),
      requiredPermission.slice(requiredPermission.indexOf(':') + 1),
    ];
    return permissions.can(module, action);
  }, [permissionsDecide, requiredPermission, permissions]);
  // The deny action (warn + toast + redirect) must fire once, not on every
  // re-render before navigation completes.
  const actedRef = React.useRef(false);

  /**
   * The single access decision for this page. Pages render their own denial
   * message, and previously each repeated the role test inline — which meant
   * the guard could allow a custom-group holder in while the page still turned
   * them away. Both now read this.
   */
  const denied = React.useMemo(() => (permissionsDecide
    ? !permissionAllows
    : Boolean(allowedRoles) && (!effectiveRole || !allowedRoles!.includes(effectiveRole))),
  [permissionsDecide, permissionAllows, allowedKey, effectiveRole]);

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
    // A page still waiting on its permission feed must not be judged yet, or a
    // custom-group holder is bounced before the answer arrives.
    if (requiredPermission && permissions && !permissions.loaded && permissions.loading) {
      return;
    }

    if (denied) {
      if (actedRef.current) return;
      actedRef.current = true;
      console.warn(
        permissionsDecide
          ? `User lacks ${requiredPermission} and was refused this page`
          : `User with role ${effectiveRole} tried to access a page restricted to ${allowedKey}`,
      );
      toast({
        variant: 'destructive',
        title: t('common.accessDenied'),
        description: t('auth.guardDenied'),
      });
      router.push('/'); // Redirect to a safe default page
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user, loading, companyLoading, effectiveRole, allowedKey,
    permissionsDecide, permissionAllows, permissions?.loading,
  ]);

  return {
    user,
    loading: loading || companyLoading,
    effectiveRole,
    /** False when this user may not open the page. */
    allowed: !denied,
  };
}
