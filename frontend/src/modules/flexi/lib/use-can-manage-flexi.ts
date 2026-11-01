import { usePermissions } from '@/context/permissions-context';

/** Whether the signed-in user may change Peak Flexi accounts and settings (invoices.flexi_manage). */
export function useCanManageFlexi(): boolean {
  const { can, moduleOn } = usePermissions();
  return moduleOn('flexi') && can('invoices.flexi_manage');
}
