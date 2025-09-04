
'use server';

import type { User } from '@/modules/users/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, where, addDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';


export async function getUsers(): Promise<User[]> {
    try {
        const usersCol = collection(db, 'users');
        const userSnapshot = await getDocs(usersCol);
        const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        return userList;
    } catch (error) {
        console.error("Error fetching users: ", error);
        throw new Error("Could not fetch users from Firestore.");
    }
}

export async function getUserById(id: string): Promise<User | undefined> {
    if (!id) return undefined;
    try {
        const userDoc = await getDoc(doc(db, 'users', id));
        if (!userDoc.exists()) {
            // This is not an error, the user might not exist.
            console.warn(`User with id ${id} not found in Firestore.`);
            return undefined;
        }
        return { id: userDoc.id, ...userDoc.data() } as User;
    } catch (error) {
        console.error(`Error fetching user with ID ${id}: `, error);
        // Instead of throwing, we return undefined to prevent app crash
        return undefined;
    }
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
     if (!companyId) return [];
    try {
        const q = query(collection(db, 'users'), where('companyId', '==', companyId));
        const querySnapshot = await getDocs(q);
        const userList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        return userList;
    } catch (error)
    {
        console.error(`Error fetching users for company ID ${companyId}: `, error);
        throw new Error("Could not fetch users from Firestore.");
    }
}


export async function createUser(userData: Omit<User, 'id'>): Promise<User> {
    try {
        const docRef = await addDoc(collection(db, 'users'), userData);
        return { id: docRef.id, ...userData };
    } catch (error) {
        console.error("Error creating user: ", error);
        throw new Error("Could not create user in Firestore.");
    }
}

export async function createUserWithId(userId: string, userData: Omit<User, 'id'>): Promise<User> {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, userData);
        return { id: userId, ...userData };
    } catch (error) {
        console.error("Error creating user with ID: ", error);
        throw new Error("Could not create user in Firestore.");
    }
}

export async function updateUser(userId: string, userData: Partial<Omit<User, 'id'>>): Promise<User | undefined> {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, userData);
        const updatedDoc = await getDoc(userRef);
        if (!updatedDoc.exists()) return undefined;
        return { id: updatedDoc.id, ...updatedDoc.data() } as User;
    } catch (error) {
        console.error(`Error updating user with ID ${userId}: `, error);
        throw new Error("Could not update user in Firestore.");
    }
}

export async function deleteUser(userId: string): Promise<void> {
    try {
        await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
        console.error(`Error deleting user with ID ${userId}: `, error);
        throw new Error("Could not delete user from Firestore.");
    }
}

// In a real app, you'd have a way to get the current authenticated user from a session.
// For now, we'll just return a hardcoded user as a mock.
export async function getCurrentUser(): Promise<User | null> {
    // This is a mock implementation. In a real app, you would get the
    // authenticated user's ID from the session/token.
    try {
        // This should be the ID of the currently authenticated Firebase user.
        // It's a placeholder because this is a server function and doesn't know
        // the client-side auth state. The real logic is in useAuthGuard.
        const mockUserId = 'user-1'; 
        const user = await getUserById(mockUserId); 
        
        if (user) {
            return user;
        }
        
        // This is a fallback to prevent app crashes if the database is not seeded.
        console.warn("Mock user 'user-1' not found in Firestore. Please seed the database. Falling back to a hardcoded admin user.");
        return {
            id: 'admin-user',
            name: 'System Admin',
            email: 'admin@taskflow.com',
            role: 'Admin' as const,
            companyId: '1', // Default company, admin has access to all anyway
            avatar: `https://i.pravatar.cc/150?u=admin@taskflow.com`
        };

    } catch (e) {
        console.error("Error fetching current user, falling back to admin mock", e);
         return {
            id: 'admin-user',
            name: 'System Admin',
            email: 'admin@taskflow.com',
            role: 'Admin' as const,
            companyId: '1', 
            avatar: `https://i.pravatar.cc/150?u=admin@taskflow.com`
        };
    }
}
