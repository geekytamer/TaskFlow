
'use server';

import type { User } from '@/modules/users/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';


export async function getUsers(): Promise<User[]> {
    const usersCol = collection(db, 'users');
    const userSnapshot = await getDocs(usersCol);
    const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    return userList;
}

export async function getUserById(id: string): Promise<User | undefined> {
    if (!id) return undefined;
    const userDoc = await getDoc(doc(db, 'users', id));
    if (!userDoc.exists()) {
        return undefined;
    }
    return { id: userDoc.id, ...userDoc.data() } as User;
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
    const q = query(collection(db, 'users'), where('companyId', '==', companyId));
    const querySnapshot = await getDocs(q);
    const userList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    return userList;
}

// In a real app, you'd have a way to get the current authenticated user from a session.
// For now, we'll just return a hardcoded user as a mock.
export async function getCurrentUser(): Promise<User> {
    const user = await getUserById('1'); // Mocking user with ID '1'
    if (!user) {
        // This is a fallback and should not happen if your DB is seeded.
        return {
            id: '1',
            name: 'Fallback Admin',
            email: 'admin@taskflow.com',
            role: 'Admin',
            companyId: '1',
            avatar: 'https://i.pravatar.cc/150?u=1'
        };
    }
    return user;
}
