'use client';

import { apiFetch, clearStoredToken, getStoredToken, setStoredToken } from '@/lib/api-client';
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
    clearStoredToken();
    console.error('Failed to fetch current user', error);
    return null;
  }
}
