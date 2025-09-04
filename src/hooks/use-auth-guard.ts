
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getUserById, createUserWithId } from '@/services/userService';
import type { User, UserRole } from '@/lib/types';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { placeholderUsers } from '@/lib/placeholder-data';

export function useAuthGuard(allowedRoles?: UserRole[]) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // Use the firebase UID to get our application-specific user data.
        let appUser = await getUserById(firebaseUser.uid);

        if (!appUser) {
          // If the user exists in Firebase Auth but not Firestore, create them.
          // This is common for the first login after seeding auth but not the db.
          console.warn(`User not found in Firestore, creating new user for UID: ${firebaseUser.uid}`);
          
          // For this demo, we'll create the user based on the first placeholder user's data
          // but with the actual Firebase Auth email and UID.
          const defaultUserData = placeholderUsers.find(u => u.email === firebaseUser.email) || placeholderUsers[0];

          const newUser: User = {
            id: firebaseUser.uid,
            name: defaultUserData.name,
            email: firebaseUser.email || defaultUserData.email,
            role: defaultUserData.role,
            companyId: defaultUserData.companyId,
            positionId: defaultUserData.positionId,
            avatar: defaultUserData.avatar,
          };
          
          await createUserWithId(firebaseUser.uid, newUser);
          appUser = newUser; // Use the newly created user data.
        }

        setUser(appUser);
        setIsAuthenticated(true);
        
        // Check if the user's role (from the database) is allowed to access the page.
        if (allowedRoles && !allowedRoles.includes(appUser.role)) {
          console.warn(`User with role ${appUser.role} tried to access a page restricted to ${allowedRoles.join(', ')}`);
          // Redirect to home page if not allowed.
          router.push('/'); 
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
