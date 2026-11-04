'use client';

/** Whether this company's documents of this type go for approval (its own policy, its group's, or a group sign-off). */
import * as React from 'react';
import { getApprovalPolicies, type ApprovalDocType } from '@/services/approvalService';

export function useApprovalNeeded(companyId: string | undefined, docType: ApprovalDocType): boolean {
  const [needed, setNeeded] = React.useState(false);
  React.useEffect(() => {
    if (!companyId) return;
    let live = true;
    getApprovalPolicies(companyId)
      .then((all) => { const p = all[docType]; if (live) setNeeded(Boolean(p && (p.steps.length || p.groupSignOff?.length))); })
      .catch(() => { if (live) setNeeded(false); });
    return () => { live = false; };
  }, [companyId, docType]);
  return needed;
}
