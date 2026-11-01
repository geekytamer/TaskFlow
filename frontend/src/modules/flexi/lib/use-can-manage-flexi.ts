import { useCompany } from '@/context/company-context';
import { usePermissionOr } from '@/context/permissions-context';

/** Whether the signed-in user may change Peak Flexi accounts and settings (Admin and Accountant by default). */
export function useCanManageFlexi(): boolean {
  const { currentRole } = useCompany();
  return usePermissionOr('invoices', 'flexi.manage', currentRole === 'Admin' || currentRole === 'Accountant');
}
