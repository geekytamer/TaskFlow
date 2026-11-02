'use client';

/**
 * A page of one record, opened while a group is shown whole: the record lives
 * in one company of the group, so the page renders inside that company (its
 * data, permissions and currency). `resolve` names the record's company, or
 * null when it can't be found in any.
 */
import * as React from 'react';
import { useCompanyScope } from '@/context/company-scope-context';
import { InCompany } from './in-company';

export function InRecordCompany({ resolve, children }: {
  resolve: (companyIds: string[]) => Promise<string | null>;
  children: React.ReactNode;
}) {
  const { isGroup, treeCompanyIds } = useCompanyScope();
  const [companyId, setCompanyId] = React.useState<string | null | undefined>(undefined);
  const key = treeCompanyIds.join(',');
  React.useEffect(() => {
    if (!isGroup) return;
    let active = true;
    setCompanyId(undefined);
    resolve(key.split(',')).then((id) => { if (active) setCompanyId(id); }).catch(() => { if (active) setCompanyId(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroup, key]);
  if (!isGroup || companyId === null) return <>{children}</>;
  if (companyId === undefined) return null;
  return <InCompany companyId={companyId}>{children}</InCompany>;
}

/** The first company (in tree order) where `probe` succeeds. */
export async function firstCompanyWith(companyIds: string[], probe: (companyId: string) => Promise<unknown>): Promise<string | null> {
  for (const id of companyIds) {
    try {
      await probe(id);
      return id;
    } catch {
      /* not in this company */
    }
  }
  return null;
}
