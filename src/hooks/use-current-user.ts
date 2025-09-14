
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getUserById } from '@/services/userService';
import type { User } from '@/lib/types';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * Hook to get the current authenticated user's profile from Firestore.
 * This is the single source of truth for the current user's data on the client-side.
 * It handles loading state and ensures the user object is fetched after authentication is confirmed.
 */
export function useCurrentUser() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const appUser = await getUserById(firebaseUser.uid);
          setUser(appUser || null);
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return { user, loading };
}
