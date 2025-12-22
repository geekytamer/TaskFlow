import { apiFetch } from '@/lib/api-client';
import type { User } from '@/modules/users/types';

export async function getUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export async function getUserById(id: string): Promise<User | undefined> {
  if (!id) return undefined;
  try {
    return await apiFetch<User>(`/users/${id}`);
  } catch (error) {
    console.error(`Error fetching user ${id}`, error);
    return undefined;
  }
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
  if (!companyId) return [];
  return apiFetch<User[]>(`/companies/${companyId}/users`);
}

export async function createUser(
  userData: Omit<User, 'id'>,
): Promise<{ user: User; password: string }> {
  const password = Math.random().toString(36).slice(-8);
  const { user } = await apiFetch<{ user: User }>('/users', {
    method: 'POST',
    body: JSON.stringify({ ...userData, password }),
  });
  return { user, password };
}

export async function createUserWithId(
  userId: string,
  userData: Omit<User, 'id'> & { password?: string },
): Promise<{ user: User; password: string }> {
  const password = userData.password ?? Math.random().toString(36).slice(-8);
  const { user } = await apiFetch<{ user: User }>('/users', {
    method: 'POST',
    body: JSON.stringify({ ...userData, id: userId, password }),
  });
  return { user, password };
}

export async function updateUser(
  userId: string,
  userData: Partial<Omit<User, 'id'>>,
): Promise<User | undefined> {
  try {
    return await apiFetch<User>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  } catch (error) {
    console.error(`Error updating user ${userId}`, error);
    return undefined;
  }
}

export async function deleteUser(userId: string): Promise<void> {
  await apiFetch(`/users/${userId}`, { method: 'DELETE' });
}
