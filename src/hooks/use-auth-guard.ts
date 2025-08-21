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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in, now get our app-specific user data
        const appUser = await getCurrentUser();
        if (appUser) {
          setUser(appUser);
          if (allowedRoles && !allowedRoles.includes(appUser.role)) {
            // This is a "soft" redirect, the page should handle the denial message.
            // This prevents layout flashes.
            console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
          }
        } else {
           // This might happen if Firestore user record doesn't exist for a valid Firebase Auth user
           router.push('/login');
        }
      } else {
        // User is signed out
        localStorage.removeItem('taskflow_user');
        router.push('/login');
      }
      setLoading(false);
    });

    // Check local storage as a fallback/initial state
    const localUser = localStorage.getItem('taskflow_user');
    if (localUser) {
        // this is a mock of auth state, in real app we rely on onAuthStateChanged
    } else if (process.env.NODE_ENV === 'development') { // In dev, mock the auth state faster
       getCurrentUser().then(appUser => {
           if (appUser) setUser(appUser);
           setLoading(false);
       });
    }

    return () => unsubscribe();
  }, [router, allowedRoles]);

  return { user, loading };
}
