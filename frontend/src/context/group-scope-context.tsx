'use client';

/**
 * Which scope the app is in: one company, or a group of them.
 *
 * A group is a second scope beside the selected company. Pages that know how
 * to show a whole group read `companyIds` — the group's companies, narrowed by
 * the company filter; everything else keeps working on the selected company.
 * The chosen group and filter survive a reload, per person and per group.
 */
import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { getHoldingGroup, listHoldingGroups, type HoldingGroup } from '@/services/authzService';

const GROUP_KEY = 'taskflow_group_scope';
const FILTER_KEY = 'taskflow_group_filter_';

interface GroupScopeContextType {
  /** Groups this person administers; empty for everyone else. */
  groups: HoldingGroup[];
  /** The group the app is in, or null for the usual single-company app. */
  group: HoldingGroup | null;
  enterGroup: (group: HoldingGroup) => void;
  leaveGroup: () => void;
  /** The companies a group page should show: the filter, or the whole group. */
  companyIds: string[];
  /** The company filter, empty when the whole group is shown. */
  filter: string[];
  setFilter: (companyIds: string[]) => void;
  /**
   * A company of the group by name. The group's own companies are the source:
   * a group administrator need not belong to every company in it, so the
   * person's own company list would show bare ids for the rest.
   */
  companyName: (companyId: string) => string;
}

const GroupScopeContext = React.createContext<GroupScopeContextType | undefined>(undefined);

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

export function GroupScopeProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useCompany();
  const userId = currentUser?.id ?? null;
  const [groups, setGroups] = React.useState<HoldingGroup[]>([]);
  const [groupId, setGroupId] = React.useState<string | null>(null);
  const [filter, setFilterState] = React.useState<string[]>([]);
  const [names, setNames] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!userId) {
      setGroups([]);
      setGroupId(null);
      return;
    }
    let active = true;
    listHoldingGroups()
      .then((list) => {
        if (!active) return;
        setGroups(list);
        // A remembered group the person no longer administers is forgotten.
        const remembered = read(GROUP_KEY);
        const found = list.find((g) => g.id === remembered) ?? null;
        setGroupId(found?.id ?? null);
        if (!found) write(GROUP_KEY, null);
        if (found) {
          const saved = read(FILTER_KEY + found.id);
          setFilterState(saved ? saved.split(',').filter((id) => found.companyIds.includes(id)) : []);
        }
      })
      .catch(() => {
        if (active) setGroups([]);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const group = groups.find((g) => g.id === groupId) ?? null;

  // The group names its own companies, whoever is looking.
  React.useEffect(() => {
    if (!groupId) return;
    let active = true;
    getHoldingGroup(groupId)
      .then((detail) => {
        if (!active) return;
        setNames(Object.fromEntries(detail.companies.map((c) => [c.id, c.name ?? c.id])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [groupId]);

  const value = React.useMemo<GroupScopeContextType>(() => {
    const setFilter = (companyIds: string[]) => {
      setFilterState(companyIds);
      if (group) write(FILTER_KEY + group.id, companyIds.length ? companyIds.join(',') : null);
    };
    return {
      groups,
      group,
      enterGroup: (next) => {
        setGroupId(next.id);
        write(GROUP_KEY, next.id);
        const saved = read(FILTER_KEY + next.id);
        setFilterState(saved ? saved.split(',').filter((id) => next.companyIds.includes(id)) : []);
      },
      leaveGroup: () => {
        setGroupId(null);
        write(GROUP_KEY, null);
        setFilterState([]);
      },
      companyIds: group ? (filter.length ? filter : group.companyIds) : [],
      filter,
      setFilter,
      companyName: (companyId: string) => names[companyId] ?? companyId,
    };
  }, [groups, group, filter, names]);

  return <GroupScopeContext.Provider value={value}>{children}</GroupScopeContext.Provider>;
}

export function useGroupScope(): GroupScopeContextType {
  const context = React.useContext(GroupScopeContext);
  if (!context) {
    // Above the provider (the login screen): no group, no scope.
    return {
      groups: [], group: null, enterGroup: () => {}, leaveGroup: () => {},
      companyIds: [], filter: [], setFilter: () => {}, companyName: (id: string) => id,
    };
  }
  return context;
}
