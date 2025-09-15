
'use server';

import type { User } from '@/modules/users/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, where, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { sendWelcomeEmail } from '@/ai/flows/send-welcome-email';

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
            console.warn(`User with id ${id} not found in Firestore.`);
            return undefined;
        }
        return { id: userDoc.id, ...userDoc.data() } as User;
    } catch (error) {
        console.error(`Error fetching user with ID ${id}: `, error);
        return undefined;
    }
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
     if (!companyId) return [];
    try {
        const q = query(collection(db, 'users'), where('companyIds', 'array-contains', companyId));
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
    const password = Math.random().toString(36).slice(-8);

    try {
        // This flow creates an Auth user, then creates a matching Firestore user document,
        // and finally sends a welcome email with the generated password.
        
        const userCredential = await createUserWithEmailAndPassword(auth, userData.email, password);
        const userId = userCredential.user.uid;

        const newUser: User = {
            id: userId,
            ...userData,
        };

        await setDoc(doc(db, 'users', userId), {
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            companyIds: newUser.companyIds,
            positionId: newUser.positionId,
            avatar: newUser.avatar,
        });

        await sendWelcomeEmail({
            name: newUser.name,
            email: newUser.email,
            password: password,
        });

        return newUser;

    } catch (error: any) {
        console.error("Error creating user:", error);
        if (error.code === 'auth/email-already-in-use') {
             throw new Error("A user with this email address already exists.");
        }
        throw new Error("Could not create user.");
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
        // Note: This does not delete the user from Firebase Authentication.
        // That would require the Admin SDK.
        await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
        console.error(`Error deleting user with ID ${userId}: `, error);
        throw new Error("Could not delete user from Firestore.");
    }
}
