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
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const appUser = await getCurrentUser();
        if (appUser) {
          setUser(appUser);
          if (allowedRoles && !allowedRoles.includes(appUser.role)) {
            console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
             // You might want to redirect them to a specific page, like the dashboard
             router.push('/');
          }
          setIsAuthenticated(true);
        } else {
          // This case means the user is authenticated in Firebase, but has no record in our Firestore DB
          console.error("Authenticated user not found in Firestore. Logging out.");
          router.push('/login');
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsub();
  }, [router, allowedRoles]);

  return { user, loading, isAuthenticated };
}
