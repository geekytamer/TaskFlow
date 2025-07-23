
'use server';

import type { User } from '@/modules/users/types';

const placeholderUsers: User[] = [
  { id: '1', name: 'Alice Admin', email: 'alice@innovate.com', role: 'Admin', companyId: '1', positionId: 'pos-2', avatar: 'https://i.pravatar.cc/150?u=1' },
  { id: '2', name: 'Bob Manager', email: 'bob@innovate.com', role: 'Manager', companyId: '1', positionId: 'pos-1', avatar: 'https://i.pravatar.cc/150?u=2' },
  { id: '3', name: 'Charlie Employee', email: 'charlie@innovate.com', role: 'Employee', companyId: '1', positionId: 'pos-3', avatar: 'https://i.pravatar.cc/150?u=3' },
  { id: '4', name: 'Diana Manager', email: 'diana@synergy.com', role: 'Manager', companyId: '2', positionId: 'pos-4', avatar: 'https://i.pravatar.cc/150?u=4' },
  { id: '5', name: 'Ethan Employee', email: 'ethan@synergy.com', role: 'Employee', companyId: '2', positionId: 'pos-5', avatar: 'https://i.pravatar.cc/150?u=5' },
];

export async function getUsers(): Promise<User[]> {
    // In a real app, you would fetch this from your database.
    return Promise.resolve(placeholderUsers);
}

export async function getUserById(id: string): Promise<User | undefined> {
    return Promise.resolve(placeholderUsers.find(u => u.id === id));
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
    return Promise.resolve(placeholderUsers.filter(u => u.companyId === companyId));
}

// In a real app, you'd have a way to get the current authenticated user.
// For now, we'll just return the first user as a mock.
export async function getCurrentUser(): Promise<User> {
    return Promise.resolve(placeholderUsers[0]);
}
