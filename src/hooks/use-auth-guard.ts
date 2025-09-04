
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/services/userService';
import type { User, UserRole } from '@/lib/types';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // In a real app, onAuthStateChanged is the source of truth.
    // For this dev environment, we'll check local storage first for the mock user.
    const localUserStr = localStorage.getItem('taskflow_user');
    if (localUserStr) {
      getCurrentUser().then(appUser => {
        if (appUser) {
           setUser(appUser);
            if (allowedRoles && !allowedRoles.includes(appUser.role)) {
                console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
            }
        } else {
            // This can happen if the DB is not seeded or the user is not found
            router.push('/login');
        }
        setLoading(false);
      });
    } else {
       // If no mock user, then rely on Firebase Auth
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            const appUser = await getCurrentUser();
            if (appUser) {
              setUser(appUser);
              if (allowedRoles && !allowedRoles.includes(appUser.role)) {
                console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
              }
            } else {
               router.push('/login');
            }
          } else {
            router.push('/login');
          }
          setLoading(false);
        });
        return () => unsubscribe();
    }
  }, [router, allowedRoles]);

  return { user, loading };
}
