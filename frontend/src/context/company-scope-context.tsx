'use client';

/**
 * How much of the selected company a page shows.
 *
 * A group is a company with companies under it. Opened, it shows the whole
 * group by default (`tree`): group-aware pages read `companyIds`, the tree
 * narrowed by the company filter. `self` shows the group company's own
 * records, as every page does for a company without children. Scope and
 * filter are remembered per company.
 */
import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { isGroupCompany, requestCompanyIds, scopeCompanyIds, subtree, type CompanyScope } from '@/lib/company-tree';

const SCOPE_KEY = 'taskflow_scope_';
const FILTER_KEY = 'taskflow_scope_filter_';

interface CompanyScopeContextType {
  /** The selected company has companies under it. */
  isGroup: boolean;
  /** A group, shown whole: what group-aware pages check. */
  inTree: boolean;
  scope: CompanyScope;
  setScope: (scope: CompanyScope) => void;
  /** The companies a page should show. */
  companyIds: string[];
  /** What to send the server for a group request: empty = the whole tree. */
  requestIds: string[];
  /** The selected company and everything under it that this person can see. */
  treeCompanyIds: string[];
  /** The company filter; empty = the whole tree. */
  filter: string[];
  setFilter: (companyIds: string[]) => void;
  companyName: (companyId: string) => string;
}

const CompanyScopeContext = React.createContext<CompanyScopeContextType | undefined>(undefined);

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* a browser that refuses storage still works, it just forgets */
  }
};

/** A company's remembered scope and filter. */
const stored = (id: string): { scope: CompanyScope; filter: string[] } => {
  const saved = read(FILTER_KEY + id);
  return { scope: read(SCOPE_KEY + id) === 'self' ? 'self' : 'tree', filter: saved ? saved.split(',').filter(Boolean) : [] };
};

export function CompanyScopeProvider({ children }: { children: React.ReactNode }) {
  const { companies, selectedCompany } = useCompany();
  const selectedId = selectedCompany?.id ?? null;
  // Each company's choice, read from storage the first time it is needed: a
  // switch never renders once with the previous company's scope or filter.
  const [chosen, setChosen] = React.useState<Record<string, { scope: CompanyScope; filter: string[] }>>({});
  const current = selectedId ? chosen[selectedId] ?? stored(selectedId) : { scope: 'tree' as CompanyScope, filter: [] as string[] };
  const { scope, filter } = current;
  const choose = React.useCallback((id: string, patch: Partial<{ scope: CompanyScope; filter: string[] }>) => {
    setChosen((prev) => ({ ...prev, [id]: { ...(prev[id] ?? stored(id)), ...patch } }));
  }, []);

  const value = React.useMemo<CompanyScopeContextType>(() => {
    const isGroup = Boolean(selectedId) && isGroupCompany(companies, selectedId!);
    const treeCompanyIds = selectedId ? subtree(companies, selectedId) : [];
    const names = new Map(companies.map((c) => [c.id, c.name]));
    // A remembered company that left the tree, or that I lost, is forgotten.
    const liveFilter = filter.filter((id) => treeCompanyIds.includes(id));
    return {
      isGroup,
      inTree: isGroup && scope === 'tree',
      scope,
      setScope: (next) => {
        if (selectedId) choose(selectedId, { scope: next });
        if (selectedId) write(SCOPE_KEY + selectedId, next === 'self' ? 'self' : null);
      },
      companyIds: selectedId ? scopeCompanyIds(companies, selectedId, scope, liveFilter) : [],
      requestIds: selectedId ? requestCompanyIds(companies, selectedId, scope, liveFilter) : [],
      treeCompanyIds,
      filter: liveFilter,
      setFilter: (ids) => {
        if (selectedId) choose(selectedId, { filter: ids });
        if (selectedId) write(FILTER_KEY + selectedId, ids.length ? ids.join(',') : null);
      },
      companyName: (id) => names.get(id) ?? id,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, selectedId, scope, filter.join(','), choose]);

  return <CompanyScopeContext.Provider value={value}>{children}</CompanyScopeContext.Provider>;
}

export function useCompanyScope(): CompanyScopeContextType {
  const context = React.useContext(CompanyScopeContext);
  if (!context) {
    // Above the provider (the login screen): one company, no scope.
    return {
      isGroup: false, inTree: false, scope: 'self', setScope: () => {},
      companyIds: [], requestIds: [], treeCompanyIds: [], filter: [], setFilter: () => {}, companyName: (id) => id,
    };
  }
  return context;
}
