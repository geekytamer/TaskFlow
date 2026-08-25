'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { fetchMyPermissions } from '@/services/permissionService';

interface PermissionsContextType {
  /** "module:action" keys the current user holds in the selected company. */
  permissions: Set<string>;
  loading: boolean;
  /** True once the server has answered — before that, gates stay closed. */
  loaded: boolean;
  can: (module: string, action: string) => boolean;
  canAny: (module: string, ...actions: string[]) => boolean;
  refresh: () => void;
}

const PermissionsContext = React.createContext<PermissionsContextType | undefined>(undefined);

const EMPTY: Set<string> = new Set();

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { selectedCompany } = useCompany();
  const [permissions, setPermissions] = React.useState<Set<string>>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  const companyId = selectedCompany?.id;

  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setPermissions(EMPTY);
      setLoading(false);
      setLoaded(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    fetchMyPermissions(companyId)
      .then((feed) => {
        if (!active) return;
        setPermissions(new Set(feed.permissions));
        setLoaded(true);
      })
      .catch(() => {
        // The server remains authoritative; a failed fetch must not be read as
        // "allowed". Leaving the set empty hides UI rather than exposing it.
        if (!active) return;
        setPermissions(EMPTY);
        setLoaded(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyId, nonce]);

  const value = React.useMemo<PermissionsContextType>(() => ({
    permissions,
    loading,
    loaded,
    can: (module, action) => permissions.has(`${module}:${action}`),
    canAny: (module, ...actions) => actions.some((a) => permissions.has(`${module}:${a}`)),
    refresh: () => setNonce((n) => n + 1),
  }), [permissions, loading, loaded]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const context = React.useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}

export function usePermission(module: string, action: string): boolean {
  return usePermissions().can(module, action);
}
