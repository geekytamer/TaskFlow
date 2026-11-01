import { useCompany } from '@/context/company-context';
import { usePermissionOr } from '@/context/permissions-context';

/** Whether the signed-in user may review Peak Flexi applications and see balances (Admin, Manager, Accountant by default). */
export function useCanReviewFlexi(): boolean {
  const { currentRole } = useCompany();
  return usePermissionOr('invoices', 'flexi.review', currentRole === 'Admin' || currentRole === 'Manager' || currentRole === 'Accountant');
}
