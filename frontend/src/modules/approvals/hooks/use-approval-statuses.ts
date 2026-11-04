'use client';

/** Where each document of one type stands, for the chips on its list (one call per company in scope). */
import * as React from 'react';
import { useCompanyScope } from '@/context/company-scope-context';
import { fanOut } from '@/lib/fan-out';
import { getApprovalStatuses, type ApprovalDocType, type ApprovalStatusRow } from '@/services/approvalService';

/** `list`: the page's documents; when it reloads, the chips do too. */
export function useApprovalStatuses(docType: ApprovalDocType, list?: unknown) {
  const { companyIds } = useCompanyScope();
  const scopeKey = companyIds.join(',');
  const [rows, setRows] = React.useState<Map<string, ApprovalStatusRow>>(new Map());
  const ticket = React.useRef(0);
  const reload = React.useCallback(async () => {
    if (!scopeKey) return;
    const mine = ++ticket.current;
    const answer = await fanOut(scopeKey.split(','), (id) => getApprovalStatuses(id, docType));
    if (mine !== ticket.current) return;
    setRows(new Map(answer.rows.map((r) => [r.docId, r])));
  }, [scopeKey, docType]);
  React.useEffect(() => { void reload(); }, [reload, list]);
  return { statusOf: (docId: string) => rows.get(docId), reload };
}
