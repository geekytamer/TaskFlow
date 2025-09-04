'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, getUserById } from '@/services/userService';
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
      let appUser: User | null | undefined = null;

      if (firebaseUser) {
        // If there's a real Firebase session, get the user from our DB
        appUser = await getUserById(firebaseUser.uid);
        if (!appUser) {
            // Fallback to default user if not found in DB
             appUser = await getCurrentUser();
        }
      } else {
        // Fallback for mock user if Firebase auth is not available
        const mockUserId = localStorage.getItem('taskflow_user_mock_id');
        if (mockUserId) {
            // Fetch the user from the database using the stored mock ID
            appUser = await getUserById(mockUserId);
        }
      }

      if (appUser) {
        setUser(appUser);
        if (allowedRoles && !allowedRoles.includes(appUser.role)) {
          console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
          router.push('/');
        }
        setIsAuthenticated(true);
      } else {
        router.push('/login');
      }

      setLoading(false);
    });

    return () => unsub();
  }, [router, allowedRoles]);

  return { user, loading, isAuthenticated };
}
