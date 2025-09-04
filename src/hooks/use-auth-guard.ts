
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
        // Use the firebase UID to get our application-specific user data.
        const appUser = await getUserById(firebaseUser.uid);
        
        if (appUser) {
          // The user exists in our database.
          setUser(appUser);
          setIsAuthenticated(true);
          
          // Check if the user's role (from the database) is allowed to access the page.
          if (allowedRoles && !allowedRoles.includes(appUser.role)) {
            console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
            // Redirect to home page if not allowed.
            router.push('/'); 
          }

        } else {
          // This case handles when a user is authenticated with Firebase,
          // but doesn't have a corresponding user record in Firestore.
          console.warn(`User with UID ${firebaseUser.uid} authenticated with Firebase but not found in Firestore.`);
          setUser(null);
          setIsAuthenticated(false);
          router.push('/login');
        }
      } else {
        // No user is signed in with Firebase.
        setUser(null);
        setIsAuthenticated(false);
        router.push('/login');
      }
      // We are done with all checks, so we can stop the loading state.
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsub();
  }, [allowedRoles, router]);


  return { user, loading, isAuthenticated };
}
