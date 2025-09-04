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
    const checkAuth = async () => {
      // This function now runs only on the client side
      const localUserStr = localStorage.getItem('taskflow_user');
      if (localUserStr) {
        const appUser = await getCurrentUser();
        if (appUser) {
          setUser(appUser);
          if (allowedRoles && !allowedRoles.includes(appUser.role)) {
            console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
          }
          setIsAuthenticated(true);
        } else {
          router.push('/login');
        }
      } else {
        // Fallback to firebase auth if no mock user
         const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            const appUser = await getCurrentUser();
            if (appUser) {
              setUser(appUser);
               if (allowedRoles && !allowedRoles.includes(appUser.role)) {
                 console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
              }
              setIsAuthenticated(true);
            } else {
               router.push('/login');
            }
          } else {
            router.push('/login');
          }
        });
        return () => unsub();
      }
      setLoading(false);
    };
    
    checkAuth();

  }, [router, allowedRoles]);

  return { user, loading, isAuthenticated };
}
