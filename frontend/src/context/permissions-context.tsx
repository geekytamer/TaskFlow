'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { DATA_CHANGED_EVENT, type DataChangedDetail } from '@/lib/api-client';
import { LIVE_EVENT, type LiveDetail } from '@/lib/live';
import { buildAccess, type Access } from '@/lib/permissions';
import { INITIAL, loadReducer, nextRetryDelay, usableFeed, type LoadStatus } from '@/lib/permissions-loader';
import { fetchMyPermissions } from '@/services/permissionService';
import { AUTHZ_TOPICS, isAuthzChange } from '@/lib/authz-change';

export type { Scope, SensitiveField, FieldAccess } from '@/lib/permissions';

interface PermissionsContextType extends Access {
  /** The answer for the selected company is on its way (gates closed). */
  loading: boolean;
  /** The answer could not be loaded (gates closed); `refresh` tries again. */
  error: boolean;
  status: LoadStatus;
  /** Ask the server again (after a role change, or Retry after an error). */
  refresh: () => void;
}

const PermissionsContext = React.createContext<PermissionsContextType | undefined>(undefined);

const NO_MODULES: string[] = [];

/**
 * Loads GET /me/permissions for the selected company (lib/permissions-loader.ts
 * holds the state machine). Fresh again on a company switch, after a change
 * that can move permissions (role, people, user or company saves, here or
 * announced by the live stream), on a live catch-up, and when the app comes
 * back to the front. A failed first load retries by itself after 2s, 5s and
 * 15s, then waits for Retry. There is no role fallback: until the answer for
 * this company is in, every gate is closed.
 */
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? null;
  const [state, dispatch] = React.useReducer(loadReducer, INITIAL);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    dispatch({ type: 'start', companyId });
    if (!companyId) return () => { active = false; };
    fetchMyPermissions(companyId)
      .then((feed) => { if (active) dispatch({ type: 'success', companyId, feed }); })
      .catch(() => { if (active) dispatch({ type: 'failure', companyId }); });
    return () => { active = false; };
  }, [companyId, nonce]);

  // Automatic retries after a failed load.
  const retryIn = nextRetryDelay(state);
  React.useEffect(() => {
    if (retryIn === null) return;
    const timer = window.setTimeout(() => setNonce((n) => n + 1), retryIn);
    return () => window.clearTimeout(timer);
  }, [retryIn, state.failures]);

  // Ask again after authz-related changes and catch-ups, at most twice a second.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !companyId) return;
    let timer: number | undefined;
    const again = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNonce((n) => n + 1), 500);
    };
    const onChanged = (e: Event) => {
      if (isAuthzChange((e as CustomEvent<DataChangedDetail>).detail)) again();
    };
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveDetail>).detail;
      if (detail?.all || detail?.topics?.some((t) => AUTHZ_TOPICS.has(t))) again();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') again();
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChanged);
    window.addEventListener(LIVE_EVENT, onLive);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChanged);
      window.removeEventListener(LIVE_EVENT, onLive);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [companyId]);

  const fallbackModules = selectedCompany?.disabledModules ?? NO_MODULES;
  const feed = usableFeed(state, companyId);
  // An answer for another company (or none yet) is loading, never "ready".
  const loading = Boolean(companyId) && !feed && state.status !== 'error';
  const value = React.useMemo<PermissionsContextType>(() => ({
    ...buildAccess(feed, fallbackModules),
    loading,
    error: state.status === 'error' && state.companyId === companyId,
    status: state.status,
    refresh: () => setNonce((n) => n + 1),
  }), [feed, fallbackModules, loading, state.status, state.companyId, companyId]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/**
 * Non-throwing variant, for hooks that may run outside the provider (the login
 * screen sits above it). Undefined there; callers treat that as "closed".
 */
export function usePermissionsOptional(): PermissionsContextType | undefined {
  return React.useContext(PermissionsContext);
}

export function usePermissions() {
  const context = React.useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}

/** `usePermissions().can(key)` for one key. */
export function useCan(key: string, opts?: { scope?: 'own' | 'team' | 'company' | 'group' }): boolean {
  return usePermissions().can(key, opts);
}
