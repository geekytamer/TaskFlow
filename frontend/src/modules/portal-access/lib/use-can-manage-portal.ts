import { usePermissions } from '@/context/permissions-context';

/** Whether the signed-in user may invite and manage portal users (portal.manage_access). */
export function useCanManagePortal(): boolean {
  const { can, moduleOn } = usePermissions();
  return moduleOn('influencers') && can('portal.manage_access');
}
