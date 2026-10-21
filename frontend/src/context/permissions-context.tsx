'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import { LIVE_EVENT, type LiveDetail } from '@/lib/live';
import { buildAccess, type Access, type MyPermissions } from '@/lib/permissions';
import { fetchMyPermissions } from '@/services/permissionService';

export type { Scope, SensitiveField, FieldAccess } from '@/lib/permissions';

interface PermissionsContextType extends Access {
  /** True while the first answer for the selected company is on its way. */
  loading: boolean;
  /** Ask the server again (after a role change). */
  refresh: () => void;
}

const PermissionsContext = React.createContext<PermissionsContextType | undefined>(undefined);

const NO_MODULES: string[] = [];

/**
 * Loads GET /me/permissions for the selected company and keeps it fresh: again
 * on a company switch, after any change this app makes (a role edit included),
 * when the live stream asks for a catch-up and when the app comes back to the
 * front. There is no role fallback: until the answer for this company is in,
 * every gate is closed.
 */
export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [feed, setFeed] = React.useState<MyPermissions | null>(null);
  const [loading, setLoading] = React.useState(Boolean(companyId));
  const [nonce, setNonce] = React.useState(0);
  const feedRef = React.useRef<MyPermissions | null>(null);
  feedRef.current = feed;

  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setFeed(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    // Another company's answer must not stand in for this one's: close the
    // gates until it arrives. A refresh of the same company keeps the answer
    // it has meanwhile, so the screen does not flicker.
    if (feedRef.current?.companyId !== companyId) {
      setFeed(null);
      setLoading(true);
    }
    fetchMyPermissions(companyId)
      .then((next) => {
        if (!active) return;
        const held = feedRef.current;
        // Same company, same authz version, same grants: keep the object so nothing re-renders.
        if (held && held.companyId === next.companyId && held.version === next.version
          && JSON.stringify(held) === JSON.stringify(next)) return;
        setFeed(next);
      })
      .catch(() => {
        // A failed answer is never read as "allowed".
        if (active && feedRef.current?.companyId !== companyId) setFeed(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId, nonce]);

  // Ask again after changes and catch-ups, at most twice a second.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !companyId) return;
    let timer: number | undefined;
    const again = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNonce((n) => n + 1), 500);
    };
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveDetail>).detail;
      if (detail?.all || detail?.topics?.some((t) => t === 'authz' || t === 'users' || t === 'roles')) again();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') again();
    };
    window.addEventListener(DATA_CHANGED_EVENT, again);
    window.addEventListener(LIVE_EVENT, onLive);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, again);
      window.removeEventListener(LIVE_EVENT, onLive);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [companyId]);

  const fallbackModules = selectedCompany?.disabledModules ?? NO_MODULES;
  const value = React.useMemo<PermissionsContextType>(() => ({
    ...buildAccess(feed && feed.companyId === companyId ? feed : null, fallbackModules),
    loading,
    refresh: () => setNonce((n) => n + 1),
  }), [feed, companyId, fallbackModules, loading]);

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
