import { usePermissions } from '@/context/permissions-context';

/** Whether the signed-in user may review Peak Flexi applications and see balances (invoices.flexi_review). */
export function useCanReviewFlexi(): boolean {
  const { can, moduleOn } = usePermissions();
  return moduleOn('flexi') && can('invoices.flexi_review');
}
