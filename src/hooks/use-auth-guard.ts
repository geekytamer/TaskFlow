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
             router.push('/');
          }
          setIsAuthenticated(true);
        } else {
          console.error("Authenticated user not found in Firestore. Logging out.");
          router.push('/login');
        }
      } else {
        // Fallback for mock user if Firebase auth is not available
        const mockUser = localStorage.getItem('taskflow_user_mock');
        if (mockUser) {
            const parsedUser = JSON.parse(mockUser);
             // For the demo, we can assume the mock user is the admin
            const fullUser: User = {
              id: 'mock-user-id',
              name: 'Mock Admin',
              email: parsedUser.email,
              role: 'Admin',
              companyId: '1',
              avatar: `https://i.pravatar.cc/150?u=${parsedUser.email}`
            };
            setUser(fullUser);
            setIsAuthenticated(true);
        } else {
            router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [router, allowedRoles]);

  return { user, loading, isAuthenticated };
}
