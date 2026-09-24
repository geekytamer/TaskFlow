import { useCompany } from '@/context/company-context';
import { usePermissionOr } from '@/context/permissions-context';

/**
 * Whether the signed-in user may invite and manage portal users. The role rule
 * it replaced (Admin and Manager) is the fallback under the legacy engine.
 */
export function useCanManagePortal(): boolean {
  const { currentRole } = useCompany();
  return usePermissionOr('contacts', 'portal.manage', currentRole === 'Admin' || currentRole === 'Manager');
}
