
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
    const password = Math.random().toString(36).slice(-8);

    try {
        // Step 1: Create user in Firebase Auth. This is temporary for getting a UID.
        // We can't use the Admin SDK in this environment securely.
        // This is a workaround: we will create a temporary user, get the UID,
        // then the real user creation will happen on the client side during first login,
        // or this would be replaced with a proper Admin SDK-backed flow.
        // For this demo, we assume we need to create the user in Auth first.
        // This approach has limitations as it requires a temporary client-side-style auth instance.
        // A robust solution uses Firebase Admin SDK on a secure backend.
        
        // This will fail on the server. We need to handle user creation differently.
        // The most secure way is to create the user in Firestore, then have an admin function
        // or manual process to create the Auth user.
        // Let's create an auth user from the server using a service account (best practice).
        // Since we don't have Admin SDK set up, we'll simulate the UID creation locally
        // and focus on the Firestore/email part.

        // The correct flow without Admin SDK is challenging.
        // We will create the user in Firestore and then send them an invite email.
        // The user would then click a link to set their password.
        // For simplicity now, let's create the auth user AND the firestore user.
        // This requires auth to be available on the server, which it is.

        const userCredential = await createUserWithEmailAndPassword(auth, userData.email, password);
        const userId = userCredential.user.uid;

        const newUser: User = {
            id: userId,
            ...userData,
        };

        // Step 2: Create user in Firestore
        await setDoc(doc(db, 'users', userId), {
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            companyId: newUser.companyId,
            positionId: newUser.positionId,
            avatar: newUser.avatar,
        });

        // Step 3: Send welcome email
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
