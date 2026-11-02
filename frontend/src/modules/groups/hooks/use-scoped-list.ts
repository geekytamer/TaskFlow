'use client';

/**
 * A list for the page's scope: the selected company alone, or every company
 * of the group shown whole, through the same per-company request.
 */
import * as React from 'react';
import { useCompanyScope } from '@/context/company-scope-context';
import { fanOut, latest, type MissingCompany } from '@/lib/fan-out';

export function useScopedList<T extends object>(
  load: (companyId: string) => Promise<T[]>,
  deps: React.DependencyList = [],
) {
  const { companyIds } = useCompanyScope();
  const [rows, setRows] = React.useState<Array<T & { companyId: string }>>([]);
  const [missing, setMissing] = React.useState<MissingCompany[]>([]);
  const [loading, setLoading] = React.useState(true);
  const ticket = React.useRef(latest());
  const key = companyIds.join(',');

  const reload = React.useCallback(async () => {
    const mine = ticket.current.next();
    if (!key) {
      setRows([]);
      setMissing([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const answer = await fanOut(key.split(','), load);
    if (!ticket.current.isCurrent(mine)) return;
    setRows(answer.rows);
    setMissing(answer.missing);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, setRows, missing, loading, reload };
}
