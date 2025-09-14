
'use server';

import type { User } from '@/modules/users/types';
import { db, auth } from '@/lib/firebase';
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
        throw error;
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

// This function is intended to be called from a client component that has access
// to the Firebase auth state. It is not a reliable way to get the "current" user
// on the server, as the server is stateless. The useAuthGuard hook is the
// correct way to manage user sessions on the client.
export async function getCurrentUser(): Promise<User | null> {
    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
        const user = await getUserById(firebaseUser.uid);
        return user || null;
    }
    return null;
}
