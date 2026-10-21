'use client';

import * as React from 'react';
import type { User } from '@/lib/types';
import { fetchCurrentUser } from '@/services/authService';
import { getStoredToken, TOKEN_KEY } from '@/lib/api-client';

// Every screen piece that needs the user used to ask the server on its own,
// several times per page. They now share one request; a finished answer is
// reused for a few seconds, so a later mount still gets fresh data.
const SHARE_MS = 10_000;
let shared: { token: string; promise: Promise<User | null>; settledAt?: number } | null = null;

function loadSharedUser(token: string): Promise<User | null> {
  const fresh = shared && shared.token === token && (shared.settledAt === undefined || Date.now() - shared.settledAt < SHARE_MS);
  if (!fresh) {
    const entry: NonNullable<typeof shared> = {
      token,
      promise: fetchCurrentUser().finally(() => {
        entry.settledAt = Date.now();
      }),
    };
    shared = entry;
  }
  return shared!.promise;
}

export function useCurrentUser() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    const loadUser = async () => {
      setLoading(true);
      const token = getStoredToken();
      if (!token) {
        if (!active) return;
        setUser(null);
        setLoading(false);
        return;
      }
      const current = await loadSharedUser(token);
      if (!active) return;
      setUser(current);
      setLoading(false);
    };

    loadUser();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY && event.newValue === null) {
        setUser(null);
      }
    };

    const handleTokenChange = () => {
      shared = null;
      loadUser();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('taskflow-token-changed', handleTokenChange);
    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('taskflow-token-changed', handleTokenChange);
    };
  }, []);

  return { user, loading };
}
