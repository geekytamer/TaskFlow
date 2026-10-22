'use client';

import {
  apiFetch,
  clearStoredToken,
  getStoredToken,
  isApiError,
  setStoredToken,
} from '@/lib/api-client';
import type { User } from '@/modules/users/types';

interface AuthResponse {
  token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(data.token);
  return data;
}

export async function logout() {
  const token =
    getStoredToken() || process.env.SERVICE_API_TOKEN || process.env.NEXT_PUBLIC_SERVICE_API_TOKEN;
  clearStoredToken();

  if (!token) return;

  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.warn('Failed to notify backend about logout', error);
  }
}

export async function fetchCurrentUser(): Promise<User | null> {
  const token =
    getStoredToken() || process.env.SERVICE_API_TOKEN || process.env.NEXT_PUBLIC_SERVICE_API_TOKEN;

  if (!token) return null;

  try {
    const { user } = await apiFetch<{ user: User }>('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return user;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      clearStoredToken();
      return null;
    }
    console.error('Failed to fetch current user', error);
    return null;
  }
}

export async function updateCurrentUser(input: { name?: string; avatar?: string }): Promise<User> {
  const { user } = await apiFetch<{ user: User }>('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  window.dispatchEvent(new Event('taskflow-token-changed'));
  return user;
}

/** "Forgot password": always answers the same, whether or not the address has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

/** What a set-password link is for and whose it is; throws when it expired or was used. */
export function checkPasswordLink(token: string) {
  return apiFetch<{ purpose: 'invite' | 'reset'; name: string; email: string }>(
    `/auth/password-token?token=${encodeURIComponent(token)}`,
  );
}

/** Sets the password from a link and signs in on this device. */
export async function setPasswordWithLink(token: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>('/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  setStoredToken(data.token);
  return data;
}

/** Changes the signed-in person's password; their other devices are signed out. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
}
