import { useCompany } from '@/context/company-context';
import { usePermissionOr, usePermissions } from '@/context/permissions-context';

/**
 * Whether the signed-in user may invite and manage portal users. The role rule
 * it replaced (Admin and Manager) is the fallback under the legacy engine.
 */
export function useCanManagePortal(): boolean {
  const { currentRole } = useCompany();
  const { moduleOn } = usePermissions();
  const permitted = usePermissionOr('contacts', 'portal.manage', currentRole === 'Admin' || currentRole === 'Manager');
  return moduleOn('influencers') && permitted;
}
