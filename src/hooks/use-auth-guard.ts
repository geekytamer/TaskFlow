
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getUserById } from '@/services/userService';
import type { User, UserRole } from '@/lib/types';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const appUser = await getUserById(firebaseUser.uid);
        if (appUser) {
          // Special override for demo purposes
          if (appUser.email === 'admin@taskflow.com') {
            appUser.role = 'Admin';
          }
          
          setUser(appUser);
          setIsAuthenticated(true);
          
          if (allowedRoles && !allowedRoles.includes(appUser.role)) {
            console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
            router.push('/'); 
          }

        } else {
          // Firebase user exists but not in our DB
          setUser(null);
          setIsAuthenticated(false);
          router.push('/login');
        }
      } else {
        // No Firebase user
        setUser(null);
        setIsAuthenticated(false);
        router.push('/login');
      }
       // We are done checking, so we can stop loading.
      setLoading(false);
    });

    return () => unsub();
  }, [allowedRoles, router]);


  return { user, loading, isAuthenticated };
}
