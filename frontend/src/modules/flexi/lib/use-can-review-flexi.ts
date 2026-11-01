import { useCompany } from '@/context/company-context';
import { usePermissionOr, usePermissions } from '@/context/permissions-context';

/** Whether the signed-in user may review Peak Flexi applications and see balances (Admin, Manager, Accountant by default). */
export function useCanReviewFlexi(): boolean {
  const { currentRole } = useCompany();
  const { moduleOn } = usePermissions();
  const permitted = usePermissionOr('invoices', 'flexi.review', currentRole === 'Admin' || currentRole === 'Manager' || currentRole === 'Accountant');
  return moduleOn('flexi') && permitted;
}
