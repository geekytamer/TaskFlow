'use client';

import { useCompanyScope } from '@/context/company-scope-context';

/** Whether a list shows which company each row is in: a group, shown whole, over more than one company. */
export function useShowCompanyColumn(): boolean {
  const { inTree, companyIds } = useCompanyScope();
  return inTree && companyIds.length > 1;
}

/** A row's company, as a small label under or beside the row's name. */
export function CompanyLabel({ companyId, className }: { companyId: string; className?: string }) {
  const { companyName } = useCompanyScope();
  const show = useShowCompanyColumn();
  if (!show) return null;
  return <span className={className ?? 'block text-xs font-normal text-muted-foreground'}>{companyName(companyId)}</span>;
}
