
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getUserById } from '@/services/userService';
import type { User, UserRole } from '@/lib/types';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from './use-toast';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // User is authenticated with Firebase. Now, check if they exist in our application's database.
        const appUser = await getUserById(firebaseUser.uid);

        if (appUser) {
          // User exists in Firestore, proceed with role checks.
          setUser(appUser);
          setIsAuthenticated(true);
          
          if (allowedRoles && !allowedRoles.includes(appUser.role)) {
            console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
            router.push('/'); // Redirect to a safe default page.
          }
        } else {
          // User is authenticated with Firebase but has no profile in Firestore.
          // This is a valid state; they should not be allowed into the app until an admin creates their profile.
          console.warn(`User with UID ${firebaseUser.uid} authenticated with Firebase but not found in Firestore.`);
          await auth.signOut(); // Sign them out of Firebase as well.
          setUser(null);
          setIsAuthenticated(false);
          // Use a query parameter to show a specific message on the login page.
          router.push('/login?error=no-firestore-user');
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
  // The dependency array is intentionally sparse to mimic `onMount`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return { user, loading, isAuthenticated };
}
