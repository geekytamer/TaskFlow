'use client';

import * as React from 'react';
import type { User } from '@/lib/types';
import { fetchCurrentUser } from '@/services/authService';
import { getStoredToken, TOKEN_KEY } from '@/lib/api-client';

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
      const current = await fetchCurrentUser();
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
