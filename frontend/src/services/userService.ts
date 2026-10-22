import { apiFetch, isApiError } from '@/lib/api-client';
import type { User } from '@/modules/users/types';

export async function getUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export async function getUserById(id: string): Promise<User | undefined> {
  if (!id) return undefined;
  try {
    return await apiFetch<User>(`/users/${id}`);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return undefined;
    }
    console.error(`Error fetching user ${id}`, error);
    throw error;
  }
}

export async function getUsersByCompany(companyId: string): Promise<User[]> {
  if (!companyId) return [];
  return apiFetch<User[]>(`/companies/${companyId}/users`);
}

export interface CompanyMember {
  id: string;
  name: string;
  avatar?: string | null;
}

/** A person as the project pages show them: name and photo only. */
export type PersonSummary = { id: string; name: string; avatar?: string };

/**
 * Everyone in the company as names and photos, for any member (Accountants and
 * Employees included). Project pages use this instead of the full user list,
 * which only Admins and Managers may read.
 */
export async function getCompanyPeople(companyId: string): Promise<PersonSummary[]> {
  const members = await getCompanyMembers(companyId);
  return members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar ?? undefined }));
}

/** Minimal member directory (id/name/avatar) readable by ANY company member —
 *  use for assignee pickers so employees can assign people too. */
export async function getCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  if (!companyId) return [];
  return apiFetch<CompanyMember[]>(`/companies/${companyId}/members`);
}

/** The emailed link to set a password; `link` is there only when the email could not go out. */
export interface PasswordLinkResult { sent: boolean; link?: string }

/** Adds a person; they get an emailed link to set their own password. */
export async function createUser(
  userData: Omit<User, 'id'>,
): Promise<{ user: User; invite: PasswordLinkResult }> {
  return apiFetch<{ user: User; invite: PasswordLinkResult }>('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

/** Emails this person a link to set a new password. */
export function sendPasswordReset(userId: string): Promise<PasswordLinkResult> {
  return apiFetch<PasswordLinkResult>(`/users/${encodeURIComponent(userId)}/password-reset`, { method: 'POST' });
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
): Promise<User> {
  return await apiFetch<User>(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(userData),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await apiFetch(`/users/${userId}`, { method: 'DELETE' });
}
