
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getUserById } from '@/services/userService';
import type { User, UserRole } from '@/lib/types';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      let appUser: User | null = null;

      if (firebaseUser) {
        // If there's a real Firebase session, get the user from our DB
        const fetchedUser = await getUserById(firebaseUser.uid);
        if (fetchedUser) {
          appUser = fetchedUser;
           // This is a special override for the demo to ensure admin@taskflow.com is always an admin
          if (appUser.email === 'admin@taskflow.com') {
            appUser.role = 'Admin';
          }
        }
      }

      if (appUser) {
        setUser(appUser);
        setIsAuthenticated(true);
        if (allowedRoles && !allowedRoles.includes(appUser.role)) {
          console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
          router.push('/');
        }
      } else {
        setIsAuthenticated(false);
        router.push('/login');
      }

      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsub();
  }, [router, allowedRoles]);

  return { user, loading, isAuthenticated };
}
